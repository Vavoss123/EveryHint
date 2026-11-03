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
const run = (args) =>
  execFileSync(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      CSC_LINK: "",
      WIN_CSC_LINK: "",
    },
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
