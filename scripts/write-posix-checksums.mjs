import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const label =
  process.platform === "darwin"
    ? "mac"
    : process.platform === "linux"
      ? "linux"
      : null;
if (!label) throw Error("Use package:checksum for Windows.");
const extensions = label === "mac" ? [".dmg", ".zip"] : [".AppImage", ".deb"];
const assets = (await readdir("release")).filter(
  (p) =>
    p.startsWith(`EveryHint-${version}-${label}-`) &&
    extensions.some((ext) => p.endsWith(ext)),
);
if (assets.length !== 2)
  throw Error("Build both native package formats first.");
for (const name of assets) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(`release/${name}`))
    hash.update(chunk);
  await writeFile(`release/${name}.sha256`, `${hash.digest("hex")}  ${name}\n`);
}
console.log(`Checksums written for ${assets.length} ${label} downloads.`);
