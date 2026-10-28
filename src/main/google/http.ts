import { limitedJson } from "../ai/plan/http";
export { limitedJson };
export type GoogleFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;
export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
export const googleFetch: GoogleFetch = async (url, init = {}) => {
  const endpoint = new URL(url),
    method = init.method ?? "GET";
  const auth =
    endpoint.origin === "https://oauth2.googleapis.com" &&
    ["/token", "/revoke"].includes(endpoint.pathname) &&
    method === "POST";
  const api =
    method === "GET" &&
    ((endpoint.origin === "https://www.googleapis.com" &&
      (endpoint.pathname.startsWith("/calendar/v3/") ||
        endpoint.pathname === "/oauth2/v3/certs")) ||
      (endpoint.origin === "https://people.googleapis.com" &&
        endpoint.pathname.startsWith("/v1/people")));
  if (
    (!auth && !api) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  )
    throw new Error("Unsupported Google endpoint or write operation.");
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(20000),
      ]),
    });
  } catch {
    throw new GoogleError(
      0,
      "network",
      "Google could not be reached. Cached information may be stale; no automatic AI request occurred.",
    );
  }
};
export async function googleError(response: Response): Promise<GoogleError> {
  let reason = "unknown";
  try {
    const body = (await limitedJson(response, 32768)) as {
      error?:
        | string
        | {
            status?: string;
            errors?: { reason?: string }[];
            details?: { reason?: string }[];
          };
    };
    const candidate =
      typeof body.error === "string"
        ? body.error
        : (body.error?.errors?.[0]?.reason ??
          body.error?.details?.find((d) => d.reason)?.reason ??
          body.error?.status);
    if (candidate && /^[A-Za-z0-9_-]{1,100}$/.test(candidate))
      reason = candidate;
  } catch {
    /* Never log or return Google's raw response or error_description. */
  }
  const rate =
    response.status === 429 ||
    [
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "RESOURCE_EXHAUSTED",
    ].includes(reason);
  const retry = Number(response.headers.get("retry-after"));
  return new GoogleError(
    response.status,
    reason,
    rate
      ? "Google read requests are rate limited. Refresh is paused with backoff."
      : response.status === 401 || reason === "invalid_grant"
        ? "Google access expired or was revoked. Reconnect explicitly."
        : response.status === 403
          ? "Google permission or API configuration is unavailable. Check the configured read-only grant and enabled API."
          : response.status === 410
            ? "Google sync state expired; a complete read refresh is required."
            : "Google returned an unavailable or unsupported response. Cached data was preserved.",
    rate
      ? Math.min(
          3600000,
          Math.max(30000, Number.isFinite(retry) ? retry * 1000 : 30000),
        )
      : 0,
  );
}
