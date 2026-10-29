// Real Vite/React refresh against the compiled Electron main/preload. Temporary
// source edits are restored byte-for-byte even when a check fails.
import assert from "node:assert/strict";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { _electron } from "playwright-core";
import electron from "electron";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, ".."),
  home = await mkdtemp(join(tmpdir(), "everyhint-overlay-hmr-"));
const component = join(root, "src/renderer/src/FloatingAssistant.tsx"),
  css = join(root, "src/renderer/src/overlay.css"),
  original = await readFile(component),
  originalCss = await readFile(css);
let server,
  desktop,
  count = 0;
const checks = [];
const check = (value, label) => {
  assert.ok(value, label);
  count++;
  checks.push(label);
};
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: home,
  EVERYHINT_SPEECH_HOME: join(home, "speech"),
};
delete env.ELECTRON_RUN_AS_NODE;
try {
  server = await createServer({
    root: join(root, "src/renderer"),
    configFile: false,
    plugins: [react()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0];
  desktop = await _electron.launch({
    executablePath: electron,
    args: [root],
    cwd: root,
    env,
  });
  const end = Date.now() + 15000;
  let floating;
  while (Date.now() < end) {
    floating = desktop
      .windows()
      .find((page) => page.url().includes("overlay=1"));
    if (floating) break;
    await new Promise((done) => setTimeout(done, 40));
  }
  assert.ok(floating, "Development overlay created");
  await floating.locator(".floating-assistant").waitFor();
  const ids = () =>
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .map((w) => w.id)
        .sort(),
    );
  const before = await ids();
  check(
    (await floating.locator(".floating-assistant").count()) === 1,
    "Development renderer mounts one floating tree",
  );
  const changed = original
    .toString("utf8")
    .replace(
      "Type help, or ask a question…",
      "Type help here, or ask a question…",
    );
  assert.notEqual(changed, original.toString("utf8"));
  await writeFile(component, changed);
  await floating
    .getByLabel("Your question", { exact: true })
    .getAttribute("placeholder");
  await floating.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Your question"]')
        ?.getAttribute("placeholder") === "Type help here, or ask a question…",
  );
  check(
    JSON.stringify(await ids()) === JSON.stringify(before),
    "Actual React hot update creates no BrowserWindow",
  );
  check(
    (await floating.locator("#root > main").count()) === 1,
    "Actual React hot update retains one renderer root",
  );
  await writeFile(
    css,
    originalCss.toString("utf8") + "\n/* everyhint-overlay-hmr-check */\n",
  );
  await floating.waitForFunction(() =>
    [...document.querySelectorAll("style")].some((style) =>
      style.textContent.includes("everyhint-overlay-hmr-check"),
    ),
  );
  check(
    (await floating.locator(".floating-assistant").count()) === 1 &&
      JSON.stringify(await ids()) === JSON.stringify(before),
    "Actual CSS hot update retains the same single assistant",
  );
  await writeFile(component, original);
  await writeFile(css, originalCss);
  await floating.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Your question"]')
        ?.getAttribute("placeholder") === "Type help, or ask a question…",
  );
  check(
    (await floating
      .locator(".meeting-session,.settings-page,.transcription-panel")
      .count()) === 0,
    "Hot refresh cannot mount dashboard forms in the overlay",
  );
  await mkdir("artifacts/overlay-fix", { recursive: true });
  await writeFile(
    "artifacts/overlay-fix/hmr-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        assertions: count,
        checks,
        sourceRestored: true,
        capture: false,
        remoteInference: false,
      },
      null,
      2,
    ),
  );
  console.log(`Overlay actual React/CSS HMR passed: ${count} assertions.`);
} finally {
  await writeFile(component, original);
  await writeFile(css, originalCss);
  if (desktop) await desktop.close();
  if (server) await server.close();
  await rm(home, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
