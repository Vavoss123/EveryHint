import { execFileSync } from "node:child_process";
const target = process.argv[2];
if (
  !{ mac: "darwin", linux: "linux" }[target] ||
  process.platform !== { mac: "darwin", linux: "linux" }[target]
)
  throw Error(
    "Build macOS on a Mac, and Linux on a Linux host. Native modules and speech helpers must match the host.",
  );
if (process.platform === "linux" && process.arch !== "x64")
  throw Error("This Linux package currently targets x64.");
const environment = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};
// An empty certificate link resolves to the working directory on macOS.
// Remove inherited certificate links so the configured ad-hoc signing is used.
delete environment.CSC_LINK;
delete environment.WIN_CSC_LINK;
const run = (args) =>
  execFileSync(process.execPath, args, {
    stdio: "inherit",
    env: environment,
  });
run(["node_modules/electron-vite/bin/electron-vite.js", "build"]);
run(["scripts/prepare-posix.mjs"]);
run([
  "node_modules/electron-builder/cli.js",
  `--${target}`,
  `--${process.arch}`,
  "--config",
  `electron-builder.${target}.yml`,
  "--publish",
  "never",
]);
console.log(
  `EveryHint ${target}/${process.arch} packages are in release/. Nothing was uploaded.`,
);
