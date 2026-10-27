import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { _electron } from "playwright-core";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-smoke-"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  ELECTRON_ENABLE_SECURITY_WARNINGS: "true",
};
delete env.ELECTRON_RUN_AS_NODE;
let desktop;
const failures = [];
let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions++;
}
async function launch() {
  desktop = await _electron.launch({
    executablePath: electronPath,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => failures.push(error.message));
  await page.waitForFunction(
    () => !!window.everyhint && document.querySelector(".capture-controls"),
  );
  return page;
}
try {
  const page = await launch();
  const initial = await page.evaluate(async () =>
    window.everyhint.getSnapshot(),
  );
  check(
    initial.ok && initial.value.session.state === "IDLE",
    "launch starts IDLE",
  );
  check(
    initial.value.session.frame === null &&
      initial.value.session.consent === null,
    "startup has no frame or consent",
  );
  check((await page.title()) === "EveryHint", "renderer branding");
  const native = await desktop.evaluate(({ app, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const prefs = win.webContents.getLastWebPreferences();
    return {
      name: app.getName(),
      title: win.getTitle(),
      sandbox: prefs.sandbox,
      isolated: prefs.contextIsolation,
      node: prefs.nodeIntegration,
      onTop: win.isAlwaysOnTop(),
    };
  });
  check(
    native.name === "EveryHint" && native.title.includes("EveryHint"),
    "native app and window branding",
  );
  check(
    native.sandbox && native.isolated && !native.node,
    "sandbox and context isolation",
  );
  check(native.onTop, "always-on-top defaults on");
  const rejected = await page.evaluate(async () => ({
    start: await window.everyhint.session("start"),
    resume: await window.everyhint.session("resume"),
    consent: await window.everyhint.listSources({
      screen: false,
      microphone: false,
      systemAudio: false,
      acknowledged: false,
    }),
    settings: await window.everyhint.saveSettings({
      alwaysOnTop: true,
      compact: false,
      captureIntervalMs: 0,
    }),
    action: await window.everyhint.session("unknown"),
    node: typeof window.require,
  }));
  check(
    !rejected.start.ok && !rejected.resume.ok && !rejected.consent.ok,
    "real IPC enforces state and consent",
  );
  check(
    !rejected.settings.ok && !rejected.action.ok,
    "real IPC validates settings and actions",
  );
  check(rejected.node === "undefined", "renderer has no Node access");
  check(
    await page.getByLabel("AI provider").isDisabled(),
    "AI providers are visibly disabled",
  );
  await mkdir(join(project, "artifacts"), { recursive: true });
  await page.screenshot({
    path: join(project, "artifacts", "everyhint-overlay.png"),
  });
  await page
    .getByRole("button", { name: "Prepare session", exact: true })
    .click();
  const choose = page.getByRole("button", {
    name: "Choose a screen or window",
  });
  check(await choose.isDisabled(), "source picker requires consent");
  check(
    (await page.getByLabel("Microphone").isDisabled()) &&
      (await page.getByLabel("System audio").isDisabled()),
    "audio sources disabled for P1",
  );
  await page
    .getByRole("checkbox", { name: /Screen or application window/ })
    .check();
  check(
    await choose.isDisabled(),
    "screen checkbox alone does not authorise capture",
  );
  await page.getByRole("checkbox", { name: /I authorise/ }).check();
  check(
    await choose.isEnabled(),
    "explicit authorisation enables metadata picker",
  );
  // Deliberately do not click: automated smoke tests never enumerate or capture the desktop.
  await page.getByLabel("Back", { exact: true }).click();
  await page.getByLabel("EveryHint settings").click();
  await page.getByRole("checkbox", { name: /Always on top/ }).click();
  await page.waitForFunction(async () => {
    const state = await window.everyhint.getSnapshot();
    return state.ok && !state.value.settings.alwaysOnTop;
  });
  check(
    !(await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    )),
    "settings changes the native window",
  );
  await page.getByRole("checkbox", { name: /Always on top/ }).click();
  await page.waitForFunction(async () => {
    const state = await window.everyhint.getSnapshot();
    return state.ok && state.value.settings.alwaysOnTop;
  });
  await page.getByLabel("EveryHint settings").click();
  await page.getByLabel("Compact mode", { exact: true }).click();
  await page.locator(".is-compact").waitFor();
  check(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds().height <= 200,
    ),
    "compact mode resizes window",
  );
  await page.getByLabel("Expand EveryHint", { exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".is-compact"));
  await page.evaluate(() => window.everyhint.window("hide"));
  check(
    !(await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    )),
    "overlay can hide to tray",
  );
  const hiddenStop = await page.evaluate(() =>
    window.everyhint.session("stop"),
  );
  check(hiddenStop.ok, "stop IPC works independently of visibility");
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  check(failures.length === 0, `no renderer errors: ${failures.join(", ")}`);
  const statuses = initial.value.hotkeys
    .map(
      (key) => `${key.action}=${key.registered ? "registered" : "unavailable"}`,
    )
    .join(", ");
  await desktop.close();
  desktop = undefined;
  const saved = JSON.parse(
    await readFile(join(profile, "settings.json"), "utf8"),
  );
  check(
    !("consent" in saved) && !("session" in saved) && !("frame" in saved),
    "disk stores only preferences and bounds",
  );
  const reopened = await launch();
  const state = await reopened.evaluate(() => window.everyhint.getSnapshot());
  check(
    state.ok &&
      state.value.session.state === "IDLE" &&
      !state.value.session.consent,
    "relaunch never restores capture consent",
  );
  console.log(
    `Electron smoke passed: ${assertions} assertions. Hotkeys: ${statuses}. No desktop capture was performed.`,
  );
  console.log("Overlay screenshot: artifacts/everyhint-overlay.png");
} finally {
  if (desktop) await desktop.close();
  // Only this script's mkdtemp-created profile is removed, using native Node APIs.
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
