import assert from "node:assert/strict";
import {
  readFile,
  readdir,
  stat,
  access,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { listPackage, extractFile } from "@electron/asar";
import { getCurrentFuseWire, FuseV1Options as F } from "@electron/fuses";
import { posixPaths } from "./posix-paths.mjs";

const paths = posixPaths(),
  archive = join(paths.resources, "app.asar");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const files = listPackage(archive, { isPack: false }).map((p) =>
  p.replaceAll("\\", "/"),
);
assert.ok(
  files.every((p) => /^\/(out|node_modules|package\.json)(\/|$)/.test(p)),
);
assert.ok(!files.some((p) => p.endsWith(".map") || p.includes("@openai/")));
const manifest = JSON.parse(
  extractFile(archive, join("out/main/speech-runtime.json")).toString(),
);
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);
const helper = join(paths.resources, "speech/everyhint-transcriber"),
  bytes = await readFile(helper);
assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
assert.equal(bytes.length, manifest.bytes);
await access(helper, constants.X_OK);
assert.ok(
  !(await readdir(paths.resources)).some((p) =>
    /^vc-runtime|VC-RUNTIME/.test(p),
  ),
);
assert.deepEqual((await readdir(join(paths.resources, "speech"))).sort(), [
  "everyhint-transcriber",
  "whisper-LICENSE",
]);
const fuses = await getCurrentFuseWire(paths.executable);
assert.equal(fuses[F.RunAsNode], 48);
assert.equal(fuses[F.OnlyLoadAppFromAsar], 49);
if (process.platform === "darwin") {
  execFileSync("codesign", ["--verify", "--deep", "--strict", paths.bundle], {
    stdio: "inherit",
  });
  execFileSync("codesign", ["--verify", "--strict", helper], {
    stdio: "inherit",
  });
}
const extensions =
  process.platform === "darwin" ? [".dmg", ".zip"] : [".AppImage", ".deb"];
const assets = (await readdir("release")).filter(
  (p) =>
    p.startsWith(`EveryHint-${version}-${paths.label}-`) &&
    extensions.some((ext) => p.endsWith(ext)),
);
assert.equal(assets.length, 2, "Both native download formats are required");
for (const asset of assets)
  assert.ok((await stat(join("release", asset))).size > 0);
await mkdir("artifacts", { recursive: true });
await writeFile(
  `artifacts/package-${paths.label}-${process.arch}.json`,
  JSON.stringify(
    {
      version,
      platform: process.platform,
      arch: process.arch,
      helper: manifest,
      assets,
      asarEntries: files.length,
      passed: true,
      notarized: false,
      physicalCaptureTested: false,
    },
    null,
    2,
  ),
);
console.log(
  `${paths.label}/${process.arch} package audit passed: ${assets.join(", ")}`,
);
