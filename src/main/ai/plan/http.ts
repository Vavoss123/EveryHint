import { ProviderError } from "../errors";

export type PlanFetch = (url: string, init?: RequestInit) => Promise<Response>;
const origins = new Set(["https://auth.openai.com", "https://api.openai.com"]);
export const planFetch: PlanFetch = async (url, init = {}) => {
  const endpoint = new URL(url);
  if (
    !origins.has(endpoint.origin) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  )
    throw new ProviderError("permissions", "Unsupported OpenAI endpoint.");
  return fetch(url, {
    ...init,
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.any([
      ...(init.signal ? [init.signal] : []),
      AbortSignal.timeout(90000),
    ]),
  });
};
export async function limitedJson(
  response: Response,
  limit = 1024 * 1024,
): Promise<unknown> {
  if (!response.body)
    throw new ProviderError(
      "network",
      "The provider returned an empty response.",
    );
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit)
        throw new ProviderError(
          "provider",
          "The provider response exceeded the size limit.",
        );
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class PlanHttpError extends ProviderError {
  constructor(
    readonly status: number,
    readonly providerCode: string | null,
    readonly requestId: string | null,
    message: string,
  ) {
    super(
      status === 401
        ? "auth"
        : status === 403 || status === 400 || status === 404
          ? "permissions"
          : status === 429
            ? "rate-limit"
            : status >= 500
              ? "network"
              : "provider",
      message,
    );
  }
}
export async function httpError(response: Response): Promise<PlanHttpError> {
  let code: string | null = null;
  try {
    const body = (await limitedJson(response, 32768)) as {
      error?: { code?: unknown } | string;
    };
    const candidate =
      typeof body.error === "string" ? body.error : body.error?.code;
    if (
      typeof candidate === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(candidate)
    )
      code = candidate;
  } catch {
    /* Never forward raw response bodies or OAuth error descriptions. */
  }
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("openai-request-id");
  const safeId =
    requestId && /^[a-zA-Z0-9_-]{1,150}$/.test(requestId) ? requestId : null;
  const message =
    response.status === 401
      ? "ChatGPT authentication or plan permission was not accepted. Sign in again if the session has expired."
      : response.status === 403
        ? "ChatGPT plan access is unavailable for this account, workspace, app or region. No API billing fallback was made."
        : response.status === 429
          ? "ChatGPT plan or app usage is rate limited. Review app access and limits in ChatGPT Settings → Usage."
          : response.status === 404
            ? "The selected model is unavailable. Refresh the model list and choose another model explicitly."
            : response.status === 400
              ? "The ChatGPT plan route rejected this model or request capability."
              : "The ChatGPT plan service is temporarily unavailable. Try again explicitly later.";
  return new PlanHttpError(
    response.status,
    code,
    safeId,
    `${message}${code ? ` Code: ${code}.` : ""}${safeId ? ` Request: ${safeId}.` : ""}`,
  );
}
