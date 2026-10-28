import { execFileSync } from "node:child_process";
import electron from "electron";
execFileSync(electron, ["scripts/test-meeting-storage-runner.mjs"], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
  windowsHide: true,
});
