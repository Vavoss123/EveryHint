import {
  dashboardPage,
  finishSetup,
  navigate as uxNavigate,
} from "./desktop-harness.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { _electron } from "playwright-core";
import { installSyntheticAudio } from "./synthetic-audio.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-smoke-"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  EVERYHINT_SPEECH_HOME: join(profile, "speech"),
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
async function waitForSnapshot(page, predicate) {
  const deadline = Date.now() + 15000;
  let snapshot;
  while (Date.now() < deadline) {
    const result = await page.evaluate(() => window.everyhint.getSnapshot());
    assert.ok(result.ok, result.error);
    snapshot = result.value;
    if (predicate(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(
    `State did not settle: ${JSON.stringify({ state: snapshot.session.state, sources: snapshot.session.sources, error: snapshot.session.error })}`,
  );
}
async function launch() {
  desktop = await _electron.launch({
    executablePath: electronPath,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  const page = await dashboardPage(desktop);
  await finishSetup(page);
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
    const win = BrowserWindow.getAllWindows().find(
      (w) =>
        w.webContents.getURL().includes("index.html") &&
        !w.webContents.getURL().includes("overlay=1"),
    );
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
  check(!native.onTop, "dashboard always-on-top defaults off");
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
    (await page.evaluate(() => window.everyhint.getAssistant())).value.providers
      .length === 2,
    "AI provider selection is available without starting a request",
  );
  await mkdir(join(project, "artifacts"), { recursive: true });
  await page.screenshot({
    path: join(project, "artifacts", "everyhint-overlay.png"),
  });
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .click();
  const choose = page.getByRole("button", {
    name: "Choose a screen or window",
  });
  check(
    await page.getByRole("button", { name: "Start EveryHint" }).isDisabled(),
    "session preparation requires source consent",
  );
  check(
    (await page.getByRole("checkbox", { name: /^Microphone/ }).isEnabled()) &&
      (await page.getByRole("checkbox", { name: /^System audio/ }).isEnabled()),
    "audio sources are independently available",
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
  await page.evaluate(async () => {
    const r = await window.everyhint.getSnapshot();
    await window.everyhint.saveSettings({
      ...r.value.settings,
      alwaysOnTop: true,
    });
  });
  check(
    await desktop.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return (
        !windows
          .find((w) => w.webContents.getURL().includes("overlay=1"))
          .isAlwaysOnTop() &&
        !windows
          .find((w) => w.webContents.getURL().endsWith("index.html"))
          .isAlwaysOnTop()
      );
    }),
    "hidden overlay and dashboard stay unpinned",
  );
  await page.evaluate(() => window.everyhint.window("overlay"));
  check(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("overlay=1"))
          .isVisible() &&
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("overlay=1"))
          .isAlwaysOnTop(),
    ),
    "floating overlay restores independently with its pin preference",
  );
  await page.evaluate(() => window.everyhint.window("hide"));
  check(
    !(await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find(
          (w) =>
            w.webContents.getURL().includes("index.html") &&
            !w.webContents.getURL().includes("overlay=1"),
        )
        .isVisible(),
    )),
    "overlay can hide to tray",
  );
  const hiddenStop = await page.evaluate(() =>
    window.everyhint.session("stop"),
  );
  check(hiddenStop.ok, "stop IPC works independently of visibility");
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(
        (w) =>
          w.webContents.getURL().includes("index.html") &&
          !w.webContents.getURL().includes("overlay=1"),
      )
      .show(),
  );
  await desktop.context().addInitScript(installSyntheticAudio);
  for (const [microphone, systemAudio] of [
    [true, false],
    [false, true],
    [true, true],
  ]) {
    await uxNavigate(page, "Home");
    await page
      .getByRole("button", { name: "Start EveryHint", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /^Microphone/ })
      .setChecked(microphone);
    await page
      .getByRole("checkbox", { name: /^System audio/ })
      .setChecked(systemAudio);
    await page.getByRole("checkbox", { name: /I authorise/ }).check();
    if (microphone) {
      await page.getByRole("button", { name: "Refresh microphones" }).click();
      await page
        .getByLabel("Microphone device", { exact: true })
        .selectOption("synthetic-mic");
    }
    const local = await page.evaluate(
      async ({ microphone, systemAudio }) => {
        const prepared = await window.everyhint.prepare({
          consent: {
            microphone,
            systemAudio,
            screen: false,
            acknowledged: true,
          },
          ...(microphone ? { microphoneDeviceId: "synthetic-mic" } : {}),
        });
        if (!prepared.ok) return prepared;
        return window.everyhint.session("start");
      },
      { microphone, systemAudio },
    );
    assert.ok(local.ok, local.error);
    await uxNavigate(page, "Assistant");
    await waitForSnapshot(
      page,
      (state) =>
        (!microphone ||
          state.session.sources.microphone.state === "CAPTURING") &&
        (!systemAudio ||
          state.session.sources.systemAudio.state === "CAPTURING"),
    );
    await waitForSnapshot(
      page,
      (state) =>
        (!microphone || state.session.sources.microphone.level > 0.01) &&
        (!systemAudio || state.session.sources.systemAudio.level > 0.01),
    );
    const state = await page.evaluate(() => window.everyhint.getSnapshot());
    check(
      state.value.session.sources.screen.state === "DISABLED",
      "audio-only does not start the screen snapshot pipeline",
    );
    check(
      state.value.session.sources.microphone.state ===
        (microphone ? "CAPTURING" : "DISABLED") &&
        state.value.session.sources.systemAudio.state ===
          (systemAudio ? "CAPTURING" : "DISABLED"),
      `actual source status matches consent ${JSON.stringify({ microphone, systemAudio, sources: state.value.session.sources, error: state.value.session.error })}`,
    );
    const worker = desktop
      .context()
      .pages()
      .find((candidate) => candidate.url().endsWith("/audio.html"));
    check(!!worker, "separate sandboxed audio context is active");
    check(
      await worker.evaluate(
        ({ microphone, systemAudio }) =>
          window.__everyhintSynthetic.counters.microphone ===
            Number(microphone) &&
          window.__everyhintSynthetic.counters.systemAudio ===
            Number(systemAudio),
        { microphone, systemAudio },
      ),
      "exactly one acquisition for each enabled audio source",
    );
    check(
      await desktop.evaluate(({ BrowserWindow }) => {
        const worker = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().endsWith("/audio.html"),
        );
        const preferences = worker.webContents.getLastWebPreferences();
        return (
          preferences.sandbox &&
          preferences.contextIsolation &&
          !preferences.nodeIntegration
        );
      }),
      "real audio context is sandboxed and isolated",
    );
    if (systemAudio)
      check(
        await worker.evaluate(() =>
          window.__everyhintSynthetic.tracks
            .filter((track) => track.kind === "video")
            .every((track) => track.readyState === "ended"),
        ),
        "accompanying video track is released",
      );
    if (microphone) {
      await page.evaluate(() => window.everyhint.setMicrophoneMuted(true));
      await waitForSnapshot(
        page,
        (state) =>
          state.session.sources.microphone.muted &&
          state.session.sources.microphone.level === 0,
      );
      check(true, "microphone mute zeroes its meter");
      await page.evaluate(() => window.everyhint.setMicrophoneMuted(false));
      await waitForSnapshot(
        page,
        (state) =>
          !state.session.sources.microphone.muted &&
          state.session.sources.microphone.level > 0.01,
      );
    }
    if (microphone && systemAudio)
      await page.screenshot({
        path: join(project, "artifacts", "everyhint-audio.png"),
      });
    await page.getByRole("button", { name: /Pause/ }).click();
    await waitForSnapshot(
      page,
      (state) =>
        state.session.state === "PAUSED" &&
        !state.session.frame &&
        state.session.sources.microphone.level === 0 &&
        state.session.sources.systemAudio.level === 0,
    );
    check(
      !desktop
        .context()
        .pages()
        .some((candidate) => candidate.url().endsWith("/audio.html")),
      "pause destroys the capture context",
    );
    await page.getByRole("button", { name: "Resume" }).click();
    await waitForSnapshot(page, (state) =>
      Object.values(state.session.sources).some(
        (source) => source.state === "CAPTURING",
      ),
    );
    await page.getByRole("button", { name: /Stop/ }).click();
    await waitForSnapshot(
      page,
      (state) => state.session.state === "STOPPED" && !state.session.consent,
    );
    check(
      !desktop
        .context()
        .pages()
        .some((candidate) => candidate.url().endsWith("/audio.html")),
      "stop destroys every audio context",
    );
  }
  check(failures.length === 0, `no renderer errors: ${failures.join(", ")}`);
  const statuses = initial.value.hotkeys
    .map(
      (key) => `${key.action}=${key.registered ? "registered" : "unavailable"}`,
    )
    .join(", ");
  await page.evaluate(async () => {
    const prepared = await window.everyhint.prepare({
      consent: {
        screen: false,
        microphone: true,
        systemAudio: false,
        acknowledged: true,
      },
    });
    if (!prepared.ok) throw new Error(prepared.error);
    await window.everyhint.session("start");
  });
  await waitForSnapshot(
    page,
    (state) => state.session.sources.microphone.state === "CAPTURING",
  );
  const shutdownWorker = desktop
    .context()
    .pages()
    .find((candidate) => candidate.url().endsWith("/audio.html"));
  await desktop.close();
  desktop = undefined;
  check(
    shutdownWorker.isClosed(),
    "application shutdown releases an active audio capture context",
  );
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
    `Electron smoke passed: ${assertions} assertions. Hotkeys: ${statuses}. Audio used synthetic media; no microphone, desktop or Windows playback was captured.`,
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
