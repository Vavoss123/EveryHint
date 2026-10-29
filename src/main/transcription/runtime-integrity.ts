import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export interface BundledRuntime {
  directory: string;
  manifestPath: string;
}
export function verifyRuntime(
  executable: string,
  manifestPath: string,
  arch: string = process.arch,
): boolean {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    if (
      manifest.schema !== 1 ||
      manifest.arch !== arch ||
      manifest.revision !== "d1be6fde11ac6e0407606b4e42fe72d34add8037" ||
      typeof manifest.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256)
    ) return false;
    const file = statSync(executable);
    if (!file.isFile() || file.size !== manifest.bytes || file.size > 20_000_000) return false;
    return createHash("sha256").update(readFileSync(executable)).digest("hex") === manifest.sha256;
  } catch {
    return false;
  }
}
