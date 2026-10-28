import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { GoogleService } from "../../shared/workspace";
import { exactKeys, record } from "../../shared/validation";
import {
  googleFetch,
  googleError,
  limitedJson,
  type GoogleFetch,
} from "./http";

export const GOOGLE_SCOPES = {
  calendar: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ],
  contacts: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
} as const;
export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  scopes: string[];
  subject: string;
  email: string | null;
  clientId: string;
}
export interface GoogleAttempt {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  service: GoogleService;
}
export function googleAttempt(
  clientId: string,
  service: GoogleService,
  redirectUri: string,
): GoogleAttempt {
  if (!/^[A-Za-z0-9_-]{5,180}\.apps\.googleusercontent\.com$/.test(clientId))
    throw new Error(
      "Configure a Google Desktop OAuth client ID before connecting.",
    );
  const redirect = new URL(redirectUri);
  if (
    redirect.protocol !== "http:" ||
    redirect.hostname !== "127.0.0.1" ||
    !redirect.port ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/oauth2/callback"
  )
    throw new Error("Use the supported bound desktop loopback redirect.");
  return {
    clientId,
    service,
    redirectUri,
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
  };
}
export function googleAuthorizationUrl(attempt: GoogleAttempt): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: attempt.clientId,
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope: GOOGLE_SCOPES[attempt.service].join(" "),
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: createHash("sha256")
      .update(attempt.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "false",
  }).toString();
  return url.href;
}
export function googleCallback(url: URL, attempt: GoogleAttempt): string {
  const redirect = new URL(attempt.redirectUri),
    actual = Buffer.from(url.searchParams.get("state") ?? ""),
    expected = Buffer.from(attempt.state);
  if (
    url.origin !== redirect.origin ||
    url.pathname !== redirect.pathname ||
    url.hash ||
    url.searchParams.getAll("state").length !== 1 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new Error("Google callback state or redirect was not verified.");
  if (url.searchParams.has("error"))
    throw new Error(
      "Google sign-in or read permission was declined. No API data was imported.",
    );
  const code = url.searchParams.get("code");
  if (
    !code ||
    code.length > 8192 ||
    url.searchParams.getAll("code").length !== 1
  )
    throw new Error("Google returned an invalid authorisation code.");
  return code;
}
export function validateGoogleScopes(
  value: unknown,
  service: GoogleService,
): string[] {
  if (typeof value !== "string" || value.length > 4000)
    throw new Error(
      "Google did not return a verifiable read-only scope grant.",
    );
  const granted = [
    ...new Set(
      value
        .split(/\s+/)
        .filter(Boolean)
        .map((s) =>
          s === "https://www.googleapis.com/auth/userinfo.email" ? "email" : s,
        ),
    ),
  ];
  const expected: readonly string[] = GOOGLE_SCOPES[service];
  if (
    expected.some((scope) => !granted.includes(scope)) ||
    granted.some((scope) => !expected.includes(scope))
  )
    throw new Error(
      "Google scope grant differs from the selected read-only permission. No broader grant is accepted.",
    );
  return granted;
}
function tokenText(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 32768 ||
    /\s/.test(value)
  )
    throw new Error("Google token response is invalid.");
  return value;
}
export function storedGoogleTokens(
  value: unknown,
  service: GoogleService,
): GoogleTokens {
  const input = record(value);
  exactKeys(input, [
    "accessToken",
    "refreshToken",
    "idToken",
    "expiresAt",
    "scopes",
    "subject",
    "email",
    "clientId",
  ]);
  tokenText(input.accessToken);
  tokenText(input.refreshToken);
  tokenText(input.idToken);
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    typeof input.subject !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(input.subject) ||
    typeof input.clientId !== "string" ||
    !/^[A-Za-z0-9_-]{5,180}\.apps\.googleusercontent\.com$/.test(
      input.clientId,
    ) ||
    (input.email !== null &&
      (typeof input.email !== "string" || input.email.length > 254)) ||
    !Array.isArray(input.scopes)
  )
    throw new Error("Saved Google account binding is invalid.");
  validateGoogleScopes(input.scopes.join(" "), service);
  return input as unknown as GoogleTokens;
}
export class GoogleOAuth {
  private keys?: ReturnType<typeof createLocalJWKSet>;
  private keyAt = 0;
  private async loadKeys(signal: AbortSignal) {
    const response = await this.transport(
      "https://www.googleapis.com/oauth2/v3/certs",
      { signal },
    );
    if (!response.ok) throw await googleError(response);
    this.keys = createLocalJWKSet(
      (await limitedJson(response, 128000)) as JSONWebKeySet,
    );
    this.keyAt = this.now();
  }
  constructor(
    private transport: GoogleFetch = googleFetch,
    private now: () => number = Date.now,
  ) {}
  private async identity(
    idToken: string,
    clientId: string,
    signal: AbortSignal,
    nonce?: string,
    subject?: string,
  ) {
    const cached = Boolean(this.keys && this.now() - this.keyAt <= 600000);
    if (!cached) await this.loadKeys(signal);
    const verify = () =>
      jwtVerify(idToken, this.keys!, {
        algorithms: ["RS256"],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
        requiredClaims: ["sub", "iat", "exp"],
        currentDate: new Date(this.now()),
        clockTolerance: 30,
      });
    let verified;
    try {
      verified = await verify();
    } catch (error) {
      if (
        !cached ||
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ERR_JWKS_NO_MATCHING_KEY"
      )
        throw error;
      await this.loadKeys(signal);
      verified = await verify();
    }
    const { payload } = verified;
    if (
      !payload.sub ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(payload.sub) ||
      (nonce && payload.nonce !== nonce) ||
      (subject && payload.sub !== subject) ||
      (payload.azp !== undefined && payload.azp !== clientId) ||
      !Number.isFinite(payload.iat) ||
      payload.iat! * 1000 > this.now() + 30000
    )
      throw new Error(
        "Google identity nonce, subject or client could not be verified.",
      );
    return {
      subject: payload.sub,
      email:
        payload.email_verified === true &&
        typeof payload.email === "string" &&
        payload.email.length <= 254
          ? payload.email
          : null,
    };
  }
  private async tokens(
    body: unknown,
    clientId: string,
    service: GoogleService,
    signal: AbortSignal,
    previous?: GoogleTokens,
    nonce?: string,
  ): Promise<GoogleTokens> {
    const raw = record(body);
    if (
      raw.token_type !== "Bearer" ||
      !Number.isInteger(raw.expires_in) ||
      (raw.expires_in as number) < 30 ||
      (raw.expires_in as number) > 86400
    )
      throw new Error("Google returned invalid token lifetime/type.");
    const scopes = validateGoogleScopes(
      raw.scope ?? previous?.scopes.join(" "),
      service,
    );
    const idToken =
      raw.id_token === undefined && previous
        ? previous.idToken
        : tokenText(raw.id_token);
    const identity =
      raw.id_token === undefined && previous
        ? { subject: previous.subject, email: previous.email }
        : await this.identity(
            idToken,
            clientId,
            signal,
            nonce,
            previous?.subject,
          );
    return {
      accessToken: tokenText(raw.access_token),
      refreshToken:
        raw.refresh_token === undefined && previous
          ? previous.refreshToken
          : tokenText(raw.refresh_token),
      idToken,
      expiresAt: this.now() + (raw.expires_in as number) * 1000,
      scopes,
      clientId,
      ...identity,
    };
  }
  async exchange(
    attempt: GoogleAttempt,
    code: string,
    signal: AbortSignal,
  ): Promise<GoogleTokens> {
    const response = await this.transport(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: attempt.clientId,
          code,
          code_verifier: attempt.verifier,
          redirect_uri: attempt.redirectUri,
        }).toString(),
        signal,
      },
    );
    if (!response.ok) throw await googleError(response);
    return this.tokens(
      await limitedJson(response, 128000),
      attempt.clientId,
      attempt.service,
      signal,
      undefined,
      attempt.nonce,
    );
  }
  async refresh(
    previous: GoogleTokens,
    service: GoogleService,
    signal: AbortSignal,
  ): Promise<GoogleTokens> {
    const response = await this.transport(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: previous.clientId,
          refresh_token: previous.refreshToken,
        }).toString(),
        signal,
      },
    );
    if (!response.ok) throw await googleError(response);
    return this.tokens(
      await limitedJson(response, 128000),
      previous.clientId,
      service,
      signal,
      previous,
    );
  }
  async revoke(tokens: GoogleTokens): Promise<void> {
    const response = await this.transport(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.refreshToken }).toString(),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Local Google sign-out completed, but remote revocation was not confirmed. Review Google account app permissions.",
      );
  }
}
export async function googleLoopback(
  clientId: string,
  service: GoogleService,
  openBrowser: (url: string) => Promise<void>,
  signal: AbortSignal,
): Promise<{ attempt: GoogleAttempt; code: string }> {
  signal.throwIfAborted();
  googleAttempt(clientId, service, "http://127.0.0.1:1/oauth2/callback");
  const server = createServer({ maxHeaderSize: 12000 });
  server.maxHeadersCount = 30;
  server.requestTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Google loopback listener is unavailable.");
  }
  const attempt = googleAttempt(
    clientId,
    service,
    `http://127.0.0.1:${address.port}/oauth2/callback`,
  );
  try {
    const code = await new Promise<string>((resolve, reject) => {
      const abort = () =>
        reject(new Error("Google sign-in cancelled or timed out."));
      signal.addEventListener("abort", abort, { once: true });
      server.on("request", (request, response) => {
        if (
          request.method !== "GET" ||
          request.headers.host !== new URL(attempt.redirectUri).host ||
          !["127.0.0.1", "::ffff:127.0.0.1"].includes(
            request.socket.remoteAddress ?? "",
          ) ||
          (request.url?.length ?? 0) > 12000
        ) {
          response.writeHead(400).end("Invalid callback.");
          return;
        }
        try {
          const url = new URL(request.url ?? "/", attempt.redirectUri);
          if (url.pathname !== "/oauth2/callback") {
            response.writeHead(404).end();
            return;
          }
          const code = googleCallback(url, attempt);
          response
            .writeHead(200, {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy": "default-src 'none'",
            })
            .end(
              "Google read permission received. Close this tab and return to EveryHint.",
            );
          signal.removeEventListener("abort", abort);
          resolve(code);
        } catch (error) {
          response
            .writeHead(400, {
              "Content-Type": "text/plain",
              "Cache-Control": "no-store",
            })
            .end("Google callback could not be accepted. Return to EveryHint.");
          if (
            new URL(request.url ?? "/", attempt.redirectUri).searchParams.get(
              "state",
            ) === attempt.state
          ) {
            signal.removeEventListener("abort", abort);
            reject(error);
          }
        }
      });
      void openBrowser(googleAuthorizationUrl(attempt)).catch((error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      });
      if (signal.aborted) abort();
    });
    return { attempt, code };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
