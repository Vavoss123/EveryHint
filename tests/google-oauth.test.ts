import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  GOOGLE_SCOPES,
  GoogleOAuth,
  googleAttempt,
  googleAuthorizationUrl,
  googleCallback,
  googleLoopback,
  validateGoogleScopes,
} from "../src/main/google/oauth";
import { GoogleAccount } from "../src/main/google/accounts";
import { googleFetch, GoogleError } from "../src/main/google/http";
const clientId = "fixture-desktop.apps.googleusercontent.com";
const attempt = () =>
  googleAttempt(clientId, "calendar", "http://127.0.0.1:12345/oauth2/callback");
describe("P10 official Google desktop OAuth boundary", () => {
  it("uses external Google code flow, random state/nonce and S256 PKCE without write scopes or a client secret", () => {
    const a = attempt(),
      b = attempt(),
      url = new URL(googleAuthorizationUrl(a));
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(a.verifier).digest("base64url"),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.get("scope")!.split(" ")).toEqual(
      GOOGLE_SCOPES.calendar,
    );
  });
  it("keeps Contacts permission separate and never requests contact writes", () => {
    const a = googleAttempt(
        clientId,
        "contacts",
        "http://127.0.0.1:12345/oauth2/callback",
      ),
      url = new URL(googleAuthorizationUrl(a));
    expect(url.searchParams.get("scope")).toContain("contacts.readonly");
    expect(url.searchParams.get("scope")).not.toContain("calendar");
  });
  it.each([
    "https://127.0.0.1:123/oauth2/callback",
    "http://evil.test:123/oauth2/callback",
    "http://127.0.0.1/oauth2/callback",
  ])("rejects unsupported redirect %s", (url) =>
    expect(() => googleAttempt(clientId, "calendar", url)).toThrow(),
  );
  it("rejects missing Desktop client configuration", () =>
    expect(() =>
      googleAttempt("", "calendar", "http://127.0.0.1:123/oauth2/callback"),
    ).toThrow("Configure"));
  it("validates state, duplicate parameters, redirect binding and permission denial", () => {
    const a = attempt(),
      url = new URL(a.redirectUri);
    url.search = new URLSearchParams({
      state: a.state,
      code: "fixture-code",
    }).toString();
    expect(googleCallback(url, a)).toBe("fixture-code");
    url.searchParams.append("state", a.state);
    expect(() => googleCallback(url, a)).toThrow("state");
    url.searchParams.delete("state");
    url.searchParams.set("state", "foreign");
    expect(() => googleCallback(url, a)).toThrow();
    url.searchParams.set("state", a.state);
    url.searchParams.set("error", "access_denied");
    expect(() => googleCallback(url, a)).toThrow("declined");
  });
  it("requires exact role scopes and rejects permission escalation", () => {
    expect(
      validateGoogleScopes(GOOGLE_SCOPES.calendar.join(" "), "calendar"),
    ).toEqual(GOOGLE_SCOPES.calendar);
    expect(() =>
      validateGoogleScopes(
        [
          ...GOOGLE_SCOPES.calendar,
          "https://www.googleapis.com/auth/calendar",
        ].join(" "),
        "calendar",
      ),
    ).toThrow("broader");
    expect(() =>
      validateGoogleScopes(GOOGLE_SCOPES.contacts.join(" "), "calendar"),
    ).toThrow();
  });
  it("handles a genuine local loopback listener without a browser or Google network request", async () => {
    let invalidStatus = 0;
    const result = await googleLoopback(
      clientId,
      "calendar",
      async (auth) => {
        const url = new URL(auth),
          callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.search = new URLSearchParams({
          state: "invalid",
          code: "bad",
        }).toString();
        invalidStatus = (await fetch(callback)).status;
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set("code", "local-fixture");
        expect((await fetch(callback)).status).toBe(200);
      },
      new AbortController().signal,
    );
    expect(invalidStatus).toBe(400);
    expect(result.code).toBe("local-fixture");
  });
  it("cancels a loopback attempt and closes its listener", async () => {
    const abort = new AbortController();
    const pending = googleLoopback(
      clientId,
      "calendar",
      async () => {
        abort.abort();
      },
      abort.signal,
    );
    await expect(pending).rejects.toThrow("cancelled");
  });
  it("validates Google JWT signatures/issuer/audience/nonce and refreshes scoped tokens", async () => {
    const pair = await generateKeyPair("RS256"),
      jwk = await exportJWK(pair.publicKey),
      a = attempt();
    jwk.kid = "fixture";
    const jwt = await new SignJWT({
      nonce: a.nonce,
      email: "test@example.test",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer("https://accounts.google.com")
      .setAudience(clientId)
      .setSubject("google-fixture")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
    const calls: { url: string; body: URLSearchParams }[] = [];
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/certs")) return Response.json({ keys: [jwk] });
      const body = new URLSearchParams(init?.body as string);
      calls.push({ url, body });
      return Response.json(
        body.get("grant_type") === "refresh_token"
          ? {
              token_type: "Bearer",
              access_token: "rotated-access",
              expires_in: 3600,
            }
          : {
              token_type: "Bearer",
              access_token: "private-access",
              refresh_token: "private-refresh",
              id_token: jwt,
              expires_in: 3600,
              scope: GOOGLE_SCOPES.calendar.join(" "),
            },
      );
    });
    const oauth = new GoogleOAuth(transport),
      tokens = await oauth.exchange(a, "code", new AbortController().signal);
    expect(tokens.subject).toBe("google-fixture");
    expect(tokens.email).toBe("test@example.test");
    expect(calls[0]?.body.get("code_verifier")).toBe(a.verifier);
    expect(calls[0]?.body.has("client_secret")).toBe(false);
    expect(
      (await oauth.refresh(tokens, "calendar", new AbortController().signal))
        .accessToken,
    ).toBe("rotated-access");
    await expect(
      oauth.exchange(
        { ...a, nonce: "wrong" },
        "code",
        new AbortController().signal,
      ),
    ).rejects.toThrow("nonce");
  });
  it("restores native-vault records without network and clears on revocation independently of ChatGPT", async () => {
    const tokens = {
      accessToken: "private-access",
      refreshToken: "private-refresh",
      idToken: "stored-fixture-token",
      expiresAt: Date.now() + 3600000,
      scopes: [...GOOGLE_SCOPES.calendar],
      subject: "google-a",
      email: "test@example.test",
      clientId,
    };
    let secret: string | null = JSON.stringify(tokens);
    const vault = {
        read: vi.fn(async () => secret),
        write: vi.fn(async (v: string) => {
          secret = v;
        }),
        clear: vi.fn(async () => {
          secret = null;
        }),
      },
      transport = vi.fn(async (url: string, init?: RequestInit) => {
        void url;
        void init;
        return new Response(null, { status: 200 });
      });
    const account = new GoogleAccount(
      "calendar",
      vault,
      vi.fn(),
      vi.fn(),
      new GoogleOAuth(transport),
      transport,
    );
    await account.restore(clientId);
    expect(account.value.state).toBe("connected");
    expect(JSON.stringify(account.value)).not.toContain("private-access");
    expect(transport).not.toHaveBeenCalled();
    await account.disconnect();
    expect(secret).toBeNull();
    expect(transport.mock.calls[0]?.[0]).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
    await account.close();
  });
  it("refreshes signing keys once for a legitimate new Google key ID", async () => {
    const pairs = await Promise.all([
        generateKeyPair("RS256"),
        generateKeyPair("RS256"),
      ]),
      keys = await Promise.all(pairs.map((p) => exportJWK(p.publicKey)));
    keys.forEach((key, i) => {
      key.kid = `key${i}`;
    });
    const a = attempt();
    let generation = 0,
      certs = 0;
    const transport = async (url: string) => {
      if (url.endsWith("/certs")) {
        certs++;
        return Response.json({ keys: [keys[generation]] });
      }
      const token = await new SignJWT({ nonce: a.nonce })
        .setProtectedHeader({ alg: "RS256", kid: `key${generation}` })
        .setIssuer("https://accounts.google.com")
        .setAudience(clientId)
        .setSubject("fixture")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pairs[generation]!.privateKey);
      return Response.json({
        access_token: "access",
        refresh_token: "refresh",
        id_token: token,
        expires_in: 3600,
        token_type: "Bearer",
        scope: GOOGLE_SCOPES.calendar.join(" "),
      });
    };
    const oauth = new GoogleOAuth(transport);
    await oauth.exchange(a, "code", new AbortController().signal);
    generation = 1;
    expect(
      (await oauth.exchange(a, "code", new AbortController().signal)).subject,
    ).toBe("fixture");
    expect(certs).toBe(2);
  });
  it("denies unofficial hosts and Google write requests before fetch", async () => {
    await expect(
      googleFetch("https://evil.test/calendar/v3/events"),
    ).rejects.toThrow("Unsupported");
    await expect(
      googleFetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        { method: "POST" },
      ),
    ).rejects.toThrow("write");
  });
  it("treats invalid_grant during refresh as revoked access", async () => {
    let secret: string | null = JSON.stringify({
      accessToken: "a",
      refreshToken: "r",
      idToken: "id",
      expiresAt: 1,
      scopes: [...GOOGLE_SCOPES.calendar],
      subject: "subject",
      email: null,
      clientId,
    });
    const vault = {
      read: async () => secret,
      write: async (v: string) => {
        secret = v;
      },
      clear: async () => {
        secret = null;
      },
    };
    const transport = vi.fn(async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );
    const account = new GoogleAccount(
      "calendar",
      vault,
      vi.fn(),
      vi.fn(),
      new GoogleOAuth(transport),
      transport,
    );
    await account.restore(clientId);
    await expect(
      account.read(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(GoogleError);
    expect(secret).toBeNull();
    expect(account.subject).toBeNull();
  });
});
