import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const tag = process.env.RELEASE_TAG,
  repo = process.env.GITHUB_REPOSITORY;
if (tag !== `v${version}` || !repo)
  throw Error("Release tag/repository is missing or mismatched.");
const existing = JSON.parse(
  execFileSync(
    "gh",
    ["release", "view", tag, "--repo", repo, "--json", "assets"],
    { encoding: "utf8" },
  ),
).assets.map((a) => a.name);
const label = process.platform === "darwin" ? "mac" : "linux";
const extensions = label === "mac" ? [".dmg", ".zip"] : [".AppImage", ".deb"];
const assets = (await readdir("release")).filter(
  (p) =>
    p.startsWith(`EveryHint-${version}-${label}-`) &&
    extensions.some((ext) => p.endsWith(ext)),
);
if (assets.length !== 2)
  throw Error("Build both native package formats first.");
for (const asset of assets) {
  const has = existing.includes(asset),
    hash = existing.includes(`${asset}.sha256`);
  if (has && hash) continue;
  if (has || hash)
    throw Error(
      "Release contains a partial installer/checksum pair; upload its matching partner first.",
    );
  execFileSync(
    "gh",
    [
      "release",
      "upload",
      tag,
      `release/${asset}`,
      `release/${asset}.sha256`,
      "--repo",
      repo,
    ],
    { stdio: "inherit" },
  );
}
