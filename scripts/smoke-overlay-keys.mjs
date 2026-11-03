// Click-through, overlay-only keys and whole-screen Start defaults on real
// Windows windows with native key injection. No capture or remote request.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "playwright-core";
import electron from "electron";
import { dashboardPage, finishSetup, navigate } from "./desktop-harness.mjs";

const project = resolve(import.meta.dirname, "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-overlay-keys-"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  EVERYHINT_SPEECH_HOME: join(profile, "speech"),
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
let count = 0;
const errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  count++;
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
        join(project, "scripts/ux-window-native.ps1"),
        ...args,
      ],
      { windowsHide: true, encoding: "utf8" },
    ).trim() || "null",
  );
const desktop = await _electron.launch({
  executablePath: electron,
  args: [project],
  cwd: project,
  env,
  timeout: 30000,
});
const wait = async (test, label, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test()) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`Timed out: ${label}`);
};
try {
  await desktop.evaluate(() => {
    globalThis.fetch = async () => {
      throw new Error("No network in overlay key smoke.");
    };
  });
  const page = await dashboardPage(desktop);
  page.on("pageerror", (e) => errors.push(e.message));
  await finishSetup(page);
  // Whole screen is the default source once capture is authorised.
  await navigate(page, "Home");
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .first()
    .click();
  check(
    await page
      .getByRole("checkbox", { name: /^Screen or application/ })
      .isChecked(),
    "Screen capture is selected by default",
  );
  await page
    .getByRole("checkbox", { name: /I authorise the selected capture/ })
    .check();
  await page.waitForFunction(
    () => document.querySelector("#source")?.value?.startsWith("screen:"),
    null,
    { timeout: 10000 },
  );
  check(true, "The whole screen is chosen without picking a source");
  await page.getByRole("button", { name: "Back" }).click();

  const overlayInfo = () =>
    desktop.evaluate(({ BrowserWindow, globalShortcut }) => {
      const w = BrowserWindow.getAllWindows().find((x) =>
        x.webContents.getURL().includes("overlay=1"),
      );
      return {
        handle: Number(w.getNativeWindowHandle().readBigUInt64LE()),
        visible: w.isVisible(),
        opacity: w.getOpacity(),
        keys: ["Control+Up", "Control+Shift+Down", "Control+Alt+Space"].map(
          (k) => globalShortcut.isRegistered(k),
        ),
      };
    });
  check(
    (await overlayInfo()).keys.every((k) => !k),
    "Overlay keys are free while the overlay is hidden",
  );
  await page.evaluate(() => window.everyhint.window("overlay"));
  await wait(async () => (await overlayInfo()).visible, "overlay shown");
  let info = await overlayInfo();
  check(
    info.keys.every(Boolean),
    "Move, scroll and click-through keys register when shown",
  );
  check(
    !native("-Action", "Inspect", "-Handle", String(info.handle))
      .mouseTransparent,
    "Overlay accepts clicks by default",
  );
  const overlay = desktop.windows().find((p) => p.url().includes("overlay=1"));
  overlay.on("pageerror", (e) => errors.push(e.message));
  // Native Ctrl+Alt+Space from Windows toggles click-through.
  native("-Action", "Shortcut", "-Accelerator", "Control+Alt+Space");
  await wait(
    async () =>
      native("-Action", "Inspect", "-Handle", String(info.handle))
        .mouseTransparent,
    "click-through on",
  );
  check(true, "Native Ctrl+Alt+Space makes Windows pass clicks through");
  info = await overlayInfo();
  check(
    info.opacity <= 0.72 + 1e-6,
    "Click-through overlay becomes see-through",
  );
  await overlay.getByText("Click-through · Ctrl+Alt+Space").waitFor();
  check(true, "Overlay shows the click-through badge");
  native("-Action", "Shortcut", "-Accelerator", "Control+Alt+Space");
  await wait(
    async () =>
      !native("-Action", "Inspect", "-Handle", String(info.handle))
        .mouseTransparent,
    "click-through off",
  );
  check(
    (await overlayInfo()).opacity > 0.99,
    "Toggling again restores clicks and opacity",
  );
  // Scroll keys move the answer area.
  await overlay.evaluate(() => {
    const area = document.querySelector(".overlay-answer");
    const filler = document.createElement("div");
    filler.style.height = "4000px";
    area.append(filler);
    area.scrollTop = 0;
  });
  native("-Action", "Shortcut", "-Accelerator", "Control+Shift+Down");
  await wait(
    () =>
      overlay.evaluate(
        () => document.querySelector(".overlay-answer").scrollTop > 0,
      ),
    "scrolled down",
  );
  const down = await overlay.evaluate(
    () => document.querySelector(".overlay-answer").scrollTop,
  );
  check(down > 0, "Native Ctrl+Shift+Down scrolls the answer");
  native("-Action", "Shortcut", "-Accelerator", "Control+Shift+Up");
  await wait(
    () =>
      overlay.evaluate(
        (before) =>
          document.querySelector(".overlay-answer").scrollTop < before,
        down,
      ),
    "scrolled up",
  );
  check(true, "Native Ctrl+Shift+Up scrolls back");
  // Move keys.
  const before = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((x) => x.webContents.getURL().includes("overlay=1"))
      .getPosition(),
  );
  native("-Action", "Shortcut", "-Accelerator", "Control+Down");
  await wait(
    async () =>
      (
        await desktop.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((x) => x.webContents.getURL().includes("overlay=1"))
            .getPosition(),
        )
      )[1] !== before[1],
    "overlay moved",
  );
  check(true, "Native Ctrl+Down moves the overlay");
  await overlay.evaluate(() => window.everyhint.window("hide"));
  await wait(async () => !(await overlayInfo()).visible, "overlay hidden");
  check(
    (await overlayInfo()).keys.every((k) => !k),
    "Hiding the overlay releases its keys",
  );
  check(errors.length === 0, `No renderer errors: ${errors.join("; ")}`);
  console.log(`Overlay keys smoke passed: ${count} assertions.`);
} finally {
  await desktop.close().catch(() => {});
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
