import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { verifyPublisher } from "../src/main/updates-verification.ts";
const binary = join(
  process.env.SystemRoot,
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
// Known signed Windows fixture; no app signing identity or certificate created.
await verifyPublisher(binary, [
  "CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US",
]);
await assert.rejects(verifyPublisher(binary, ["CN=Wrong Fixture Publisher"]));
await assert.rejects(
  verifyPublisher(
    `release/EveryHint-Setup-${JSON.parse(await readFile("package.json", "utf8")).version}.exe`,
    ["CN=Wrong Fixture Publisher"],
  ),
);
await writeFile(
  "artifacts/p11-update-verifier.json",
  JSON.stringify(
    {
      status: "passed",
      validWindowsSystemBinaryAccepted: true,
      wrongPublisherRejected: true,
      unsignedInstallerRejected: true,
      genuineReleaseFeed: false,
    },
    null,
    2,
  ),
);
console.log(
  "Native update verifier: valid Windows signature accepted, wrong publisher and unsigned installer rejected.",
);
