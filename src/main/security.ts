import { resolve, sep } from "node:path";

export function developmentUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("EveryHint's development server must use loopback HTTP.");
  return url.href;
}

export function trustedDocument(actual: string, expected: string): boolean {
  try {
    return new URL(actual).href === new URL(expected).href;
  } catch {
    return false;
  }
}
export function assetPath(root: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  if (url.protocol !== "everyhint:" || url.hostname !== "app")
    throw new Error("Unknown application origin.");
  const decoded = decodeURIComponent(url.pathname);
  if (decoded.includes("\\") || decoded.includes("\0"))
    throw new Error("Invalid asset path.");
  const candidate = resolve(root, `.${decoded}`);
  if (!candidate.startsWith(`${resolve(root)}${sep}`))
    throw new Error("Asset path escapes application root.");
  return candidate;
}
export function contentSecurityPolicy(devUrl?: string, audio = false): string {
  const connect = devUrl
    ? `${new URL(devUrl).origin} ${new URL(devUrl).origin.replace("http:", "ws:")}`
    : "'none'";
  return [
    "default-src 'none'",
    `script-src 'self'${devUrl ? " 'unsafe-inline'" : ""}`,
    `style-src 'self'${devUrl ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "media-src 'none'",
    audio ? "worker-src 'self'" : "worker-src 'none'",
  ].join("; ");
}
