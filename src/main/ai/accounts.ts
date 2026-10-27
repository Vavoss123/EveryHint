import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import type { AccountConnection } from "../../shared/accounts";
import { codexExecutable, localCodexLogin } from "./codex";
import { baseEnvironment } from "./environment";

export interface LoginRuntime {
  status(): Promise<string>;
  launch(action: "login" | "logout"): ChildProcess;
}
export function codexLoginRuntime(
  home: string,
  launch: typeof spawn = spawn,
): LoginRuntime {
  return {
    status: () => localCodexLogin(home),
    launch: (action) =>
      launch(
        codexExecutable(),
        [
          "-c",
          'cli_auth_credentials_store="keyring"',
          "-c",
          'forced_login_method="chatgpt"',
          action,
        ],
        {
          // A dedicated CODEX_HOME gives EveryHint its own native credential-store identity.
          env: { ...baseEnvironment(), CODEX_HOME: home },
          cwd: home,
          windowsHide: true,
          shell: false,
          stdio: "ignore",
        },
      ),
  };
}

export class AccountConnections {
  private snapshot: AccountConnection = {
    revision: 0,
    state: "signed-out",
    message: "Sign in with ChatGPT to connect this installation of EveryHint.",
  };
  private generation = 0;
  private closed = false;
  private active:
    | {
        generation: number;
        child?: ChildProcess;
        timer?: ReturnType<typeof setTimeout>;
        finish: () => void;
      }
    | undefined;
  private inspecting: Promise<string> | undefined;
  constructor(
    private readonly home: string,
    private readonly changed: (value: AccountConnection) => void,
    private readonly runtime: LoginRuntime = codexLoginRuntime(home),
    private readonly loginTimeoutMs = 5 * 60000,
  ) {}
  get value(): AccountConnection {
    return { ...this.snapshot };
  }
  private update(state: AccountConnection["state"], message: string): void {
    if (this.closed) return;
    this.snapshot = { revision: this.snapshot.revision + 1, state, message };
    this.changed(this.value);
  }
  async status(): Promise<string> {
    if (this.closed) throw new Error("Account connection is closed.");
    if (this.inspecting) return this.inspecting;
    const generation = this.generation;
    this.inspecting = mkdir(this.home, { recursive: true })
      .then(() => this.runtime.status())
      .then((status) => {
        if (!this.active && !this.closed && generation === this.generation) {
          if (/logged in using chatgpt/i.test(status))
            this.update(
              "signed-in",
              "Signed in with ChatGPT. This connection belongs to EveryHint.",
            );
          else
            this.update(
              "signed-out",
              "Sign in with ChatGPT to connect this installation of EveryHint.",
            );
        }
        return status;
      })
      .catch(() => {
        if (!this.active && generation === this.generation)
          this.update(
            "error",
            "Could not check ChatGPT sign-in. The official CLI and operating-system credential store must be available.",
          );
        throw new Error("Could not check the EveryHint ChatGPT connection.");
      })
      .finally(() => {
        this.inspecting = undefined;
      });
    return this.inspecting;
  }
  async signIn(): Promise<void> {
    // Switching is an explicit sign-out of this app's account before the new flow.
    if (this.snapshot.state === "signed-in") {
      await this.run("logout");
      if (this.value.state !== "signed-out") return;
    }
    await this.run("login");
  }
  signOut(): Promise<void> {
    return this.run("logout");
  }
  private async run(action: "login" | "logout"): Promise<void> {
    if (this.closed) throw new Error("Account connection is closed.");
    if (this.active)
      throw new Error("A ChatGPT account operation is already active.");
    const generation = ++this.generation;
    let finish!: () => void;
    const finished = new Promise<void>((done) => {
      finish = done;
    });
    const active: NonNullable<AccountConnections["active"]> = {
      generation,
      finish,
    };
    this.active = active;
    this.update(
      action === "login" ? "signing-in" : "signing-out",
      action === "login"
        ? "Complete sign-in in the official ChatGPT browser window. EveryHint never sees your password."
        : "Signing out of EveryHint’s ChatGPT connection…",
    );
    try {
      // Reserve before asynchronous filesystem work, preventing repeated login clicks.
      await mkdir(this.home, { recursive: true });
      if (!this.current(generation)) return;
      active.child = this.runtime.launch(action);
      active.timer = setTimeout(
        () => {
          if (!this.current(generation)) return;
          this.active = undefined;
          ++this.generation;
          active.child?.kill("SIGKILL");
          this.update(
            "error",
            action === "login"
              ? "ChatGPT sign-in timed out. Try signing in again."
              : "ChatGPT sign-out timed out. Check the connection before retrying.",
          );
          finish();
        },
        action === "login" ? this.loginTimeoutMs : 10000,
      );
      active.child.once("error", () =>
        this.failed(
          generation,
          "The official ChatGPT sign-in process could not start. Check the SDK installation.",
        ),
      );
      active.child.once("exit", (code) => {
        if (!this.current(generation)) return;
        if (code !== 0) {
          this.failed(
            generation,
            "ChatGPT account connection did not complete. Retry sign-in; the operating-system credential store is required.",
          );
          return;
        }
        void this.verify(generation, action);
      });
      await finished;
    } catch {
      this.failed(
        generation,
        "Could not start ChatGPT account connection. Check the SDK installation and local data directory.",
      );
    }
  }
  private async verify(
    generation: number,
    action: "login" | "logout",
  ): Promise<void> {
    try {
      // Wait out any older read before verifying this completed account operation.
      if (this.inspecting) await this.inspecting.catch(() => {});
      if (!this.current(generation)) return;
      const status = await this.runtime.status();
      if (!this.current(generation)) return;
      const signedIn = /logged in using chatgpt/i.test(status);
      if (signedIn !== (action === "login")) {
        this.failed(
          generation,
          "The official CLI did not confirm the requested ChatGPT account change. Check the connection and retry.",
        );
        return;
      }
      const active = this.active!;
      clearTimeout(active.timer);
      this.active = undefined;
      this.update(
        signedIn ? "signed-in" : "signed-out",
        signedIn
          ? "Signed in with ChatGPT. Credentials are managed by the official CLI in your operating-system credential store."
          : "Signed out of EveryHint. Your other Codex and IDE connections were not changed.",
      );
      active.finish();
    } catch {
      this.failed(
        generation,
        "ChatGPT account change could not be verified. Check the connection.",
      );
    }
  }
  private current(generation: number): boolean {
    return !this.closed && this.active?.generation === generation;
  }
  private failed(generation: number, message: string): void {
    if (!this.current(generation)) return;
    const active = this.active!;
    this.active = undefined;
    clearTimeout(active.timer);
    active.child?.kill("SIGKILL");
    this.update("error", message);
    active.finish();
  }
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    ++this.generation;
    clearTimeout(active.timer);
    active.child?.kill("SIGKILL");
    this.update(
      "cancelled",
      "Account connection cancelled. Use Check connection to confirm the stored sign-in state.",
    );
    active.finish();
  }
  dispose(): void {
    this.cancel();
    this.closed = true;
  }
}
