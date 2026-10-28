import { AsyncEntry } from "@napi-rs/keyring";
import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { SecretEntry } from "../ai/plan/vault";

export function historyProfile(home: string, account: string | null): string {
  const absolute = resolve(home);
  return createHash("sha256")
    .update(
      `${process.platform === "win32" ? absolute.toLowerCase() : absolute}\0${account ?? "local-only"}`,
    )
    .digest("hex");
}
export class MeetingKeys {
  constructor(
    private readonly entry: (profile: string) => SecretEntry = (profile) =>
      new AsyncEntry("EveryHint.Meetings.v1", profile),
  ) {}
  async load(profile: string, existing: boolean): Promise<Buffer> {
    let bytes: Buffer | undefined;
    try {
      const stored = await this.entry(profile).getSecret();
      if (stored !== null) {
        if (stored.length !== 32) throw new Error("Invalid key.");
        return Buffer.from(stored);
      }
      if (existing) throw new Error("Key missing.");
      bytes = randomBytes(32);
      await this.entry(profile).setSecret(bytes);
      const check = await this.entry(profile).getSecret();
      if (!check || check.length !== 32 || !Buffer.from(check).equals(bytes))
        throw new Error("Key write failed.");
      return Buffer.from(bytes);
    } catch {
      throw new Error(
        "History key is unavailable in the Windows credential store. Existing encrypted history was preserved; no replacement key or plaintext fallback was used.",
      );
    } finally {
      bytes?.fill(0);
    }
  }
}
