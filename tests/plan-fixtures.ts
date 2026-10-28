import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from "jose";
import {
  ISSUER,
  RESOURCE,
  SCOPES,
  type PlanRegistration,
  type PlanTokens,
} from "../src/main/ai/plan/oauth";
import type { CredentialVault } from "../src/main/ai/plan/vault";

export const clientId = "oaiapp_everyhint_fixture";
export const fixtureKeys = generateKeyPair("RS256", { modulusLength: 2048 });
export async function jwks() {
  const { publicKey } = await fixtureKeys;
  return {
    keys: [
      {
        ...(await exportJWK(publicKey)),
        kid: "fixture",
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}
export async function signed(payload: JWTPayload, kid = "fixture") {
  const { privateKey } = await fixtureKeys;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid })
    .sign(privateKey);
}
export async function grant(
  nonce?: string,
  options: {
    scope?: string;
    id?: JWTPayload;
    access?: JWTPayload;
    expires?: number;
    kid?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000),
    scope = options.scope ?? SCOPES.join(" ");
  const claims = {
    iss: ISSUER,
    sub: "fixture-person",
    iat: now,
    exp: now + 3600,
  };
  return {
    token_type: "Bearer",
    expires_in: options.expires ?? 3600,
    earliest_refresh_at: now,
    scope,
    id_token: await signed(
      {
        ...claims,
        aud: clientId,
        nonce,
        email: "fixture@example.invalid",
        ...options.id,
      },
      options.kid,
    ),
    access_token: await signed(
      {
        ...claims,
        aud: RESOURCE,
        client_id: clientId,
        scope,
        ...options.access,
      },
      options.kid,
    ),
    refresh_token: "synthetic-refresh-only",
  };
}
export const tokens = (extra: Partial<PlanTokens> = {}): PlanTokens => ({
  accessToken: "synthetic-access-only",
  refreshToken: "synthetic-refresh-only",
  idToken: "synthetic-id-only",
  scopes: [...SCOPES],
  expiresAt: Date.now() + 3600000,
  earliestRefreshAt: 0,
  ...extra,
});
export const registration = (
  extra: Partial<PlanRegistration> = {},
): PlanRegistration => ({
  id: "11bc9390-8d59-4000-a000-000000000001",
  issuer: ISSUER,
  clientId,
  subject: "fixture-person",
  email: "fixture@example.invalid",
  tokens: tokens(),
  ...extra,
});
export class MemoryVault implements CredentialVault {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async write(value: string) {
    this.value = value;
  }
  async clear() {
    this.value = null;
  }
}
export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
