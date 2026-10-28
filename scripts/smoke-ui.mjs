import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import electron from "electron";
import { _electron } from "playwright-core";

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
  images = [];
function check(value, label) {
  assert.ok(value, label);
  assertions++;
}
try {
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".capture-controls"),
  );
  await desktop.evaluate(() => {
    globalThis.__uiRemoteCalls = [];
    globalThis.fetch = async (url) => {
      globalThis.__uiRemoteCalls.push(String(url));
      throw new Error("Network forbidden during UI-only smoke.");
    };
  });
  const app = async () => {
    const result = await page.evaluate(() => window.everyhint.getSnapshot());
    assert.ok(result.ok);
    return result.value;
  };
  const ai = async () => {
    const result = await page.evaluate(() => window.everyhint.getAssistant());
    assert.ok(result.ok);
    return result.value;
  };
  const settled = (predicate) => page.waitForFunction(predicate);
  const shot = async (name) => {
    await page.screenshot({ path: `artifacts/ui/${name}.png` });
    images.push(name);
  };
  await mkdir("artifacts/ui", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  check(
    await page.evaluate(
      () =>
        document.fonts.check("400 14px Inter") &&
        document.fonts.check("600 20px Poppins") &&
        ["Inter", "Poppins"].every((family) =>
          Array.from(document.fonts).some(
            (face) => face.family === family && face.status === "loaded",
          ),
        ),
    ),
    "authentic local font faces loaded",
  );
  check(
    (await app()).settings.theme === "light",
    "verified light palette is the default",
  );
  check(
    await page.evaluate(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-brand")
          .trim()
          .toUpperCase() === "#E01A34",
    ),
    "EverySession red is the actual rendered brand token",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  check(
    await page.evaluate(
      () => document.activeElement?.id === "workspace-content",
    ),
    "skip control focuses workspace without changing the trusted IPC URL",
  );
  check(
    (await app()).session.state === "IDLE",
    "skip control preserves trusted IPC",
  );
  await page.keyboard.press("Control+Enter");
  await settled(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Your question",
  );
  check(
    (await ai()).responses.length === 0,
    "Assist composer shortcut never submits inference",
  );
  await page
    .getByLabel("Your question", { exact: true })
    .fill("UI foundation synthetic draft");
  await page
    .getByRole("button", { name: "Review selected context", exact: true })
    .click();
  await page.getByLabel("Context review", { exact: true }).waitFor();
  const reviewId = (await ai()).review.requestId;
  await page
    .getByRole("button", { name: "Open dashboard", exact: true })
    .click();
  await page.getByLabel("Home overview", { exact: true }).waitFor();
  check(
    (await app()).settings.layout === "dashboard",
    "dashboard layout uses validated existing settings IPC",
  );
  const size = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBounds(),
  );
  check(
    size.width >= 800 && size.height >= 600,
    "dashboard expands the native window",
  );
  await shot("dashboard-light");
  for (const [name, milestone] of [
    ["Meetings", "P8"],
    ["Knowledge", "P9"],
    ["Calendar", "P10"],
    ["People", "P10"],
    ["Modes", "P9"],
  ]) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
    const content = await page
      .getByLabel(`${name} roadmap`, { exact: true })
      .innerText();
    check(
      content.includes("Not available yet") && content.includes(milestone),
      `${name} is an honest planned destination`,
    );
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Assistant", exact: true })
    .click();
  check(
    (await page.getByLabel("Your question", { exact: true }).inputValue()) ===
      "UI foundation synthetic draft",
    "navigation preserves the working composer",
  );
  check(
    (await ai()).review.requestId === reviewId,
    "navigation preserves the exact frozen review",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByLabel("Colour theme", { exact: true }).selectOption("dark");
  await settled(() => document.documentElement.dataset.theme === "dark");
  check(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme === "dark",
    ),
    "dark mode changes actual native control theme",
  );
  await page.getByLabel("Window opacity", { exact: true }).fill("85");
  await page.waitForFunction(() =>
    window.everyhint
      .getSnapshot()
      .then((result) => result.ok && result.value.settings.opacity === 0.85),
  );
  check(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        Math.abs(BrowserWindow.getAllWindows()[0].getOpacity() - 0.85) < 0.02,
    ),
    "opacity changes the actual Windows window",
  );
  await page.getByLabel("Window opacity", { exact: true }).fill("100");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await shot("dashboard-dark");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByLabel("Colour theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  check(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme === "dark",
    ),
    "system theme responds to OS colour preference",
  );
  check(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("button"))
          .transitionDuration === "0s",
    ),
    "reduced motion disables transitions",
  );
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Assistant", exact: true })
    .click();
  check(
    (await page.getByLabel("Your question", { exact: true }).inputValue()) ===
      "UI foundation synthetic draft",
    "settings preserve the composer and its review",
  );
  check(
    (await ai()).review.requestId === reviewId,
    "appearance changes do not replace selected context",
  );
  const transcript = page
    .locator(".workspace-panel")
    .filter({ has: page.locator("summary", { hasText: "Live transcript" }) });
  await transcript.locator(":scope > summary").click();
  check(
    (await transcript.getAttribute("open")) === null,
    "individual panels collapse without controlling capture",
  );
  await page
    .getByRole("button", { name: "Open expanded assistant", exact: true })
    .click();
  await settled(() => !document.querySelector(".is-dashboard"));
  await shot("assistant-light");
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await page.locator(".is-compact").waitFor();
  check(
    await page
      .getByRole("button", { name: "Quick Ask", exact: false })
      .isVisible(),
    "compact overlay keeps Quick Ask accessible",
  );
  check(
    await page.getByLabel("Capture source states").isVisible(),
    "compact overlay exposes screen, mic and system state",
  );
  check(
    await page.locator(".capture-controls").isVisible(),
    "compact overlay preserves emergency controls",
  );
  check(
    await page.evaluate(() => {
      const ask = document.querySelector(".quick-ask").getBoundingClientRect(),
        content = document.querySelector(".content").getBoundingClientRect();
      return ask.top >= content.top && ask.bottom <= content.bottom;
    }),
    "compact Quick Ask is fully inside the visible viewport",
  );
  check(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds().height <= 200,
    ),
    "compact layout preserves the small native overlay",
  );
  await shot("compact-light");
  await page.getByRole("button", { name: "Quick Ask", exact: false }).click();
  await settled(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Your question",
  );
  check(
    !(await app()).settings.compact && (await ai()).responses.length === 0,
    "Quick Ask expands and focuses without transmitting anything",
  );
  await page
    .getByRole("button", { name: "Open dashboard", exact: true })
    .click();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 360, height: 600 }),
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await shot("narrow-settings-light");
  check(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.querySelector(".content").scrollWidth <=
          document.querySelector(".content").clientWidth + 1,
    ),
    "minimum-width layout has no horizontal overflow",
  );
  check(
    await page.getByRole("button", { name: "Stop", exact: false }).isVisible(),
    "Stop remains reachable at minimum size",
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
  );
  check(
    (await page.getByLabel("Colour theme").isVisible()) &&
      (await page.locator(".capture-controls").isVisible()),
    "appearance and emergency controls remain available with text zoom",
  );
  check(
    await page.evaluate(
      () =>
        document.querySelector(".content").scrollWidth <=
        document.querySelector(".content").clientWidth + 1,
    ),
    "zoomed minimum-width content does not overflow horizontally",
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 360, height: 380 }),
  );
  check(
    await page.evaluate(() => {
      const footer = document.querySelector("footer").getBoundingClientRect();
      return footer.top >= 0 && footer.bottom <= innerHeight;
    }),
    "emergency controls stay inside the smallest native window at 125 percent zoom",
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  const realAssistant = await ai();
  const streamingFixture = {
    ...realAssistant,
    revision: realAssistant.revision + 100,
    responses: [
      {
        requestId: "ui-fixture",
        sessionId: realAssistant.sessionId,
        provider: "codex",
        question: "Renderer fixture only",
        text: "Synthetic streaming fixture",
        status: "generating",
        startedAt: Date.now(),
        firstTextAt: Date.now(),
        endedAt: null,
        error: null,
        usage: null,
        model: "Fixture only",
      },
    ],
  };
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:assistant",
        value,
      ),
    streamingFixture,
  );
  await page
    .getByRole("button", { name: "Cancel remote request", exact: true })
    .waitFor();
  check(
    await page
      .getByRole("button", { name: "Cancel remote request", exact: true })
      .isVisible(),
    "remote sharing and cancel stay visible outside settings/collapsed panels",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meetings", exact: true })
    .click();
  check(
    await page
      .getByRole("button", { name: "Cancel remote request", exact: true })
      .isVisible(),
    "planned destinations cannot hide an active request cancellation control",
  );
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:assistant",
        value,
      ),
    { ...realAssistant, revision: streamingFixture.revision + 1 },
  );
  const prefs = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  check(
    prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration,
    "UI foundation preserves renderer isolation",
  );
  check(
    (await ai()).responses.length === 0 &&
      (await app()).session.state === "IDLE",
    "view/theme changes never start capture or AI",
  );
  check(
    await desktop.evaluate(() => globalThis.__uiRemoteCalls.length === 0),
    "navigation/theme/opacity/font operations make no remote requests",
  );
  check(errors.length === 0, `no renderer errors: ${errors.join(", ")}`);
  await desktop.close();
  desktop = undefined;
  const saved = JSON.parse(
    await readFile(join(profile, "settings.json"), "utf8"),
  );
  check(
    saved.settings.theme === "system" && saved.settings.layout === "dashboard",
    "appearance preferences persist locally",
  );
  check(
    !JSON.stringify(saved).includes("UI foundation synthetic draft"),
    "draft/review content is not persisted in appearance settings",
  );
  await writeFile(
    "artifacts/ui-smoke.json",
    JSON.stringify(
      {
        assertions,
        images,
        remoteRequests: 0,
        paidRequests: 0,
        realCapture: false,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `UI foundation smoke passed: ${assertions} assertions, ${images.length} app-only screenshots. No remote requests or real capture.`,
  );
} finally {
  if (desktop) await desktop.close();
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) {
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } else {
    process.exitCode = 1;
    console.error("Unsafe UI test cleanup path; cleanup skipped.");
  }
}
