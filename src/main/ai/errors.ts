import type { AIError, AIErrorCode } from "../../shared/ai";

export class ProviderError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
  }
}
// Never forward SDK stderr, HTTP bodies, command arguments or credential values to the renderer/logs.
export function providerError(error: unknown): AIError {
  if (error instanceof ProviderError)
    return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  if (
    /401|403|unauthori[sz]ed|authentication|invalid.*key|expired|login/i.test(
      message,
    )
  )
    return {
      code: "auth",
      message:
        "Authentication failed or expired. Check the provider credentials, then inspect the connection again.",
    };
  if (/429|rate.?limit|usage.?limit|overloaded|quota/i.test(message))
    return {
      code: "rate-limit",
      message:
        "The provider is rate limited or has reached a usage limit. Wait before explicitly trying again.",
    };
  if (/network|fetch|connection|ECONN|ENOTFOUND|socket|offline/i.test(message))
    return {
      code: "network",
      message:
        "The provider connection failed. Check your network, then explicitly try again.",
    };
  if (/process|exit|spawn|ENOENT|terminated/i.test(message))
    return {
      code: "process",
      message:
        "The provider process stopped unexpectedly. Check the SDK installation and try again.",
    };
  if (/abort|cancel/i.test(message))
    return { code: "cancelled", message: "Request cancelled." };
  return {
    code: "provider",
    message:
      "The provider could not finish this request. No provider fallback was made. Start another request explicitly.",
  };
}
