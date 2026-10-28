import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import {
  authorizationUrl,
  callbackCode,
  newAttempt,
  OpenAIOAuth,
  planAllowed,
  RESOURCE,
  SCOPES,
  TOKEN,
  ISSUER,
} from "../src/main/ai/plan/oauth";
import { clientId, grant, json, jwks, registration } from "./plan-fixtures";
import { httpError, planFetch } from "../src/main/ai/plan/http";

const attempt = () =>
  newAttempt(
    "urn:uuid:11bc9390-8d59-4000-a000-000000000001",
    "http://127.0.0.1:45123/auth/callback",
    null,
  );
const signal = () => new AbortController().signal;
describe("official ChatGPT plan OAuth", () => {
  it("uses a fresh PKCE/state/nonce, full plan scopes and stable host for first registration", () => {
    const first = attempt(),
      other = attempt(),
      url = new URL(authorizationUrl(first));
    expect(url.origin + url.pathname).toBe(`${ISSUER}/api/accounts/authorize`);
    expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(url.searchParams.get("agent_name_hint")).toBe("EveryHint");
    expect(url.searchParams.get("ext_agent_host_id")).toBe(first.hostId);
    expect(url.searchParams.get("resource")).toBe(RESOURCE);
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(SCOPES);
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(first.verifier).digest("base64url"),
    );
    expect(first.state).not.toBe(other.state);
    expect(first.nonce).not.toBe(other.nonce);
    expect(first.verifier).not.toBe(other.verifier);
  });
  it("reuses a saved issued client and requests explicit re-consent without force_reconsent", () => {
    const value = { ...attempt(), clientId };
    const url = new URL(authorizationUrl(value, registration(), true));
    expect(url.searchParams.get("client_id")).toBe(clientId);
    expect(url.searchParams.has("agent_name_hint")).toBe(false);
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.has("force_reconsent")).toBe(false);
    expect(url.searchParams.get("id_token_hint")).toBe("synthetic-id-only");
  });
  it("requires a single correct state, issued client and callback origin/path", () => {
    const value = attempt();
    const good = () =>
      new URL(
        `${value.redirectUri}?state=${value.state}&code=fixture&client_id=${clientId}`,
      );
    expect(callbackCode(good(), value)).toEqual({ code: "fixture", clientId });
    for (const mutate of [
      (url: URL) => url.searchParams.set("state", "wrong"),
      (url: URL) => url.searchParams.append("state", value.state),
      (url: URL) => url.searchParams.delete("client_id"),
      (url: URL) => url.searchParams.set("client_id", "dynamic_agent_client"),
      (url: URL) => (url.hostname = "localhost"),
      (url: URL) => (url.pathname = "/other"),
    ]) {
      const url = good();
      mutate(url);
      expect(() => callbackCode(url, value)).toThrow();
    }
    expect(() =>
      callbackCode(good(), { ...value, clientId: "oaiapp_different" }),
    ).toThrow();
    expect(() =>
      callbackCode(
        new URL(
          `${value.redirectUri}?state=${value.state}&error=access_denied`,
        ),
        value,
      ),
    ).toThrow("declined");
  });
  it("verifies signed identity and plan JWT and exchanges the issued client, exact redirect and verifier", async () => {
    const value = attempt(),
      body = await grant(value.nonce);
    const transport = vi.fn(async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body),
    );
    const result = await new OpenAIOAuth(transport).exchange(
      value,
      "fixture-code",
      clientId,
      signal(),
    );
    expect(planAllowed(result.tokens)).toBe(true);
    expect(result.subject).toBe("fixture-person");
    const init = (
      transport.mock.calls as unknown as [string, RequestInit][]
    )[0]![1];
    const form = new URLSearchParams(init.body as string);
    expect(form.get("client_id")).toBe(clientId);
    expect(form.get("redirect_uri")).toBe(value.redirectUri);
    expect(form.get("code_verifier")).toBe(value.verifier);
    expect(form.has("client_secret")).toBe(false);
    expect(form.get("resource")).toBe(RESOURCE);
  });
  it("does not confuse identity-only login with plan permission", async () => {
    const value = attempt(),
      body = await grant(value.nonce, {
        scope: "openid email profile offline_access",
      });
    const transport = async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    expect(
      planAllowed(
        (
          await new OpenAIOAuth(transport).exchange(
            value,
            "code",
            clientId,
            signal(),
          )
        ).tokens,
      ),
    ).toBe(false);
  });
  it("requires a fresh signed ID token and nonce on returning code exchange", async () => {
    const value = { ...attempt(), clientId },
      body: Record<string, unknown> = await grant(value.nonce);
    delete body.id_token;
    const transport = async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    await expect(
      new OpenAIOAuth(transport).exchange(
        value,
        "code",
        clientId,
        signal(),
        registration(),
      ),
    ).rejects.toThrow("token response was invalid");
  });
  it("rejects a matching kid signed by an untrusted private key", async () => {
    const value = attempt(),
      body = await grant(value.nonce),
      { privateKey } = await generateKeyPair("RS256");
    body.id_token = await new SignJWT({
      iss: ISSUER,
      aud: clientId,
      sub: "fixture-person",
      nonce: value.nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .sign(privateKey);
    const transport = async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    await expect(
      new OpenAIOAuth(transport).exchange(value, "code", clientId, signal()),
    ).rejects.toThrow("could not be verified");
  });
  it("can refresh without a new ID token while preserving the verified registration", async () => {
    const body: Record<string, unknown> = await grant();
    delete body.id_token;
    delete body.refresh_token;
    const transport = async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    const result = await new OpenAIOAuth(transport).refresh(
      registration(),
      signal(),
    );
    expect(result.subject).toBe("fixture-person");
    expect(result.tokens.idToken).toBe("synthetic-id-only");
    expect(result.tokens.refreshToken).toBe("synthetic-refresh-only");
  });
  it.each([
    { id: { nonce: "wrong" } },
    { id: { iss: "https://attacker.invalid" } },
    { id: { aud: "other-client" } },
    { id: { exp: 1 } },
    { access: { aud: "https://other.invalid" } },
    { access: { client_id: "other-client" } },
    { access: { sub: "other-person" } },
    { access: { scope: "openid" } },
  ])("rejects invalid signature-bound claims %j", async (options) => {
    const value = attempt(),
      body = await grant(value.nonce, options);
    const transport = async (url: string) =>
      url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    await expect(
      new OpenAIOAuth(transport).exchange(value, "code", clientId, signal()),
    ).rejects.toThrow("could not be verified");
  });
  it("refreshes with the issued client/resource, omits scope and preserves refresh tokens only when omitted", async () => {
    const body = await grant();
    const transport = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      return url.endsWith("jwks.json") ? json(await jwks()) : json(body);
    });
    const result = await new OpenAIOAuth(transport).refresh(
      registration(),
      signal(),
    );
    expect(result.tokens.refreshToken).toBe("synthetic-refresh-only");
    const form = new URLSearchParams(
      transport.mock.calls.find(([url]) => url === TOKEN)![1]!.body as string,
    );
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("client_id")).toBe(clientId);
    expect(form.has("scope")).toBe(false);
  });
  it("rejects refresh that changes the selected account identity", async () => {
    const body = await grant(undefined, {
      id: { sub: "different" },
      access: { sub: "different" },
    });
    await expect(
      new OpenAIOAuth(async (url) =>
        url.endsWith("jwks.json") ? json(await jwks()) : json(body),
      ).refresh(registration(), signal()),
    ).rejects.toThrow("could not be verified");
  });
  it("reloads signing keys once for a new kid", async () => {
    const value = attempt(),
      body = await grant(value.nonce, { kid: "rotated" });
    let count = 0;
    const transport = async (url: string) => {
      if (!url.endsWith("jwks.json")) return json(body);
      count++;
      const keys = await jwks();
      if (count > 1) keys.keys[0]!.kid = "rotated";
      return json(keys);
    };
    expect(
      planAllowed(
        (
          await new OpenAIOAuth(transport).exchange(
            value,
            "code",
            clientId,
            signal(),
          )
        ).tokens,
      ),
    ).toBe(true);
    expect(count).toBe(2);
  });
  it("uses validated official discovery for revocation and never sends tokens to another host", async () => {
    const transport = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      return url.endsWith("openid-configuration")
        ? json({
            issuer: ISSUER,
            revocation_endpoint: `${ISSUER}/api/accounts/oauth/revoke`,
          })
        : new Response(null, { status: 200 });
    });
    expect(
      await new OpenAIOAuth(transport).revoke(registration(), signal()),
    ).toBe(true);
    expect(
      new URLSearchParams(transport.mock.calls[1]![1]!.body as string).get(
        "client_id",
      ),
    ).toBe(clientId);
    const malicious = vi.fn(async () =>
      json({
        issuer: ISSUER,
        revocation_endpoint: "https://attacker.invalid/revoke",
      }),
    );
    expect(
      await new OpenAIOAuth(malicious).revoke(registration(), signal()),
    ).toBe(false);
    expect(malicious).toHaveBeenCalledTimes(1);
  });
  it("returns safe HTTP diagnostics without token-bearing bodies and forbids alternative endpoints", async () => {
    const error = await httpError(
      new Response(
        JSON.stringify({
          error: {
            code: "subscription_sharing_user_not_eligible",
            message: "secret-token-fixture",
          },
        }),
        { status: 403, headers: { "x-request-id": "req_fixture" } },
      ),
    );
    expect(error.code).toBe("permissions");
    expect(error.requestId).toBe("req_fixture");
    expect(error.message).toContain("not_eligible");
    expect(error.message).not.toContain("secret-token-fixture");
    await expect(
      planFetch("https://api.attacker.invalid/v1/responses"),
    ).rejects.toThrow("Unsupported");
    await expect(
      planFetch("https://secret@api.openai.com/v1/responses"),
    ).rejects.toThrow("Unsupported");
  });
});
