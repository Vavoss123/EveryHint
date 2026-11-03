import { join, resolve } from "node:path";
export function posixPaths() {
  if (process.platform === "darwin") {
    const bundle = resolve(
      `release/mac${process.arch === "arm64" ? "-arm64" : ""}/EveryHint.app`,
    );
    return {
      bundle,
      executable: join(bundle, "Contents/MacOS/EveryHint"),
      resources: join(bundle, "Contents/Resources"),
      label: "mac",
    };
  }
  if (process.platform === "linux") {
    const bundle = resolve("release/linux-unpacked");
    return {
      bundle,
      executable: join(bundle, "everyhint"),
      resources: join(bundle, "resources"),
      label: "linux",
    };
  }
  throw Error("Use the Windows package verification commands on Windows.");
}
