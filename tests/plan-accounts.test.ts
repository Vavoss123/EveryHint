import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { ChatGptAccounts } from "../src/main/ai/plan/accounts";
import { PlanHttpError } from "../src/main/ai/plan/http";
import { deferred } from "./helpers";
import { clientId, MemoryVault, registration, tokens } from "./plan-fixtures";

const homes: string[] = [],
  actors: ChatGptAccounts[] = [];
async function setup(saved = false) {
  const home = await mkdtemp(join(tmpdir(), "everyhint-plan-test-"));
  homes.push(home);
  const vault = new MemoryVault();
  if (saved)
    vault.value = JSON.stringify({
      version: 1,
      hostId: "urn:uuid:11bc9390-8d59-4000-a000-000000000001",
      selected: registration().id,
      registrations: [registration()],
    });
  const session = {
    tokens: tokens(),
    subject: "fixture-person",
    email: "fixture@example.invalid",
  };
  const oauth = {
    exchange: vi.fn(async () => session),
    refresh: vi.fn(async () => ({
      ...session,
      tokens: tokens({
        accessToken: "rotated-access",
        refreshToken: "rotated-refresh",
      }),
    })),
    revoke: vi.fn(async () => true),
  };
  const browser = vi.fn(async (_url: string) => {
    void _url;
  });
  const changed = vi.fn();
  const account = new ChatGptAccounts(home, changed, browser, { vault, oauth });
  actors.push(account);
  await account.restore();
  const callback = (url = browser.mock.calls.at(-1)![0]) => {
    const authorization = new URL(url),
      redirect = new URL(authorization.searchParams.get("redirect_uri")!);
    redirect.search = new URLSearchParams({
      state: authorization.searchParams.get("state")!,
      code: "synthetic-code",
      client_id:
        authorization.searchParams.get("client_id") === "dynamic_agent_client"
          ? clientId
          : authorization.searchParams.get("client_id")!,
    }).toString();
    return redirect;
  };
  return { home, vault, oauth, browser, account, changed, callback, session };
}
afterEach(async () => {
  for (const actor of actors.splice(0)) actor.dispose();
  for (const path of homes.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Invalid test directory.");
    await rm(path, {
      recursive: true,
      force: true,
      maxRetries: 4,
      retryDelay: 50,
    });
  }
});
describe("ChatGPT registration lifecycle", () => {
  it("restores only from OS storage and never starts browser, refresh, models or inference automatically", async () => {
    const s = await setup(true);
    expect(s.account.value.state).toBe("signed-in");
    expect(s.account.value.planUsage).toBe(true);
    expect(s.browser).not.toHaveBeenCalled();
    expect(s.oauth.exchange).not.toHaveBeenCalled();
    expect(s.oauth.refresh).not.toHaveBeenCalled();
    expect(s.oauth.revoke).not.toHaveBeenCalled();
    expect(JSON.stringify(s.account.value)).not.toContain("synthetic-access");
    expect(JSON.stringify(s.account.value)).not.toContain("synthetic-refresh");
    expect(JSON.stringify(s.account.value)).not.toContain("oaiapp_");
  });
  it("binds a validated callback to its registration, stores tokens only in the vault and persists only a public host ID", async () => {
    const s = await setup();
    await s.account.signIn();
    expect(s.account.value.state).toBe("signing-in");
    expect((await fetch(s.callback())).status).toBe(200);
    expect(s.account.value.state).toBe("signed-in");
    expect(s.account.value.planUsage).toBe(true);
    expect(s.vault.value).toContain("synthetic-access");
    expect(await readdir(s.home)).toEqual(["host-id"]);
    expect(await readFile(join(s.home, "host-id"), "utf8")).toMatch(
      /^urn:uuid:/,
    );
  });
  it("rejects incorrect state before exchanging any token", async () => {
    const s = await setup();
    await s.account.signIn();
    const url = s.callback();
    url.searchParams.set("state", "wrong");
    expect((await fetch(url)).status).toBe(400);
    expect(s.oauth.exchange).not.toHaveBeenCalled();
    expect(s.vault.value).toBeNull();
  });
  it("reports denied consent and closes the callback without token exchange", async () => {
    const s = await setup();
    await s.account.signIn();
    const url = s.callback();
    url.searchParams.delete("code");
    url.searchParams.set("error", "access_denied");
    expect((await fetch(url)).status).toBe(400);
    expect(s.account.value.state).toBe("error");
    expect(s.account.value.message).toContain("declined");
    expect(s.oauth.exchange).not.toHaveBeenCalled();
  });
  it("keeps identity-only sign-in blocked and supports explicit plan re-consent", async () => {
    const s = await setup();
    s.session.tokens = tokens({ scopes: ["openid", "profile"] });
    await s.account.signIn();
    await fetch(s.callback());
    expect(s.account.value.planUsage).toBe(false);
    await expect(s.account.token(new AbortController().signal)).rejects.toThrow(
      "grant plan permission",
    );
    await s.account.signIn(true);
    const url = new URL(s.browser.mock.calls.at(-1)![0]);
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("client_id")).toBe(clientId);
  });
  it("reuses installation/client identity after sign-out without retaining token hints", async () => {
    const s = await setup();
    await s.account.signIn();
    const first = new URL(s.browser.mock.calls[0]![0]);
    await fetch(s.callback());
    await s.account.signOut();
    expect(s.vault.value).not.toContain("synthetic-access");
    expect(s.vault.value).not.toContain("synthetic-refresh");
    expect(s.account.value.accounts).toHaveLength(1);
    await s.account.signIn();
    const second = new URL(s.browser.mock.calls.at(-1)![0]);
    expect(second.searchParams.get("ext_agent_host_id")).toBe(
      first.searchParams.get("ext_agent_host_id"),
    );
    expect(second.searchParams.get("client_id")).toBe(clientId);
    expect(second.searchParams.has("id_token_hint")).toBe(false);
  });
  it("preserves the previous account on cancellation and rejects late callback results", async () => {
    const s = await setup(true),
      pending = deferred<typeof s.session>();
    s.oauth.exchange.mockImplementation(() => pending.promise);
    await s.account.signIn();
    const request = fetch(s.callback()).catch(() => null);
    await vi.waitFor(() => expect(s.oauth.exchange).toHaveBeenCalled());
    s.account.cancel();
    pending.resolve({
      ...s.session,
      tokens: tokens({ accessToken: "late-access" }),
    });
    await request;
    await new Promise((resolve) => setImmediate(resolve));
    expect(s.account.registration?.tokens?.accessToken).toBe(
      "synthetic-access-only",
    );
    expect(s.vault.value).not.toContain("late-access");
  });
  it("serializes refresh and atomically replaces the rotating tokens only on an explicit operation", async () => {
    const s = await setup(true);
    s.account.registration!.tokens!.expiresAt = Date.now() - 1;
    const [a, b] = await Promise.all([
      s.account.token(new AbortController().signal),
      s.account.token(new AbortController().signal),
    ]);
    expect(a).toBe("rotated-access");
    expect(b).toBe(a);
    expect(s.oauth.refresh).toHaveBeenCalledTimes(1);
    expect(s.vault.value).toContain("rotated-refresh");
  });
  it("preserves tokens on transient refresh errors, and clears expired/revoked grants without deleting registration", async () => {
    const s = await setup(true);
    s.account.registration!.tokens!.expiresAt = 1;
    s.oauth.refresh.mockRejectedValueOnce(
      new PlanHttpError(
        503,
        "subscription_sharing_user_unavailable",
        null,
        "Temporary failure.",
      ),
    );
    await expect(s.account.token(new AbortController().signal)).rejects.toThrow(
      "Temporary",
    );
    expect(s.account.registration!.tokens).not.toBeNull();
    s.oauth.refresh.mockRejectedValueOnce(
      new PlanHttpError(400, "invalid_grant", null, "Session expired."),
    );
    await expect(s.account.token(new AbortController().signal)).rejects.toThrow(
      "expired",
    );
    expect(s.account.registration!.tokens).toBeNull();
    expect(s.account.value.accounts).toHaveLength(1);
    expect(s.vault.value).toContain(clientId);
  });
  it("does not publish a refreshed token after account selection changes", async () => {
    const s = await setup(true),
      pending = deferred<typeof s.session>();
    s.account.registration!.tokens!.expiresAt = 1;
    s.oauth.refresh.mockImplementation(() => pending.promise);
    const result = s.account.token(new AbortController().signal);
    await s.account.select("new");
    pending.resolve(s.session);
    await expect(result).rejects.toThrow("changed");
    expect(s.account.value.selectedAccount).toBeNull();
    expect(s.vault.value).not.toContain("rotated");
  });
  it("distinguishes registrations with the same email and reconnects only the selected one", async () => {
    const s = await setup(true);
    await s.account.select("new");
    await s.account.signIn();
    const url = s.callback();
    url.searchParams.set("client_id", "oaiapp_second_fixture");
    await fetch(url);
    expect(s.account.value.accounts).toHaveLength(2);
    expect(new Set(s.account.value.accounts!.map((item) => item.id)).size).toBe(
      2,
    );
    await s.account.select(registration().id);
    await s.account.signIn();
    expect(
      new URL(s.browser.mock.calls.at(-1)![0]).searchParams.get("client_id"),
    ).toBe(clientId);
  });
  it("clears local tokens even if remote revocation cannot be confirmed", async () => {
    const s = await setup(true);
    s.oauth.revoke.mockResolvedValue(false);
    await s.account.signOut();
    expect(s.account.value.state).toBe("signed-out");
    expect(s.account.value.message).toContain("could not be confirmed");
    expect(s.vault.value).not.toContain("synthetic-access");
  });
  it("fails visibly if the OS credential store cannot be read; no browser or plaintext fallback", async () => {
    const s = await setup();
    s.vault.read = async () => {
      throw new Error("synthetic-secret-error");
    };
    const actor = new ChatGptAccounts(s.home, s.changed, s.browser, {
      vault: s.vault,
      oauth: s.oauth,
    });
    actors.push(actor);
    await actor.restore();
    expect(actor.value.state).toBe("error");
    expect(actor.value.message).not.toContain("synthetic-secret-error");
    await expect(actor.signIn()).rejects.toThrow("unavailable");
    expect(s.browser).not.toHaveBeenCalled();
  });
});
