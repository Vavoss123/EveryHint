import { AsyncEntry } from "@napi-rs/keyring";

export function credentialEntry(
  service: string,
  account: string,
  platform: string = process.platform,
): AsyncEntry {
  // Kernel keyutils fallback loses encryption keys across Linux reboots.
  // Require a persistent Secret Service; fail visibly if it is locked/missing.
  return new AsyncEntry(
    service,
    account,
    platform === "linux" ? { linux: { store: "secret-service" } } : undefined,
  );
}
