// Read-only NSIS payload comparison. Never runs the installer or changes registry.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { getPath7za } from "app-builder-lib/out/toolsets/7zip.js";
const output = resolve("artifacts/rc");
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, "installer-payload-")),
  tool = await getPath7za();
assert.equal(dirname(root), output);
assert.ok(basename(root).startsWith("installer-payload-"));
const installer = resolve(
  `release/EveryHint-Setup-${JSON.parse(await readFile("package.json", "utf8")).version}.exe`,
);
const files = [
  "EveryHint.exe",
  "vcruntime140.dll",
  "resources/vc-runtime-manifest.json",
  "resources/VC-RUNTIME-NOTICES.txt",
  "resources/app.asar",
  "resources/speech/everyhint-transcriber.exe",
];
async function nativeFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      result.push(
        ...(await nativeFiles(
          join(directory, entry.name),
          `${prefix}${entry.name}/`,
        )),
      );
    else if (entry.name.endsWith(".node"))
      result.push(`${prefix}${entry.name}`);
  }
  return result;
}
files.push(
  ...(
    await nativeFiles(
      resolve("release/win-unpacked/resources/app.asar.unpacked"),
    )
  ).map((p) => `resources/app.asar.unpacked/${p}`),
);
const hash = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const report = {
  installerSha256: await hash(installer),
  installerExecuted: false,
  installationPerformed: false,
  registryAcceptance: "not tested",
  comparisons: [],
  cleanup: false,
};
try {
  execFileSync(tool, ["x", installer, `-o${root}`, "-y"], {
    windowsHide: true,
    stdio: "ignore",
  });
  // Current electron-builder exposes the embedded 7z app payload directly.
  // Older NSIS builds extract an outer $PLUGINSDIR/app-64.7z instead.
  const direct = existsSync(join(root, "EveryHint.exe"));
  const unpacked = direct ? root : join(root, "payload");
  if (!direct)
    execFileSync(
      tool,
      [
        "x",
        join(root, "$PLUGINSDIR/app-64.7z"),
        `-o${unpacked}`,
        "-y",
        ...files,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
  report.payloadLayout = direct ? "embedded app archive" : "nested app-64.7z";
  for (const file of files) {
    const payloadHash = await hash(join(unpacked, file)),
      testedHash = await hash(resolve("release/win-unpacked", file));
    assert.equal(payloadHash, testedHash, `Installer payload differs: ${file}`);
    report.comparisons.push({ file, sha256: payloadHash, match: true });
  }
  report.status = "passed";
} finally {
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  report.cleanup = true;
  await writeFile(
    join(output, "installer-payload.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
