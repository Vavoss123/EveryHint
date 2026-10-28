import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { record } from "../../../shared/validation";
import { ProviderError } from "../errors";
import { httpError, limitedJson, planFetch, type PlanFetch } from "./http";

export const ISSUER = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
export const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
export const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "resource.invoke",
  "chatgpt.tokens.use.direct",
];
export interface PlanTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  scopes: string[];
  expiresAt: number;
  earliestRefreshAt: number;
}
export interface PlanRegistration {
  id: string;
  clientId: string;
  issuer: string;
  subject: string;
  email: string | null;
  tokens: PlanTokens | null;
}
export interface OAuthAttempt {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId: string | null;
  hostId: string;
}
export function newAttempt(
  hostId: string,
  redirectUri: string,
  clientId: string | null,
): OAuthAttempt {
  return {
    hostId,
    redirectUri,
    clientId,
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
  };
}
export function authorizationUrl(
  attempt: OAuthAttempt,
  registration?: PlanRegistration,
  consent = false,
): string {
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: attempt.clientId ?? "dynamic_agent_client",
    ext_agent_host_id: attempt.hostId,
    ...(!attempt.clientId ? { agent_name_hint: "EveryHint" } : {}),
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope: SCOPES.join(" "),
    resource: RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update(attempt.verifier)
      .digest("base64url"),
    ...(registration?.tokens?.idToken
      ? { id_token_hint: registration.tokens.idToken }
      : {}),
    ...(registration?.email ? { login_hint: registration.email } : {}),
    ...(consent ? { prompt: "consent" } : {}),
  }).toString();
  return url.href;
}
export function callbackCode(
  url: URL,
  attempt: OAuthAttempt,
): { code: string; clientId: string } {
  const callback = new URL(attempt.redirectUri);
  const state = url.searchParams.get("state") ?? "";
  const actual = Buffer.from(state),
    expected = Buffer.from(attempt.state);
  if (
    url.origin !== callback.origin ||
    url.pathname !== callback.pathname ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected) ||
    url.searchParams.getAll("state").length !== 1
  )
    throw new ProviderError("auth", "Sign-in callback could not be verified.");
  if (url.searchParams.has("error"))
    throw new ProviderError(
      "permissions",
      "ChatGPT sign-in or plan consent was declined. No model request or API fallback was made.",
    );
  const code = url.searchParams.get("code");
  const clientId = url.searchParams.get("client_id") ?? attempt.clientId;
  if (
    !code ||
    code.length > 8192 ||
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.getAll("client_id").length > 1 ||
    !clientId ||
    clientId === "dynamic_agent_client" ||
    !/^[A-Za-z0-9_.:-]{1,200}$/.test(clientId) ||
    (attempt.clientId !== null && clientId !== attempt.clientId)
  )
    throw new ProviderError(
      "auth",
      "ChatGPT client registration was incomplete or changed unexpectedly.",
    );
  return { code, clientId };
}
export function planAllowed(tokens: PlanTokens | null): boolean {
  return Boolean(
    tokens?.scopes.includes("chatgpt.tokens.use.direct") &&
      tokens.scopes.includes("resource.invoke"),
  );
}
function tokenText(value: unknown, required = true): string | null {
  if (!required && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || !value || value.length > 24000)
    throw new ProviderError("auth", "The OAuth token response was invalid.");
  return value;
}
export class OpenAIOAuth {
  private keys: ReturnType<typeof createLocalJWKSet> | undefined;
  private keyTime = 0;
  constructor(
    private readonly transport: PlanFetch = planFetch,
    private readonly now: () => number = Date.now,
  ) {}
  private async keySet(
    signal: AbortSignal,
    force = false,
  ): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (!force && this.keys && this.now() - this.keyTime < 10 * 60000)
      return this.keys;
    const response = await this.transport(`${ISSUER}/.well-known/jwks.json`, {
      signal,
    });
    if (!response.ok) throw await httpError(response);
    this.keys = createLocalJWKSet(
      (await limitedJson(response, 256 * 1024)) as JSONWebKeySet,
    );
    this.keyTime = this.now();
    return this.keys;
  }
  private async verify(token: string, audience: string, signal: AbortSignal) {
    const options = {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience,
      currentDate: new Date(this.now()),
      clockTolerance: 30,
      requiredClaims: ["sub", "exp", "iat"],
    };
    try {
      return await jwtVerify(token, await this.keySet(signal), options);
    } catch (error) {
      // A signing-key rotation can be recovered once without repeating inference.
      if ((error as { code?: unknown }).code !== "ERR_JWKS_NO_MATCHING_KEY")
        throw error;
      return jwtVerify(token, await this.keySet(signal, true), options);
    }
  }
  private async validate(
    tokens: unknown,
    clientId: string,
    signal: AbortSignal,
    nonce?: string,
    previous?: PlanRegistration,
  ): Promise<{ tokens: PlanTokens; subject: string; email: string | null }> {
    const value = record(tokens);
    // Only a refresh may reuse its retained identity hint. Every code exchange
    // requires a newly signed ID token carrying this attempt's nonce.
    const idToken = tokenText(
      value.id_token ??
        (nonce === undefined ? previous?.tokens?.idToken : undefined),
    )!;
    const accessToken = tokenText(value.access_token)!;
    if (
      value.token_type !== "Bearer" ||
      !Number.isFinite(value.expires_in) ||
      (value.expires_in as number) <= 0 ||
      (value.expires_in as number) > 86400 ||
      typeof value.scope !== "string"
    )
      throw new ProviderError("auth", "The OAuth token grant was invalid.");
    const scopes = value.scope.split(/\s+/).filter(Boolean);
    if (scopes.length > 40 || scopes.some((scope) => scope.length > 128))
      throw new ProviderError("auth", "The OAuth scope response was invalid.");
    try {
      // A retained ID token identifies a refreshed session; verify a new ID token
      // whenever the refresh endpoint issues one. Expired retained hints are not new proofs.
      let subject = previous?.subject ?? "",
        email = previous?.email ?? null;
      if (value.id_token || !previous) {
        const { payload } = await this.verify(idToken, clientId, signal);
        if (
          typeof payload.sub !== "string" ||
          !payload.sub ||
          payload.sub.length > 1000 ||
          (nonce !== undefined && payload.nonce !== nonce) ||
          (previous && payload.sub !== previous.subject) ||
          (Array.isArray(payload.aud) &&
            payload.aud.length > 1 &&
            payload.azp !== clientId)
        )
          throw new Error("Identity mismatch.");
        subject = payload.sub;
        email =
          typeof payload.email === "string"
            ? payload.email.slice(0, 254)
            : null;
      }
      if (!subject) throw new Error("Missing identity.");
      let expiresAt = this.now() + (value.expires_in as number) * 1000;
      if (scopes.includes("chatgpt.tokens.use.direct")) {
        const { payload } = await this.verify(accessToken, RESOURCE, signal);
        if (
          payload.sub !== subject ||
          payload.client_id !== clientId ||
          typeof payload.scope !== "string" ||
          !payload.scope.split(/\s+/).includes("chatgpt.tokens.use.direct") ||
          !payload.scope.split(/\s+/).includes("resource.invoke")
        )
          throw new Error("Plan grant mismatch.");
        expiresAt = Math.min(expiresAt, payload.exp! * 1000);
      }
      const earliest =
        typeof value.earliest_refresh_at === "number" &&
        Number.isFinite(value.earliest_refresh_at)
          ? value.earliest_refresh_at * 1000
          : this.now();
      return {
        subject,
        email,
        tokens: {
          accessToken,
          idToken,
          refreshToken:
            tokenText(value.refresh_token, false) ??
            previous?.tokens?.refreshToken ??
            null,
          scopes,
          expiresAt,
          earliestRefreshAt: earliest,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "auth",
        "The OpenAI identity or ChatGPT plan token could not be verified. Sign in again.",
      );
    }
  }
  async exchange(
    attempt: OAuthAttempt,
    code: string,
    clientId: string,
    signal: AbortSignal,
    previous?: PlanRegistration,
  ) {
    const response = await this.transport(TOKEN, {
      method: "POST",
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: attempt.verifier,
        redirect_uri: attempt.redirectUri,
        resource: RESOURCE,
      }).toString(),
    });
    if (!response.ok) throw await httpError(response);
    return this.validate(
      await limitedJson(response, 96000),
      clientId,
      signal,
      attempt.nonce,
      previous,
    );
  }
  async refresh(registration: PlanRegistration, signal: AbortSignal) {
    if (!registration.tokens?.refreshToken)
      throw new ProviderError(
        "auth",
        "This ChatGPT session cannot refresh. Continue with ChatGPT again.",
      );
    const response = await this.transport(TOKEN, {
      method: "POST",
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: registration.clientId,
        refresh_token: registration.tokens.refreshToken,
        resource: RESOURCE,
      }).toString(),
    });
    if (!response.ok) throw await httpError(response);
    return this.validate(
      await limitedJson(response, 96000),
      registration.clientId,
      signal,
      undefined,
      registration,
    );
  }
  async revoke(
    registration: PlanRegistration,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!registration.tokens?.refreshToken) return true;
    try {
      const discovery = await this.transport(
        `${ISSUER}/.well-known/openid-configuration`,
        { signal },
      );
      if (!discovery.ok) return false;
      const value = record(await limitedJson(discovery, 65536));
      if (
        value.issuer !== ISSUER ||
        typeof value.revocation_endpoint !== "string"
      )
        return false;
      const url = new URL(value.revocation_endpoint);
      if (url.origin !== ISSUER || url.username || url.password || url.hash)
        return false;
      const response = await this.transport(url.href, {
        method: "POST",
        signal,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: registration.tokens.refreshToken,
          token_type_hint: "refresh_token",
          client_id: registration.clientId,
        }).toString(),
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
