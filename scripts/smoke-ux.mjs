import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import electron from "electron";
import { _electron } from "playwright-core";
import { dashboardPage } from "./desktop-harness.mjs";
import { execFileSync } from "node:child_process";
import { installSyntheticAudio } from "./synthetic-audio.mjs";

const project = resolve(import.meta.dirname, "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-ux-"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  EVERYHINT_SPEECH_HOME: join(profile, "speech"),
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
let desktop,
  count = 0;
const evidence = [],
  errors = [];
const nativeWindows = (...args) =>
  JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(project, "scripts/ux-window-native.ps1"),
        ...args,
      ],
      { windowsHide: true, encoding: "utf8" },
    ).trim() || "null",
  );
function check(value, label) {
  assert.ok(value, label);
  count++;
  evidence.push(label);
}
try {
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
  });
  desktop.process().stderr.on("data", (chunk) => process.stderr.write(chunk));
  desktop.process().stdout.on("data", (chunk) => process.stdout.write(chunk));
  console.log("UX application attached");
  const page = await dashboardPage(desktop);
  page.setDefaultTimeout(10000);
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
    null,
    { timeout: 15000 },
  );
  await page
    .getByRole("button", { name: "Continue · AI can be connected later" })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .waitFor();
  check(
    (await page.getByRole("button", { name: "Stop", exact: true }).count()) ===
      0,
    "Stop is absent in Idle",
  );
  check(
    (await page.getByRole("button", { name: "Pause", exact: true }).count()) ===
      0,
    "Pause is absent in Idle",
  );
  check(
    (await page
      .getByRole("button", { name: "Start EveryHint", exact: true })
      .count()) === 1,
    "Idle has one prominent Start action",
  );
  check(
    (await page
      .getByRole("button", { name: "Settings", exact: true })
      .count()) === 1,
    "Settings has one navigation entry",
  );
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("UX draft retained");
  check(
    await page.getByText("Attach Context", { exact: true }).isVisible(),
    "Chat has a compact Attach Context control",
  );
  check(
    (await page
      .getByRole("button", { name: "Refresh ChatGPT models", exact: true })
      .count()) === 0,
    "Provider diagnostics removed from chat",
  );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  check(
    (await page.getByLabel("Your question", { exact: true }).inputValue()) ===
      "UX draft retained",
    "Navigation retains composer draft",
  );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  page.on("pageerror", (e) => errors.push(e.message));
  const native = () =>
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().includes("index.html"))
        .map((w) => ({
          id: w.id,
          url: w.webContents.getURL(),
          top: w.isAlwaysOnTop(),
          visible: w.isVisible(),
          minimized: w.isMinimized(),
          focusable: w.isFocusable(),
          bounds: w.getBounds(),
        })),
    );
  let windows = await native();
  const main = windows.find((w) => !w.url.includes("overlay=1"));
  const nativeHandle = await desktop.evaluate(({ BrowserWindow }) =>
    Number(
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("index.html"))
        .getNativeWindowHandle()
        .readBigUInt64LE(),
    ),
  );
  const styles = nativeWindows(
    "-Action",
    "Inspect",
    "-Handle",
    String(nativeHandle),
  );
  check(
    !styles.toolWindow &&
      !styles.noActivate &&
      styles.owner === 0 &&
      !styles.topmost,
    "Native Windows styles allow ordinary taskbar and Alt+Tab behavior",
  );
  check(
    main && !main.top && main.focusable,
    "Dashboard is ordinary, focusable and never topmost",
  );
  check(
    windows.length === 2 &&
      !windows.find((w) => w.url.includes("overlay=1")).visible,
    "Overlay is separate and starts dismissed",
  );
  await page
    .getByRole("button", { name: "Minimise EveryHint", exact: true })
    .click();
  await page.waitForTimeout(200);
  check(
    (await native()).find((w) => w.id === main.id).minimized,
    "Real native minimize works",
  );
  await page.evaluate(() => window.everyhint.window("dashboard"));
  await page.waitForTimeout(100);
  check(
    !(await native()).find((w) => w.id === main.id).minimized,
    "Dashboard restoration calls restore and show",
  );
  await page.evaluate(() => window.everyhint.window("hide"));
  check(
    !(await native()).find((w) => w.id === main.id).visible,
    "Hide to Tray hides dashboard",
  );
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .state === "IDLE",
    "Visibility never grants capture",
  );
  await page.evaluate(() => window.everyhint.window("dashboard"));
  await page.evaluate(() => window.everyhint.window("overlay"));
  check(
    (await native()).find((w) => w.url.includes("overlay=1")).visible,
    "Explicit overlay toggle restores separate assistant",
  );
  const overlay = desktop.windows().find((p) => p.url().includes("overlay=1"));
  await overlay.waitForFunction(() => document.querySelector(".app"));
  await overlay.evaluate(() => window.everyhint.window("close"));
  await page.evaluate(async () => {
    const s = await window.everyhint.getSnapshot();
    await window.everyhint.saveSettings({
      ...s.value.settings,
      theme: "light",
      alwaysOnTop: true,
    });
  });
  windows = await native();
  check(
    !windows.find((w) => w.url.includes("overlay=1")).visible,
    "Dismissed overlay stays dismissed through state updates",
  );
  check(
    windows.find((w) => w.url.includes("overlay=1")).top &&
      !windows.find((w) => w.id === main.id).top,
    "Pin preference affects overlay alone",
  );
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .consent === null,
    "Pin, hide and restore retain no capture permission",
  );
  await desktop.evaluate(() => {
    globalThis.__uxNetwork = [];
    globalThis.fetch = async (url) => {
      globalThis.__uxNetwork.push(String(url));
      throw new Error("Network forbidden in UX smoke");
    };
  });
  check(
    (
      await page.evaluate(() => window.everyhint.getSnapshot())
    ).value.hotkeys.every((k) => k.registered),
    "All global shortcuts register on Windows",
  );
  await page.evaluate(async () => {
    const r = await window.everyhint.getSnapshot();
    await window.everyhint.saveSettings({
      ...r.value.settings,
      toggleShortcut: "Control+Alt+O",
      alwaysOnTop: false,
      theme: "dark",
    });
  });
  nativeWindows("-Action", "Shortcut", "-Accelerator", "Control+Alt+O");
  await overlay.waitForFunction(() => document.visibilityState === "visible");
  check(
    (await native()).find((w) => w.url.includes("overlay=1")).visible,
    "Real Windows global shortcut shows the overlay with a custom binding",
  );
  nativeWindows("-Action", "Shortcut", "-Accelerator", "Control+Alt+O");
  await page.waitForTimeout(100);
  check(
    !(await native()).find((w) => w.url.includes("overlay=1")).visible,
    "Real Windows global shortcut hides the overlay",
  );
  check(
    (await page.locator(".home-shortcut").innerText()).includes(
      "Ctrl + Alt + O",
    ),
    "UI displays the actual customised overlay shortcut",
  );
  await page.evaluate(() => window.everyhint.window("overlay"));
  await overlay
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await page
    .getByLabel("ChatGPT account connection", { exact: true })
    .waitFor();
  check(
    (await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Account & AI", exact: true })
      .getAttribute("aria-current")) === "page",
    "Floating Connect opens dashboard account settings without a provider request",
  );
  await overlay.evaluate(() => window.everyhint.openMeetings());
  await page.getByLabel("Meeting history workspace", { exact: true }).waitFor();
  check(
    (await page.evaluate(() => window.everyhint.meetings.getState())).value
      .locked,
    "Floating meeting navigation opens dashboard history without enabling saving or unlocking an empty store",
  );
  check(
    !(
      await overlay.evaluate(() =>
        window.everyhint.openMeetings({ invalid: true }),
      )
    ).ok,
    "Cross-window meeting navigation validates record identifiers",
  );
  await overlay.evaluate(() => window.everyhint.window("close"));
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await desktop.context().addInitScript(installSyntheticAudio);
  await desktop.evaluate(({ Tray }) => {
    const original = Tray.prototype.setContextMenu;
    Tray.prototype.setContextMenu = function (menu) {
      globalThis.__uxTrayMenu = menu;
      return original.call(this, menu);
    };
  });
  await page.evaluate(async () => {
    const r = await window.everyhint.prepare({
      consent: {
        screen: false,
        microphone: true,
        systemAudio: false,
        acknowledged: true,
      },
    });
    if (!r.ok) throw Error(r.error);
    await window.everyhint.session("start");
  });
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.sources.microphone
        .state === "CAPTURING",
  );
  check(
    (await page
      .getByRole("button", { name: "Pause", exact: true })
      .isVisible()) &&
      (await page
        .getByRole("button", { name: "Stop", exact: true })
        .isVisible()),
    "Active session exposes Pause and Stop",
  );
  check(
    !(await native()).find((w) => w.url.includes("overlay=1")).visible,
    "Capture updates never reopen a dismissed overlay",
  );
  await page.evaluate(() => window.everyhint.window("minimize"));
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .state === "ACTIVE",
    "Minimising leaves authorised capture active",
  );
  await desktop.evaluate(() =>
    globalThis.__uxTrayMenu.items
      .find((i) => i.label === "Show dashboard")
      .click(),
  );
  check(
    !(await native()).find((w) => w.id === main.id).minimized &&
      (await native()).find((w) => w.id === main.id).visible,
    "Real tray action restores a minimised dashboard",
  );
  await page.evaluate(() => window.everyhint.window("hide"));
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .state === "ACTIVE",
    "Hiding preserves authorised capture state",
  );
  check(
    await desktop.evaluate(
      () =>
        globalThis.__uxTrayMenu.items.some(
          (i) => i.label === "Stop all capture" && i.enabled,
        ) &&
        globalThis.__uxTrayMenu.items.some(
          (i) => i.label === "EveryHint · ACTIVE",
        ),
    ),
    "Native tray menu retains active status and an enabled Stop control in the background",
  );
  nativeWindows("-Action", "Shortcut", "-Accelerator", "Control+Alt+P");
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.state === "PAUSED",
  );
  check(
    (await page
      .getByRole("button", { name: "Resume", exact: true })
      .count()) === 1,
    "Global Pause works while hidden and exposes Resume",
  );
  nativeWindows("-Action", "Shortcut", "-Accelerator", "Control+Alt+P");
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.state === "ACTIVE",
  );
  await page.evaluate(() => window.everyhint.window("dashboard"));
  const closing = page.evaluate(() => window.everyhint.window("close"));
  void closing.catch(() => {});
  await page.waitForTimeout(150);
  const processId = await desktop.evaluate(() => process.pid);
  const closeDialog = nativeWindows(
    "-Action",
    "Dialog",
    "-OwnedProcess",
    String(processId),
    "-Button",
    "Keep running in background",
  );
  await closing;
  check(
    closeDialog.text.some((t) => t.includes("Your session is still open")) &&
      (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
        .state === "ACTIVE",
    "Actual native close prompt offers background capture and keeps the active session",
  );
  nativeWindows("-Action", "Shortcut", "-Accelerator", "Control+Alt+Shift+X");
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.state === "STOPPED",
  );
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .consent === null,
    "Global Stop works while hidden and revokes capture consent",
  );
  await page.evaluate(() => window.everyhint.window("dashboard"));
  check(
    (await page.getByRole("button", { name: "Stop", exact: true }).count()) ===
      0,
    "Stopped session removes obsolete Stop controls",
  );
  const startSynthetic = () =>
    page.evaluate(async () => {
      const prepared = await window.everyhint.prepare({
        consent: {
          screen: false,
          microphone: true,
          systemAudio: false,
          acknowledged: true,
        },
      });
      if (!prepared.ok) throw Error(prepared.error);
      await window.everyhint.session("start");
    });
  await startSynthetic();
  await Promise.all([
    overlay.waitForEvent("load"),
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("overlay=1"))
        .webContents.reload(),
    ),
  ]);
  await overlay.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  let afterReload = (await page.evaluate(() => window.everyhint.getSnapshot()))
    .value;
  check(
    afterReload.session.state === "STOPPED" &&
      afterReload.session.consent === null &&
      (await page.evaluate(() => window.everyhint.getIntelligence())).value
        .live === null,
    "Reloading the floating assistant stops capture and revokes sharing",
  );
  check(
    !(await native()).find((w) => w.url.includes("overlay=1")).visible,
    "Reload never reopens the dismissed floating assistant",
  );
  await startSynthetic();
  await Promise.all([
    page.waitForEvent("load"),
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("index.html"))
        .webContents.reload(),
    ),
  ]);
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  afterReload = (await page.evaluate(() => window.everyhint.getSnapshot()))
    .value;
  check(
    afterReload.session.state === "STOPPED" &&
      afterReload.session.consent === null,
    "Reloading the dashboard stops capture and discards consent",
  );
  check(
    (await page.evaluate(() => window.everyhint.meetings.getState())).value
      .locked,
    "Document reload retains the secure history lock boundary",
  );
  await mkdir("artifacts/ux", { recursive: true });
  await page.screenshot({ path: "artifacts/ux/ux1-dashboard.png" });
  check(errors.length === 0, `No renderer errors: ${errors.join(", ")}`);
  await page.evaluate(async () => {
    const s = (await window.everyhint.getSnapshot()).value.settings;
    await window.everyhint.saveSettings({ ...s, startHidden: true });
    await window.everyhint.prepare({
      consent: {
        screen: false,
        microphone: true,
        systemAudio: false,
        acknowledged: true,
      },
    });
    await window.everyhint.session("start");
  });
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.state === "ACTIVE",
  );
  const quitFinished = desktop.waitForEvent("close", { timeout: 10000 });
  const quitRequest = page
    .evaluate(() => window.everyhint.window("close"))
    .catch((error) => {
      if (!String(error).includes("closed")) throw error;
    });
  await page.waitForTimeout(100);
  nativeWindows(
    "-Action",
    "Dialog",
    "-OwnedProcess",
    String(processId),
    "-Button",
    "Stop and quit",
  );
  await quitFinished;
  await quitRequest;
  desktop = undefined;
  check(true, "Actual native Stop and quit closes an active session cleanly");
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
  });
  const restarted = await dashboardPage(desktop);
  await restarted.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  const fresh = (await restarted.evaluate(() => window.everyhint.getSnapshot()))
    .value;
  check(
    fresh.session.state === "IDLE" &&
      fresh.session.consent === null &&
      (await restarted.evaluate(() => window.everyhint.getIntelligence())).value
        .live === null,
    "Full restart restores no capture or Live sharing permission",
  );
  check(
    !(await native()).find((w) => !w.url.includes("overlay=1")).visible,
    "Chosen tray startup keeps the dashboard hidden without activating capture",
  );
  await restarted.evaluate(() => window.everyhint.window("dashboard"));
  check(
    (await native()).find((w) => !w.url.includes("overlay=1")).visible,
    "Dashboard is recoverable after tray startup",
  );
  const idleExit = desktop.waitForEvent("close", { timeout: 10000 });
  await restarted
    .evaluate(() => window.everyhint.window("close"))
    .catch((error) => {
      if (!String(error).includes("closed")) throw error;
    });
  await idleExit;
  desktop = undefined;
  check(
    true,
    "Idle Close quits without leaving capture or an unexplained foreground window",
  );
  await writeFile(
    "artifacts/ux/window-checkpoint.json",
    JSON.stringify(
      {
        checkpoint: "UX.1 + UX.2",
        platform: process.platform,
        assertions: count,
        evidence,
        nativeStyles: styles,
        windows,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checkpoint: "UX.1 + UX.2",
      assertions: count,
      platform: process.platform,
    }),
  );
} finally {
  if (desktop && desktop.process().exitCode === null) {
    await desktop.evaluate(({ app }) => app.exit()).catch(() => {});
    await desktop.close();
  }
  if (
    dirname(profile) === resolve(tmpdir()) &&
    basename(profile).startsWith("everyhint-ux-")
  )
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
}
