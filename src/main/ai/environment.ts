// Credentials, API base URLs, proxy/cloud switches and SDK-specific user configuration
// are excluded unless the adapter explicitly supplies them after consent.
export function baseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const allowed = new Set([
    "path",
    "systemroot",
    "windir",
    "comspec",
    "pathext",
    "temp",
    "tmp",
    "userprofile",
    "home",
    "appdata",
    "localappdata",
    "programdata",
    "lang",
    "lc_all",
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) =>
        allowed.has(key.toLowerCase()) && typeof value === "string",
    ),
  ) as Record<string, string>;
}
