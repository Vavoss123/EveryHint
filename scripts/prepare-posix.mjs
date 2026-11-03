import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { nativeBinaryMatches } from "../src/main/transcription/runtime-binary.ts";
import { prepareIcons } from "./prepare-icons.mjs";

if (
  !["darwin", "linux"].includes(process.platform) ||
  !["x64", "arm64"].includes(process.arch)
)
  throw Error("Build on a supported native macOS/Linux host.");
const helper = "artifacts/release-speech/runtime/everyhint-transcriber";
await chmod(helper, 0o755);
if (process.platform === "darwin") {
  // Sign the helper before hashing. The app signer excludes this pre-signed
  // resource so that subsequent bundle signing cannot invalidate the manifest.
  execFileSync("codesign", ["--force", "--sign", "-", helper], {
    stdio: "inherit",
  });
}
const bytes = await readFile(helper);
if (!nativeBinaryMatches(bytes, process.platform, process.arch))
  throw Error(
    "The speech helper belongs to a different OS or CPU architecture.",
  );
for (const path of [process.cwd(), process.env.HOME].filter(Boolean))
  if (bytes.includes(Buffer.from(path)))
    throw Error("Rebuild the speech helper without developer home paths.");
await mkdir("out/main", { recursive: true });
await writeFile(
  "out/main/speech-runtime.json",
  JSON.stringify(
    {
      schema: 1,
      platform: process.platform,
      arch: process.arch,
      revision: "d1be6fde11ac6e0407606b4e42fe72d34add8037",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ),
);
await prepareIcons();
console.log(
  `Prepared native ${process.platform}/${process.arch} speech helper and icon; no models bundled.`,
);
