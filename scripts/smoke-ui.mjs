import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import electron from "electron";
import { _electron } from "playwright-core";
import {
  dashboardPage,
  finishSetup,
  navigate,
  settingsSection,
} from "./desktop-harness.mjs";

const project = resolve(import.meta.dirname, "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-ui-"));
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
  assertions = 0;
const errors = [],
  images = [],
  evidence = [];
function check(value, label) {
  assert.ok(value, label);
  assertions++;
  evidence.push(label);
}
try {
  const started = performance.now();
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
  });
  const page = await dashboardPage(desktop);
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  const readyMs = performance.now() - started;
  await finishSetup(page);
  const app = async () =>
    (await page.evaluate(() => window.everyhint.getSnapshot())).value;
  const ai = async () =>
    (await page.evaluate(() => window.everyhint.getAssistant())).value;
  await desktop.evaluate(() => {
    globalThis.__uiNetwork = [];
    globalThis.fetch = async (url) => {
      globalThis.__uiNetwork.push(String(url));
      throw Error("No external requests authorised in UI smoke.");
    };
  });
  await mkdir("artifacts/ui", { recursive: true });
  const shot = async (name, target = page) => {
    await target.screenshot({ path: `artifacts/ui/${name}.png` });
    images.push(name);
  };
  await page.evaluate(() => document.fonts.ready);
  check(
    await page.evaluate(() =>
      ["Inter", "Poppins"].every((f) =>
        Array.from(document.fonts).some(
          (face) => face.family === f && face.status === "loaded",
        ),
      ),
    ),
    "Bundled Inter and Poppins load locally",
  );
  check(
    (await app()).settings.theme === "dark",
    "New installations default to dark",
  );
  check(
    await page.evaluate(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-brand")
          .trim()
          .toUpperCase() === "#E01A34",
    ),
    "EverySession red remains the rendered brand",
  );
  check(
    (await page
      .getByRole("button", { name: "Start EveryHint", exact: true })
      .count()) === 1,
    "Home has one Start action",
  );
  check(
    (await page.getByRole("button", { name: "Stop", exact: true }).count()) ===
      0,
    "Idle never shows Stop",
  );
  check(
    (await page
      .getByRole("button", { name: "Settings", exact: true })
      .count()) === 1,
    "Settings has one entry",
  );
  await shot("dashboard-dark");
  await page.evaluate(() => document.querySelector(".skip-link").focus());
  await page.keyboard.press("Enter");
  check(
    await page.evaluate(
      () => document.activeElement.id === "workspace-content",
    ),
    "Keyboard skip control focuses workspace without changing IPC URL",
  );
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Your question",
  );
  check(
    (await ai()).responses.length === 0,
    "Composer shortcut never sends inference",
  );
  await page
    .getByLabel("Your question", { exact: true })
    .fill("UI foundation synthetic draft");
  await page
    .getByRole("button", { name: "Review & send", exact: true })
    .click();
  await page.getByLabel("Context review", { exact: true }).waitFor();
  check(await page.getByLabel("Context review",{exact:true}).evaluate(el=>el.getBoundingClientRect().height<=innerHeight*0.65+2), "Transmission review stays in a bounded sheet");
  const reviewId = (await ai()).review.requestId;
  check(
    !(await page
      .getByLabel("Acknowledge remote transfer", { exact: true })
      .isChecked()),
    "Remote sharing approval starts unchecked",
  );
  for (const [name, label] of [
    ["Knowledge", "Knowledge library"],
    ["Calendar", "Calendar dashboard"],
    ["People", "People dashboard"],
    ["Modes", "AI Modes"],
    ["Meetings", "Meeting history workspace"],
    ["Home", "Home overview"],
  ]) {
    await navigate(page, name);
    check(
      await page.getByLabel(label, { exact: true }).isVisible(),
      `${name} navigation works`,
    );
  }
  await navigate(page, "Assistant");
  check(
    (await page.getByLabel("Your question", { exact: true }).inputValue()) ===
      "UI foundation synthetic draft",
    "Navigation retains the draft",
  );
  check(
    (await ai()).review.requestId === reviewId,
    "Navigation retains frozen context",
  );
  await settingsSection(page, "General");
  check(
    (await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button")
      .count()) === 6,
    "Settings has six focused sections",
  );
  await page.getByLabel("Colour theme", { exact: true }).selectOption("light");
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  check(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme === "light",
    ),
    "Light native controls remain supported",
  );
  await navigate(page, "Home");
  await shot("dashboard-light");
  await settingsSection(page, "General");
  await page.getByLabel("Colour theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  check(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme === "dark",
    ),
    "System follows the OS colour preference",
  );
  check(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("button"))
          .transitionDuration === "0s",
    ),
    "Reduced motion disables transitions",
  );
  await settingsSection(page, "Advanced");
  await page.getByLabel("Window opacity", { exact: true }).fill("85");
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.settings.opacity === 0.85,
  );
  check(
    await desktop.evaluate(({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows();
      return (
        all
          .find((w) => w.webContents.getURL().endsWith("index.html"))
          .getOpacity() === 1 &&
        Math.abs(
          all
            .find((w) => w.webContents.getURL().includes("overlay=1"))
            .getOpacity() - 0.85,
        ) < 0.02
      );
    }),
    "Opacity changes only the floating assistant",
  );
  await page.getByLabel("Window opacity", { exact: true }).fill("100");
  await settingsSection(page, "Shortcuts");
  const original = (await app()).settings.assistShortcut;
  await page
    .getByLabel("Assist shortcut", { exact: true })
    .fill("Control+Alt+P");
  await page
    .getByRole("button", { name: "Apply shortcuts", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Each shortcut must be different" })
    .waitFor();
  check(
    (await app()).settings.assistShortcut === original,
    "Shortcut conflicts cannot replace Pause or Stop",
  );
  await page
    .getByLabel("Assist shortcut", { exact: true })
    .fill("Control+Alt+K");
  await page
    .getByRole("button", { name: "Apply shortcuts", exact: true })
    .click();
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.settings.assistShortcut ===
      "Control+Alt+K",
  );
  check(
    (await app()).hotkeys.find((h) => h.action === "assist").accelerator ===
      "Control+Alt+K",
    "Custom shortcut reaches the native registry",
  );
  await desktop.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("index.html"),
    );
    w.setBounds({ width: 360, height: 500 });
  });
  check(
    await page.evaluate(
      () =>
        document.querySelector(".content").scrollWidth <=
        document.querySelector(".content").clientWidth + 1,
    ),
    "Minimum-width Settings has no horizontal overflow",
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith("index.html"))
      .webContents.setZoomFactor(1.25),
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Narrow dashboard supports 125% text zoom",
  );
  check(
    (await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Settings", exact: true })
      .count()) === 1,
    "Narrow icon navigation retains accessible labels",
  );
  await shot("narrow-settings-125");
  await page.emulateMedia({ forcedColors: "active" });
  check(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
    "High-contrast media is supported",
  );
  await page.emulateMedia({ forcedColors: "none" });
  await desktop.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("index.html"),
    );
    w.webContents.setZoomFactor(1);
    w.setBounds({ width: 1040, height: 760 });
  });
  await navigate(page, "Assistant");
  check(
    (await ai()).review.requestId === reviewId,
    "Appearance changes preserve reviewed context",
  );
  await page.getByText("Attach Context", { exact: true }).click();
  check(
    (await page
      .getByRole("checkbox", {
        name: "Fresh authorised screenshot",
        exact: true,
      })
      .count()) === 0,
    "Unavailable screen context is absent",
  );
  check(
    (await page
      .getByRole("checkbox", {
        name: "Recent microphone transcript",
        exact: true,
      })
      .count()) === 0,
    "Unavailable transcript context is absent",
  );
  await page.getByText("Attach Context", { exact: true }).click();
  await page.evaluate(()=>window.everyhint.assistant("discard-review"));
  const actual = await ai(),
    fixture = {
      ...actual,
      revision: actual.revision + 100,
      responses: [
        {
          requestId: "ui-renderer-fixture",
          sessionId: actual.sessionId,
          provider: "codex",
          question: "Labelled renderer fixture",
          text: "A short synthetic answer for layout verification.",
          status: "generating",
          startedAt: Date.now(),
          firstTextAt: Date.now(),
          endedAt: null,
          error: null,
          usage: null,
          model: "fixture",
        },
      ],
    };
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("index.html"))
        .webContents.send("everyhint:assistant", value),
    fixture,
  );
  await page
    .getByRole("button", { name: "Cancel remote request", exact: true })
    .waitFor();
  await settingsSection(page, "Privacy & Data");
  check(
    await page
      .getByRole("button", { name: "Cancel remote request", exact: true })
      .isVisible(),
    "Remote Cancel remains visible in Settings",
  );
  check(
    await page
      .getByRole("checkbox", {
        name: "Window Content Protection (Windows)",
        exact: true,
      })
      .isVisible(),
    "Privacy has a clear protection control",
  );
  check(
    !(await page
      .getByLabel("Automatically save authorised meeting sessions", {
        exact: true,
      })
      .isChecked()),
    "Automatic history saving remains opt-in",
  );
  await navigate(page, "Meetings");
  check(
    await page
      .getByRole("button", { name: "Cancel remote request", exact: true })
      .isVisible(),
    "Meetings navigation retains remote Cancel",
  );
  check(
    (await page.getByLabel("Save meeting history", { exact: true }).count()) ===
      0,
    "History preferences are absent from everyday Meetings",
  );
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith("index.html"))
        .webContents.send("everyhint:assistant", value),
    { ...actual, revision: fixture.revision + 1 },
  );
  await page.evaluate(async () => {
    const s = (await window.everyhint.getSnapshot()).value.settings;
    await window.everyhint.saveSettings({ ...s, theme: "dark" });
  });
  await page.evaluate(() => window.everyhint.window("overlay"));
  const overlay = desktop.windows().find((p) => p.url().includes("overlay=1"));
  await overlay.getByLabel("EveryHint assistant", { exact: true }).waitFor();
  check(
    (await overlay
      .getByRole("navigation", { name: "Main navigation" })
      .count()) === 0,
    "Floating assistant has no dashboard navigation",
  );
  check(
    await overlay.getByLabel("Your question", { exact: true }).isVisible(),
    "Floating assistant keeps message input available",
  );
  check(
    (await overlay.locator(".assistant-connection").count()) === 0,
    "Floating assistant has no provider configuration panels",
  );
  check(
    await overlay.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent.trim() === "Review & send")
        .getBoundingClientRect();
      return b.top >= 0 && b.bottom <= innerHeight;
    }),
    "Floating send action is fully visible at its default size",
  );
  await shot("floating-assistant-dark", overlay);
  await overlay
    .getByRole("button", { name: "Dismiss overlay", exact: true })
    .click();
  await settingsSection(page, "General");
  await page.getByLabel("Colour theme", { exact: true }).selectOption("dark");
  const prefs = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith("index.html"))
      .webContents.getLastWebPreferences(),
  );
  check(
    prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration,
    "Renderer isolation is preserved",
  );
  check(
    (await ai()).responses.length === 0 &&
      (await app()).session.state === "IDLE",
    "Navigation and themes never acquire capture or AI permission",
  );
  check(
    await desktop.evaluate(() => globalThis.__uiNetwork.length === 0),
    "UI operations make zero remote requests",
  );
  check(errors.length === 0, `No renderer errors: ${errors.join(", ")}`);
  await desktop.close();
  desktop = undefined;
  const saved = JSON.parse(
    await readFile(join(profile, "settings.json"), "utf8"),
  );
  check(
    saved.settings.theme === "dark" && saved.settings.setupComplete,
    "Theme and completed setup persist",
  );
  check(
    !JSON.stringify(saved).includes("UI foundation synthetic draft"),
    "Settings do not persist conversation content",
  );
  await writeFile(
    "artifacts/ui-smoke.json",
    JSON.stringify(
      {
        assertions,
        images,
        evidence,
        readyMs,
        remoteRequests: 0,
        physicalCapture: false,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `UI smoke passed: ${assertions} assertions, ${images.length} screenshots, zero remote requests.`,
  );
} finally {
  if (desktop) await desktop.close();
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes("everyhint-ui-")
  )
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
}
