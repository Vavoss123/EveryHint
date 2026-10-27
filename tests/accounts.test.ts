import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountConnections, codexLoginRuntime } from "../src/main/ai/accounts";
import { deferred } from "./helpers";

class LoginChild extends EventEmitter {
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}
const cleanups: { connection: AccountConnections; root: string }[] = [];
async function setup(timeout = 300000) {
  const root = await mkdtemp(join(tmpdir(), "everyhint-account-test-"));
  const children: LoginChild[] = [];
  const runtime = {
    status: vi.fn(async () => "Not logged in"),
    launch: vi.fn((_action: "login" | "logout") => {
      void _action;
      const child = new LoginChild();
      children.push(child);
      return child as unknown as ChildProcess;
    }),
  };
  const changed = vi.fn();
  const connection = new AccountConnections(root, changed, runtime, timeout);
  cleanups.push({ connection, root });
  const launched = async (count = 1) => {
    await vi.waitFor(() => expect(children).toHaveLength(count));
    return children[count - 1]!;
  };
  return { root, children, runtime, connection, changed, launched };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const { connection, root } of cleanups.splice(0)) {
    connection.dispose();
    if (resolve(root).startsWith(resolve(tmpdir()) + sep))
      await rm(root, { recursive: true, force: true });
  }
});
describe("official per-installation ChatGPT login", () => {
  it("never launches a browser or agent on construction or status inspection", async () => {
    const s = await setup();
    expect(s.runtime.status).not.toHaveBeenCalled();
    await s.connection.status();
    expect(s.connection.value.state).toBe("signed-out");
    expect(s.runtime.launch).not.toHaveBeenCalled();
  });
  it("launches only fixed official login/logout commands with isolated OS credential storage", async () => {
    const s = await setup();
    vi.stubEnv("CODEX_HOME", "shared-must-not-use");
    vi.stubEnv("OPENAI_API_KEY", "must-not-use");
    vi.stubEnv("CODEX_API_KEY", "must-not-use");
    vi.stubEnv("ANTHROPIC_API_KEY", "must-not-use");
    const launch = vi.fn(() => new LoginChild() as unknown as ChildProcess);
    const runtime = codexLoginRuntime(
      s.root,
      launch as unknown as typeof spawn,
    );
    runtime.launch("login");
    runtime.launch("logout");
    for (const [, args, options] of launch.mock.calls as unknown as [
      string,
      string[],
      {
        env: NodeJS.ProcessEnv;
        shell: boolean;
        windowsHide: boolean;
        stdio: string;
        cwd: string;
      },
    ][]) {
      expect(args).toContain('cli_auth_credentials_store="keyring"');
      expect(args).toContain('forced_login_method="chatgpt"');
      expect(args).not.toContain("exec");
      expect(args).not.toContain("--with-api-key");
      expect(options).toMatchObject({
        shell: false,
        windowsHide: true,
        stdio: "ignore",
        cwd: s.root,
      });
      expect(options.env.CODEX_HOME).toBe(s.root);
      expect(options.env.OPENAI_API_KEY).toBeUndefined();
      expect(options.env.CODEX_API_KEY).toBeUndefined();
      expect(options.env.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });
  it("reports success only when the official status command confirms ChatGPT authentication", async () => {
    const s = await setup();
    s.runtime.status.mockResolvedValue("Logged in using ChatGPT");
    const pending = s.connection.signIn();
    const child = await s.launched();
    expect(s.connection.value.state).toBe("signing-in");
    child.emit("exit", 0, null);
    await pending;
    expect(s.connection.value.state).toBe("signed-in");
    expect(s.runtime.status).toHaveBeenCalledOnce();
    const view = s.connection.value;
    view.message = "changed";
    expect(s.connection.value.message).not.toBe("changed");
  });
  it("does not treat a successful process exit as a successful login without status confirmation", async () => {
    const s = await setup();
    const pending = s.connection.signIn();
    (await s.launched()).emit("exit", 0, null);
    await pending;
    expect(s.connection.value.state).toBe("error");
  });
  it("rejects API authentication as a ChatGPT subscription connection", async () => {
    const s = await setup();
    s.runtime.status.mockResolvedValue("Logged in using an API key - secret");
    const pending = s.connection.signIn();
    (await s.launched()).emit("exit", 0, null);
    await pending;
    expect(s.connection.value.state).toBe("error");
    expect(JSON.stringify(s.connection.value)).not.toContain("secret");
  });
  it("reserves before asynchronous startup and rejects duplicate login operations", async () => {
    const s = await setup();
    const pending = s.connection.signIn();
    await expect(s.connection.signIn()).rejects.toThrow("already active");
    await expect(s.connection.signOut()).rejects.toThrow("already active");
    s.connection.cancel();
    await pending;
    expect(s.runtime.launch.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it("cancels the process and ignores late successful exits, including after another login starts", async () => {
    const s = await setup();
    const first = s.connection.signIn();
    const old = await s.launched();
    s.connection.cancel();
    await first;
    expect(old.killed).toBe(true);
    expect(s.connection.value.state).toBe("cancelled");
    const second = s.connection.signIn();
    const current = await s.launched(2);
    old.emit("exit", 0, null);
    expect(s.connection.value.state).toBe("signing-in");
    s.runtime.status.mockResolvedValue("Logged in using ChatGPT");
    current.emit("exit", 0, null);
    await second;
    expect(s.connection.value.state).toBe("signed-in");
  });
  it("bounds an abandoned login and terminates its child process", async () => {
    const s = await setup(30);
    const pending = s.connection.signIn();
    await pending;
    expect(s.children[0]?.killed).toBe(true);
    expect(s.connection.value).toMatchObject({
      state: "error",
      message: expect.stringContaining("timed out"),
    });
  });
  it.each(["error", "exit"] as const)(
    "maps process %s to safe messages without forwarding stdout, tokens or diagnostics",
    async (event) => {
      const s = await setup();
      const pending = s.connection.signIn();
      const child = await s.launched();
      if (event === "error") child.emit("error", new Error("sensitive-token"));
      else child.emit("exit", 1, null);
      await pending;
      expect(s.connection.value.state).toBe("error");
      expect(JSON.stringify(s.connection.value)).not.toContain(
        "sensitive-token",
      );
    },
  );
  it("verifies sign-out using the same isolated account store", async () => {
    const s = await setup();
    const pending = s.connection.signOut();
    (await s.launched()).emit("exit", 0, null);
    await pending;
    expect(s.runtime.launch).toHaveBeenCalledWith("logout");
    expect(s.connection.value.state).toBe("signed-out");
  });
  it("switches accounts by confirming app-only logout before starting a new browser login", async () => {
    const s = await setup();
    s.runtime.status.mockResolvedValue("Logged in using ChatGPT");
    await s.connection.status();
    const pending = s.connection.signIn();
    const logout = await s.launched();
    expect(s.runtime.launch).toHaveBeenLastCalledWith("logout");
    s.runtime.status.mockResolvedValue("Not logged in");
    logout.emit("exit", 0, null);
    const login = await s.launched(2);
    expect(s.runtime.launch).toHaveBeenLastCalledWith("login");
    s.runtime.status.mockResolvedValue("Logged in using ChatGPT");
    login.emit("exit", 0, null);
    await pending;
    expect(s.connection.value.state).toBe("signed-in");
  });
  it("does not reopen a browser if account switching is cancelled during logout", async () => {
    const s = await setup();
    s.runtime.status.mockResolvedValue("Logged in using ChatGPT");
    await s.connection.status();
    const pending = s.connection.signIn();
    const logout = await s.launched();
    s.connection.cancel();
    await pending;
    expect(logout.killed).toBe(true);
    expect(s.children).toHaveLength(1);
    expect(s.connection.value.state).toBe("cancelled");
  });
  it("deduplicates status inspection and prevents old reads from overriding an active login", async () => {
    const s = await setup();
    const gate = deferred<string>();
    s.runtime.status.mockReturnValueOnce(gate.promise);
    const first = s.connection.status();
    const second = s.connection.status();
    const login = s.connection.signIn();
    await s.launched();
    gate.resolve("Not logged in");
    await first;
    await second;
    expect(s.connection.value.state).toBe("signing-in");
    expect(s.runtime.status).toHaveBeenCalledOnce();
    s.connection.cancel();
    await login;
  });
  it("keeps status errors safe and kills an active login during shutdown", async () => {
    const s = await setup();
    s.runtime.status.mockRejectedValueOnce(new Error("secret-keyring-data"));
    await expect(s.connection.status()).rejects.toThrow("Could not check");
    expect(JSON.stringify(s.connection.value)).not.toContain(
      "secret-keyring-data",
    );
    const pending = s.connection.signIn();
    const child = await s.launched();
    s.connection.dispose();
    await pending;
    expect(child.killed).toBe(true);
    await expect(s.connection.signIn()).rejects.toThrow("closed");
  });
});
