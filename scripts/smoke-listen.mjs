import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  link,
  copyFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import electron from "electron";
import { _electron } from "playwright-core";
import {
  dashboardPage,
  finishSetup,
  navigate,
  settingsSection,
} from "./desktop-harness.mjs";
import { installSyntheticAudio } from "./synthetic-audio.mjs";
import { loadSpeechFixture } from "./speech-fixture.mjs";
import { installListenPlanFixture } from "./listen-plan-fixture.mjs";

const root = resolve(import.meta.dirname, ".."),
  home = await mkdtemp(join(tmpdir(), "everyhint-listen-"));
const speechRoot =
    process.env.EVERYHINT_SPEECH_HOME ??
    join(process.env.LOCALAPPDATA, "EveryHint", "speech"),
  speech = join(home, "speech");
const wave = await loadSpeechFixture(speechRoot);
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: home,
  EVERYHINT_SPEECH_HOME: speech,
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
let desktop, host, page;
const evidence = [],
  errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  evidence.push(label);
};
const unwrap = (result) => {
  assert.ok(result.ok, result.error);
  return result.value;
};
const native = (...args) =>
  JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(root, "scripts/ux-window-native.ps1"),
        ...args,
      ],
      { windowsHide: true, encoding: "utf8" },
    ).trim() || "null",
  );
const hotkey = (key) => native("-Action", "Shortcut", "-Accelerator", key);
const appState = async () =>
  unwrap(await page.evaluate(() => window.everyhint.getSnapshot()));
const ai = async () =>
  unwrap(await page.evaluate(() => window.everyhint.getAssistant()));
const calls = () => desktop.evaluate(() => globalThis.__listenFixture.requests);
async function wait(get, predicate, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await get();
    if (predicate(last)) return last;
    await new Promise((done) => setTimeout(done, 60));
  }
  throw Error("Listen wait failed: " + JSON.stringify(last));
}
try {
  for (const file of [
    "models/ggml-tiny.en.bin",
    "runtime/everyhint-transcriber.exe",
  ]) {
    await mkdir(join(speech, file, ".."), { recursive: true });
    await link(join(speechRoot, file), join(speech, file)).catch(() =>
      copyFile(join(speechRoot, file), join(speech, file)),
    );
  }
  host = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "scripts/listen-native-host.ps1"),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const other = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(Error("Native host failed to open")),
      15000,
    );
    host.stdout.on("data", (chunk) => {
      buffer += chunk;
      const line = buffer.split(/\r?\n/).find((line) => line.startsWith("{"));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
    host.stderr.on("data", (chunk) => process.stderr.write(chunk));
    host.on("error", reject);
  });
  desktop = await _electron.launch({
    executablePath: electron,
    args: [root],
    cwd: root,
    env,
  });
  await desktop.context().addInitScript(installSyntheticAudio, {
    samples: Array.from(wave.samples),
    sampleRate: wave.sampleRate,
  });
  await desktop.evaluate(installListenPlanFixture);
  await desktop.evaluate(({ Menu }) => {
    const real = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) {
      const menu = real.call(this, template);
      if (template.some((item) => item.label === "Open EveryHint"))
        globalThis.__listenTray = menu;
      return menu;
    };
  });
  page = await dashboardPage(desktop);
  page.on("pageerror", (error) => errors.push(error.message));
  await finishSetup(page);
  // A personal EveryHint instance may already own the older defaults. Rebind
  // only this isolated profile; never send a key registered to that instance.
  const initial = await appState();
  if (initial.hotkeys.some((h) => !h.registered)) {
    unwrap(
      await page.evaluate(
        (settings) =>
          window.everyhint.saveSettings({
            ...settings,
            toggleShortcut: "Control+Alt+Shift+Space",
            pauseShortcut: "Control+Alt+Shift+P",
            stopShortcut: "Control+Alt+Shift+Z",
            assistShortcut: "Control+Alt+Shift+A",
            clearShortcut: "Control+Alt+Shift+V",
          }),
        initial.settings,
      ),
    );
  }
  check((await calls()).length === 0, "Startup makes no inference request");
  await settingsSection(page, "Account & AI");
  await page
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await wait(ai, (s) => s.providers.find((p) => p.id === "codex")?.ready);
  check(
    (await ai()).providers.find((p) => p.id === "codex").selectedModel ===
      "listen-fixture-image",
    "Explicit Connect selects a model from the fixture account catalog",
  );
  await navigate(page, "Home");
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /^Microphone/ }).check();
  await page.getByRole("checkbox", { name: /^System audio/ }).check();
  await page.getByRole("checkbox", { name: /^Screen or application/ }).check();
  await page
    .getByRole("checkbox", { name: /I authorise the selected capture/ })
    .check();
  await page.getByRole("button", { name: "Choose a screen or window" }).click();
  await page
    .locator("#source option")
    .filter({ hasText: "EveryHint harmless hotkey fixture" })
    .waitFor({ state: "attached", timeout: 10000 })
    .catch(async (error) => {
      console.log("Owned host status", host.exitCode, other);
      console.log(
        "Source diagnostic",
        await desktop.evaluate(async ({ desktopCapturer }) =>
          (
            await desktopCapturer.getSources({
              types: ["window"],
              thumbnailSize: { width: 0, height: 0 },
            })
          ).map((s) => ({
            id: s.id,
            fixture: s.name.includes("fixture"),
            ownedName: s.name.includes("fixture") ? s.name : "other window",
          })),
        ),
      );
      console.log(
        "UI diagnostic",
        await page.locator("[role=alert]").allTextContents(),
        await page.locator("#source option").count(),
      );
      throw error;
    });
  const selected = await page
    .locator("#source option")
    .evaluateAll(
      (options) =>
        options.find((o) =>
          o.textContent.includes("EveryHint harmless hotkey fixture"),
        )?.value,
    );
  assert.ok(
    selected,
    "Owned native fixture appears in the real desktop source picker",
  );
  await page.locator("#source").selectOption(selected);
  await page
    .getByLabel("Share recent transcript with ChatGPT", { exact: true })
    .check();
  await page.getByLabel("Share screen with ChatGPT", { exact: true }).check();
  check(
    await page
      .getByRole("button", { name: "Start EveryHint", exact: true })
      .isDisabled(),
    "Local capture acknowledgement cannot replace the separate ChatGPT sharing acknowledgement",
  );
  await page.getByRole("checkbox", { name: /I allow these types/ }).check();
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .click();
  await wait(
    () =>
      page.evaluate(
        async () => (await window.everyhint.getTranscription()).value,
      ),
    (s) => s.state === "LISTENING",
  );
  check(true, "Start activates native local Whisper automatically");
  await wait(
    () =>
      desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.webContents.getURL().includes("index.html"))
          .every((w) => !w.isVisible()),
      ),
    (value) => value,
  );
  check(
    true,
    "Authorised Start automatically hides dashboard and assistant after speech setup",
  );
  check(
    (await appState()).session.state === "ACTIVE",
    "Authorised capture continues with both windows hidden",
  );
  check(
    await desktop.evaluate(
      () =>
        globalThis.__listenTray.items.some(
          (item) => item.label === "Listening locally",
        ) &&
        globalThis.__listenTray.items.some(
          (item) => item.label === "Stop all capture" && item.enabled,
        ) &&
        globalThis.__listenTray.items.some(
          (item) => item.label === "Open EveryHint",
        ) &&
        globalThis.__listenTray.items.some(
          (item) => item.label === "Show assistant",
        ),
    ),
    "The real tray menu exposes Listening, restore, independent assistant and immediate Stop while hidden",
  );
  const final = await wait(
    () =>
      page.evaluate(
        async () => (await window.everyhint.getTranscription()).value,
      ),
    (s) =>
      ["microphone", "systemAudio"].every((source) =>
        s.events.some(
          (e) =>
            e.source === source &&
            e.state === "final" &&
            /country/i.test(e.text),
        ),
      ),
    45000,
  );
  check(
    final.events.some((e) => e.source === "microphone" && e.state === "final"),
    "Synthetic microphone speech produces final segments through native Whisper",
  );
  check(
    final.events.some((e) => e.source === "systemAudio" && e.state === "final"),
    "Synthetic system-audio speech produces separately labelled final segments",
  );
  check(
    (await calls()).length === 0,
    "Continuous local transcription and native screen sampling make no inference requests",
  );
  const configured = (await appState()).hotkeys;
  check(
    configured.every((h) => h.registered),
    "All six configured shortcuts registered with the actual Electron globalShortcut service",
  );
  const answer = configured.find((h) => h.action === "answer").accelerator;
  const focused = await wait(
    async () => native("-Action", "Focus", "-Handle", String(other.handle)),
    (foreground) =>
      foreground.handle === other.handle &&
      foreground.process === other.process,
    10000,
  );
  check(
    focused.handle === other.handle &&
      focused.process === other.process &&
      other.process !== desktop.process().pid,
    "A separate native Windows Forms application owns foreground focus before Answer",
  );
  hotkey(answer);
  await wait(ai, (s) => s.responses.at(-1)?.status === "completed");
  const floating = desktop.windows().find((p) => p.url().includes("overlay=1"));
  const nativeOverlay = await desktop.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("overlay=1"),
    );
    return { visible: w.isVisible(), focused: w.isFocused() };
  });
  check(
    nativeOverlay.visible && nativeOverlay.focused,
    "Native Ctrl+Alt+Enter opens and focuses the floating assistant from another application",
  );
  const first = (await calls())[0],
    text = JSON.stringify(first);
  check(
    text.includes("country") &&
      text.includes("microphone") &&
      text.includes("systemAudio"),
    "The actual hotkey request contains recent source-labelled final transcript",
  );
  check(
    first.input[0].content.some((c) => c.type === "input_image"),
    "The actual hotkey includes a fresh native image of only the selected owned test window",
  );
  check(
    first.store === false &&
      first.stream === true &&
      first.tools.length === 0 &&
      first.tool_choice === "none",
    "Existing response-only, no-store streaming transport is preserved",
  );
  check(
    (await ai()).review === null,
    "Answer sends within session scope without a context review dialog",
  );
  await floating
    .getByText("Fixture answer 1: grounded in supplied context.", {
      exact: true,
    })
    .waitFor();
  await mkdir("artifacts/listen", { recursive: true });
  await floating.screenshot({ path: "artifacts/listen/floating-answer.png" });
  const visibleControls = await floating.evaluate(() => {
    const controls = [...document.querySelectorAll("button,textarea")]
      .filter(
        (el) =>
          el.getAttribute("aria-label") === "Your question" ||
          ["Ask", "Hide", "Pause", "Stop"].includes(el.textContent.trim()),
      )
      .filter((el) => el.getBoundingClientRect().height > 0);
    return (
      controls.length === 5 &&
      controls.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      })
    );
  });
  check(
    visibleControls,
    "Input, Ask, Hide, Pause and Stop fit in the floating viewport without scrolling",
  );
  const context = unwrap(
    await page.evaluate(() => window.everyhint.listen.context()),
  );
  check(
    context.transcripts.every((e) => e.startMs >= context.createdAt - 120000) &&
      context.transcripts.reduce((n, e) => n + e.text.length, 0) <= 6000 &&
      context.prompt.length <= 20000,
    "The real shortcut request enforces two-minute, transcript and serialized-text bounds",
  );
  check(
    context.screenshot.capturedAt >=
      Math.max(...context.transcripts.map((e) => e.endMs)),
    "The requested screen frame follows the recent transcript in timestamp order",
  );
  check(
    true,
    "The streamed fixture answer is visible in the floating assistant",
  );
  await floating.getByLabel("Your question", { exact: true }).fill("help");
  await floating.getByLabel("Your question", { exact: true }).press("Enter");
  await wait(
    ai,
    (s) =>
      s.responses.at(-1)?.status === "completed" && s.responses.length === 2,
  );
  check(
    (await calls()).length === 2 &&
      JSON.stringify((await calls())[1]).includes("help") &&
      JSON.stringify((await calls())[1]).includes("country"),
    "Typing help then Enter sends recent approved conversation and screen without review",
  );
  const input = floating.getByLabel("Your question", { exact: true });
  await input.fill("What should I say next?");
  await input.press("Shift+Enter");
  check(
    (await input.inputValue()).includes("\n") && (await calls()).length === 2,
    "Shift+Enter inserts a newline without sending",
  );
  await input.press("Enter");
  await wait(
    ai,
    (s) =>
      s.responses.length === 3 && s.responses.at(-1)?.status === "completed",
  );
  check(
    JSON.stringify((await calls())[2]).includes("What should I say next?"),
    "Ordinary typed questions use the same authorised conversation request path",
  );
  await floating
    .getByRole("button", { name: "Assistant menu", exact: true })
    .click();
  await floating
    .getByRole("menuitem", { name: "View Context", exact: true })
    .click();
  await floating
    .getByRole("region", { name: "Last request context" })
    .waitFor();
  check(
    await floating
      .getByRole("region", { name: "Last request context" })
      .isVisible(),
    "Optional View Context exposes the exact last bounded request",
  );
  await page.evaluate(() => window.everyhint.window("overlay"));
  await floating.evaluate(() => window.everyhint.window("hide"));
  check(
    (await appState()).session.state === "ACTIVE",
    "Hiding the floating assistant keeps local listening active",
  );
  hotkey(configured.find((h) => h.action === "pause").accelerator);
  await wait(appState, (s) => s.session.state === "PAUSED");
  check(
    (await page.evaluate(() => window.everyhint.getTranscription())).value
      .state !== "LISTENING",
    "The registered pause shortcut stops capture and transcription while hidden",
  );
  hotkey(answer);
  await new Promise((done) => setTimeout(done, 500));
  check(
    (await calls()).length === 3,
    "Answer while paused sends no inference request",
  );
  hotkey(configured.find((h) => h.action === "pause").accelerator);
  await wait(
    () =>
      page.evaluate(
        async () => (await window.everyhint.getTranscription()).value,
      ),
    (s) => s.state === "LISTENING",
  );
  check(
    true,
    "The registered resume shortcut restarts local transcription under the same capture consent",
  );
  await desktop.evaluate(() => {
    globalThis.__listenFixture.hold = true;
  });
  await input.fill("help");
  await input.press("Enter");
  await wait(ai, (s) => s.responses.at(-1)?.status === "generating");
  await floating.getByRole("button", { name: "Pause", exact: true }).click();
  await wait(appState, (s) => s.session.state === "PAUSED");
  check(
    !(await ai()).responses.some((r) =>
      ["sending", "generating"].includes(r.status),
    ),
    "Overlay Pause interrupts a typed streaming answer and pauses capture",
  );
  await floating.getByRole("button", { name: "Resume", exact: true }).click();
  await wait(
    () =>
      page.evaluate(
        async () => (await window.everyhint.getTranscription()).value,
      ),
    (s) => s.state === "LISTENING",
  );
  check(
    (await appState()).session.state === "ACTIVE",
    "Overlay Resume recovers the authorised local session",
  );
  await input.fill("help");
  await input.press("Enter");
  await wait(ai, (s) => s.responses.at(-1)?.status === "generating");
  await floating.getByRole("button", { name: "Cancel", exact: true }).click();
  await wait(
    ai,
    (s) =>
      !s.responses.some((r) => ["sending", "generating"].includes(r.status)),
  );
  check(
    (await appState()).session.state === "ACTIVE" &&
      (await desktop.evaluate(() => globalThis.__listenFixture.aborted > 0)),
    "Overlay Cancel aborts typed inference while keeping authorised capture active",
  );
  hotkey(answer);
  await wait(ai, (s) => s.responses.at(-1)?.status === "generating");
  hotkey(configured.find((h) => h.action === "stop").accelerator);
  await wait(appState, (s) => s.session.state === "STOPPED");
  check(
    !(await ai()).responses.some((r) =>
      ["sending", "generating"].includes(r.status),
    ) && (await desktop.evaluate(() => globalThis.__listenFixture.aborted > 0)),
    "The registered Stop shortcut aborts an in-flight streamed answer",
  );
  check(
    !(await page.evaluate(() => window.everyhint.listen.get())).value.sharing,
    "Stop removes the session sharing grant",
  );
  check(
    !(await page.evaluate(() => window.everyhint.listen.context())).value,
    "Stop clears the retained conversation-request context",
  );
  await settingsSection(page, "Shortcuts");
  check(
    (await page
      .getByLabel("Answer from conversation shortcut", { exact: true })
      .inputValue()) === answer,
    "Settings displays the actual configured Answer binding",
  );
  check(
    (await appState()).hotkeys.every((h) =>
      configured.some(
        (old) => old.action === h.action && old.accelerator === h.accelerator,
      ),
    ),
    "Every configured shortcut remains available alongside the new Answer action",
  );
  const afterStop = await appState();
  unwrap(
    await page.evaluate(
      (settings) =>
        window.everyhint.saveSettings({
          ...settings,
          answerShortcut: "Control+Alt+Shift+Enter",
        }),
      afterStop.settings,
    ),
  );
  const registered = await desktop.evaluate(({ globalShortcut }) => ({
    old: globalShortcut.isRegistered("Control+Alt+Enter"),
    current: globalShortcut.isRegistered("Control+Alt+Shift+Enter"),
  }));
  check(
    !registered.old && registered.current,
    "Rebinding Answer replaces the actual Electron global registration",
  );
  await page
    .getByLabel("Answer from conversation shortcut", { exact: true })
    .filter({ visible: true })
    .waitFor()
    .catch(() => {});
  check(
    (await page
      .getByLabel("Answer from conversation shortcut", { exact: true })
      .inputValue()) === "Control+Alt+Shift+Enter",
    "Settings follows the rebound Answer binding",
  );
  await floating.evaluate(() => window.everyhint.window("hide"));
  native("-Action", "Focus", "-Handle", String(other.handle));
  hotkey("Control+Alt+Shift+Enter");
  check(
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("overlay=1"))
        .isVisible(),
    ),
    "Rebound Answer is received while the native test application has focus",
  );
  check(
    (await calls()).length === 6,
    "A rebound Answer cannot infer after Stop removed permission",
  );
  unwrap(await page.evaluate(() => window.everyhint.account("sign-out")));
  await page.evaluate(() => window.everyhint.window("dashboard"));
  await floating.evaluate(() => window.everyhint.window("hide"));
  unwrap(
    await page.evaluate(() =>
      window.everyhint.listen.start({
        capture: {
          consent: {
            microphone: true,
            systemAudio: false,
            screen: false,
            acknowledged: true,
          },
        },
        sharing: { transcript: true, screen: false, acknowledged: true },
      }),
    ),
  );
  check(
    (await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("index.html"))
        .isVisible(),
    )) &&
      !(await page.evaluate(() => window.everyhint.listen.get())).value.sharing,
    "Incomplete ChatGPT sharing recovery remains visible instead of being hidden as successful setup",
  );
  check(
    (await calls()).length === 6,
    "A local session with incomplete sharing makes no inference request",
  );
  unwrap(await page.evaluate(() => window.everyhint.session("stop")));
  check(
    errors.length === 0,
    "No renderer errors occurred during the full Listen & Ask flow",
  );
  await mkdir("artifacts/listen", { recursive: true });
  await writeFile(
    "artifacts/listen/windows-smoke.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        assertions: evidence.length,
        evidence,
        configured,
        foregroundApplication: other,
        physicalMicrophone: false,
        physicalLoopback: false,
        nativeOwnedWindowCapture: true,
        genuineProviderRequests: 0,
        provider: "deterministic OAuth/catalog/Responses fixture",
        speechDiagnostics: final.diagnostics,
      },
      null,
      2,
    ),
  );
  console.log(
    `Listen Windows smoke passed: ${evidence.length} assertions. Actual native hotkeys, separate foreground application, native Whisper with synthetic audio, owned-window capture, deterministic provider.`,
  );
} finally {
  if (desktop) {
    await page
      ?.evaluate(() => window.everyhint.session("stop"))
      .catch(() => {});
    await page
      ?.evaluate(() => window.everyhint.account("sign-out"))
      .catch(() => {});
    await desktop.close();
  }
  if (host) {
    host.kill();
    await new Promise((done) => {
      host.once("exit", done);
      setTimeout(done, 1000);
    });
  }
  await rm(home, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
