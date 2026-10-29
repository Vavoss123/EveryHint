import assert from "node:assert/strict";
import { _electron } from "playwright-core";
import electron from "electron";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dashboardPage, finishSetup } from "./desktop-harness.mjs";

const project = resolve(import.meta.dirname, ".."),
  evidence = [],
  pictures = [],
  observations = [];
const check = (value, label) => {
  assert.ok(value, label);
  evidence.push(label);
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
const unwrap = (r) => {
  assert.ok(r.ok, r.error);
  return r.value;
};
const ids = (desktop) =>
  desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => w.webContents.getURL().includes("index.html"))
      .map((w) => w.id)
      .sort(),
  );
const windows = (desktop) =>
  desktop.evaluate(({ BrowserWindow, app }) => ({
    pid: process.pid,
    lock: app.hasSingleInstanceLock(),
    windows: BrowserWindow.getAllWindows()
      .filter((w) => w.webContents.getURL().includes("index.html"))
      .map((w) => ({
        id: w.id,
        role: w.webContents.getURL().includes("overlay=1")
          ? "assistant"
          : "dashboard",
        visible: w.isVisible(),
        minimized: w.isMinimized(),
        top: w.isAlwaysOnTop(),
        bounds: w.getBounds(),
        handle: Number(w.getNativeWindowHandle().readBigUInt64LE()),
      })),
  }));
let desktop,
  page,
  floating,
  revision = 1000;
const responseText =
  "# A clear next step\n\nExplain the trade-off briefly, then ask which constraint matters most.\n\n```ts\nfunction double(value: number) {\n  return value * 2;\n}\n```\n\n" +
  Array.from(
    { length: 40 },
    (_, i) =>
      `Paragraph ${i + 1}: Keep the answer grounded in the recent conversation. Ask for clarification when context is missing.\n\n`,
  ).join("") +
  "Final line: confirm the next action together.";
async function fixture(state, theme) {
  const app = unwrap(await page.evaluate(() => window.everyhint.getSnapshot())),
    ai = unwrap(await page.evaluate(() => window.everyhint.getAssistant()));
  if (app.settings.theme !== theme)
    unwrap(
      await page.evaluate(
        (settings) => window.everyhint.saveSettings(settings),
        { ...app.settings, theme },
      ),
    );
  const active = state !== "idle";
  app.revision = ++revision;
  app.settings.theme = theme;
  app.session.state = active ? "ACTIVE" : "IDLE";
  app.session.sessionId = active ? "visual-fixture" : null;
  app.session.consent = active
    ? { microphone: true, systemAudio: true, screen: false, acknowledged: true }
    : null;
  for (const key of ["microphone", "systemAudio"])
    app.session.sources[key].state = active ? "CAPTURING" : "DISABLED";
  ai.revision = revision;
  ai.providers = ai.providers.map((p) => ({
    ...p,
    ready: true,
    auth: p.id === "codex" ? "chatgpt" : p.auth,
  }));
  ai.responses =
    state === "streaming" || state === "completed"
      ? [
          {
            requestId: `visual-${state}`,
            sessionId: ai.sessionId,
            provider: "codex",
            question: "What should I say next?",
            text:
              state === "streaming" ? responseText.slice(0, 600) : responseText,
            status: state === "streaming" ? "generating" : "completed",
            startedAt: Date.now(),
            firstTextAt: Date.now(),
            endedAt: state === "completed" ? Date.now() : null,
            error: null,
            usage: null,
            model: null,
          },
        ]
      : [];
  const listen = {
    revision,
    managed: active,
    phase: active ? "listening" : "idle",
    sharing: active
      ? { transcript: true, screen: false, expiresAt: Date.now() + 60000 }
      : null,
    busy: false,
    message: null,
    latestQuestion: null,
  };
  await desktop.evaluate(
    ({ BrowserWindow }, { app, ai, listen }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("overlay=1"),
      );
      w.webContents.send("everyhint:snapshot", app);
      w.webContents.send("everyhint:assistant", ai);
      w.webContents.send("everyhint:listen", listen);
    },
    { app, ai, listen },
  );
  await floating.waitForFunction(
    ({ state, theme }) =>
      document.documentElement.dataset.theme === theme &&
      document
        .querySelector(".overlay-listening")
        ?.textContent.includes(state === "idle" ? "Idle" : "Listening") &&
      (state === "streaming"
        ? !!document.querySelector(".overlay-generating")
        : true),
    { state, theme },
  );
  await floating.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  await floating.locator(".overlay-answer").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
}
async function layout() {
  return floating.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const answer = document.querySelector(".overlay-answer"),
      box = rect(answer),
      header = rect(document.querySelector(".overlay-header")),
      composer = rect(document.querySelector(".overlay-composer"));
    const controls = [...document.querySelectorAll("button,select,textarea")]
      .filter((el) => {
        const r = rect(el);
        if (r.width <= 0 || r.height <= 0) return false;
        return (
          !answer.contains(el) || (r.top >= box.top && r.bottom <= box.bottom)
        );
      })
      .map((el) => ({
        label: el.getAttribute("aria-label") || el.textContent.trim(),
        ...rect(el),
      }));
    const overlaps = [];
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i],
          b = controls[j];
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
          overlaps.push([a.label, b.label]);
      }
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      controls,
      overlaps,
      answer: box,
      header,
      composer,
      bodyOverflow:
        document.documentElement.scrollWidth > innerWidth + 1 ||
        document.documentElement.scrollHeight > innerHeight + 1,
      answerOverflow: answer.scrollHeight > answer.clientHeight + 1,
      styles: [...document.styleSheets].map((s) => s.href),
      forbidden: document.querySelectorAll(
        '.session-options,.meeting-session,.meetings-page,.transcription-panel,.settings-page,.intelligence-panel,.assistant-panel,[aria-label="Save session meeting title"],[aria-label="Save meeting history"]',
      ).length,
    };
  });
}
await mkdir("artifacts/overlay-fix/after", { recursive: true });
for (const scale of [1, 1.25, 1.5]) {
  const home = await mkdtemp(join(tmpdir(), "everyhint-overlay-fix-")),
    env = {
      ...process.env,
      EVERYHINT_TEST_USER_DATA: home,
      EVERYHINT_SPEECH_HOME: join(home, "speech"),
    };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [project, `--force-device-scale-factor=${scale}`],
    errors = [];
  try {
    desktop = await _electron.launch({
      executablePath: electron,
      args,
      cwd: project,
      env,
    });
    page = await dashboardPage(desktop);
    await finishSetup(page);
    floating = desktop.windows().find((p) => p.url().includes("overlay=1"));
    floating.on("pageerror", (error) => errors.push(error.message));
    await floating.locator(".floating-assistant").waitFor();
    await desktop.evaluate(({ BrowserWindow }) => {
      globalThis.__overlayCalls = [];
      globalThis.__newOverlayWindows = [];
      globalThis.fetch = async () => {
        throw Error("No network allowed in overlay visual fixtures");
      };
      for (const w of BrowserWindow.getAllWindows()) {
        const real = w.setSkipTaskbar.bind(w);
        w.setSkipTaskbar = (value) => {
          globalThis.__overlayCalls.push({ id: w.id, skip: value });
          real(value);
        };
      }
      const created = (_event, w) => globalThis.__newOverlayWindows.push(w.id);
      globalThis.__created = created;
    });
    await desktop.evaluate(({ app }) =>
      app.on("browser-window-created", globalThis.__created),
    );
    const initial = await windows(desktop),
      stable = await ids(desktop);
    observations.push({ scale, initial });
    check(
      initial.lock &&
        initial.windows.filter((w) => w.role === "dashboard").length === 1 &&
        initial.windows.filter((w) => w.role === "assistant").length === 1,
      `${scale}: one locked primary process, one dashboard and one assistant`,
    );
    await page.evaluate(() => window.everyhint.window("dashboard"));
    await page.evaluate(() => window.everyhint.window("overlay"));
    const both = await windows(desktop),
      dashboard = both.windows.find((w) => w.role === "dashboard"),
      overlay = both.windows.find((w) => w.role === "assistant");
    const styles = native(
      "-Action",
      "Inspect",
      "-Handle",
      String(dashboard.handle),
    );
    const overlayStyles = native(
      "-Action",
      "Inspect",
      "-Handle",
      String(overlay.handle),
    );
    observations.push({ scale, dashboardStyles: styles, overlayStyles });
    check(
      overlayStyles.toolWindow && !overlayStyles.noActivate,
      `${scale}: native Windows tool-window style excludes the overlay from taskbar/Alt+Tab while keeping it focusable`,
    );
    check(
      !styles.toolWindow &&
        !styles.noActivate &&
        styles.owner === 0 &&
        !dashboard.top,
      `${scale}: dashboard retains normal focus/Alt+Tab styles`,
    );
    check(
      await desktop.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes("overlay=1"),
        );
        return (
          globalThis.__overlayCalls.some((c) => c.id === w.id && c.skip) &&
          !globalThis.__overlayCalls.some((c) => c.id === w.id && !c.skip)
        );
      }),
      `${scale}: showing the real overlay applies only skipTaskbar true`,
    );
    await page.evaluate(() => window.everyhint.window("minimize"));
    check(
      (await windows(desktop)).windows.find((w) => w.role === "dashboard")
        .minimized,
      `${scale}: native dashboard minimise works`,
    );
    await page.evaluate(() => window.everyhint.window("dashboard"));
    check(
      !(await windows(desktop)).windows.find((w) => w.role === "dashboard")
        .minimized,
      `${scale}: restore recovers the dashboard`,
    );
    const second = spawn(electron, args, {
      cwd: project,
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    const secondCode = await new Promise((resolve, reject) => {
      second.once("exit", resolve);
      second.once("error", reject);
      setTimeout(
        () => reject(Error("Second instance did not exit")),
        10000,
      ).unref();
    });
    check(
      secondCode === 0 &&
        JSON.stringify(await ids(desktop)) === JSON.stringify(stable),
      `${scale}: a second native launch exits and reuses the original windows`,
    );
    const bindings = unwrap(
      await page.evaluate(() => window.everyhint.getSnapshot()),
    ).hotkeys;
    check(
      bindings.find((h) => h.action === "toggle").registered,
      `${scale}: native show/hide shortcut registered`,
    );
    for (let i = 0; i < 4; i++)
      native(
        "-Action",
        "Shortcut",
        "-Accelerator",
        bindings.find((h) => h.action === "toggle").accelerator,
      );
    check(
      JSON.stringify(await ids(desktop)) === JSON.stringify(stable),
      `${scale}: repeated native toggles never create a window`,
    );
    await page.evaluate(()=>window.everyhint.window("hide"));
    native("-Action","Shortcut","-Accelerator",bindings.find(h=>h.action==="assist").accelerator);
    const manual=await windows(desktop);
    check(manual.windows.find(w=>w.role==="dashboard").visible&&!manual.windows.find(w=>w.role==="assistant").visible,`${scale}: the separate manual-review shortcut opens the dashboard without mounting forms in the overlay`);
    await page.evaluate(()=>window.everyhint.window("overlay"));
    await page.evaluate(async () => {
      const s = (await window.everyhint.getSnapshot()).value;
      await window.everyhint.saveSettings({ ...s.settings, alwaysOnTop: true });
    });
    await floating.evaluate(() => window.everyhint.window("hide"));
    check(
      !(await windows(desktop)).windows.find((w) => w.role === "assistant").top,
      `${scale}: hidden assistant is never always-on-top`,
    );
    await page.evaluate(() => window.everyhint.window("overlay"));
    check(
      (await windows(desktop)).windows.find((w) => w.role === "assistant").top,
      `${scale}: explicit show restores the pin preference`,
    );
    await page.evaluate(async () => {
      const s = (await window.everyhint.getSnapshot()).value;
      await window.everyhint.saveSettings({
        ...s.settings,
        alwaysOnTop: false,
      });
    });
    await floating.evaluate(()=>window.everyhint.window("hide"));
    await desktop.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("overlay=1"));w.setBounds({x:-4000,y:-4000,width:480,height:580});screen.emit("display-metrics-changed",{},screen.getPrimaryDisplay(),["workArea"]);});
    const fitted=await windows(desktop),fittedOverlay=fitted.windows.find(w=>w.role==="assistant");
    const area=await desktop.evaluate(({screen})=>screen.getDisplayMatching({x:0,y:0,width:480,height:580}).workArea);
    check(fittedOverlay.bounds.x>=area.x&&fittedOverlay.bounds.y>=area.y&&fittedOverlay.bounds.x+fittedOverlay.bounds.width<=area.x+area.width+3&&fittedOverlay.bounds.y+fittedOverlay.bounds.height<=area.y+area.height+3,`${scale}: display-metrics handling returns an offscreen assistant to the work area`);
    check(!fittedOverlay.visible&&JSON.stringify(await ids(desktop))===JSON.stringify(stable),`${scale}: display changes neither show nor duplicate a hidden assistant`);
    await page.evaluate(()=>window.everyhint.window("overlay"));
    for (const width of [360, 480]) {
      await desktop.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes("overlay=1"))
            .setBounds({ width, height: 580 }),
        width,
      );
      for (const [theme, state] of [
        ["dark", "idle"],
        ["dark", "listening"],
        ["dark", "streaming"],
        ["dark", "completed"],
        ["light", "completed"],
      ]) {
        await fixture(state, theme);
        const proof = await layout();
        observations.push({ scale, width, theme, state, layout: proof });
        check(
          Math.abs(proof.dpr - scale) < 0.02,
          `${scale}/${width}/${theme}/${state}: actual renderer device scale factor`,
        );
        check(
          !proof.bodyOverflow &&
            proof.overlaps.length === 0 &&
            proof.header.bottom <= proof.answer.top + 1 &&
            proof.answer.bottom <= proof.composer.top + 1 &&
            proof.answer.height > 50,
          `${scale}/${width}/${theme}/${state}: independent header, scrolling answer and composer do not overlap`,
        );
        check(
          proof.controls.every(
            (c) =>
              c.left >= -1 &&
              c.right <= proof.width + 1 &&
              c.top >= -1 &&
              c.bottom <= proof.height + 1,
          ),
          `${scale}/${width}/${theme}/${state}: every visible control fits`,
        );
        check(
          proof.forbidden === 0 &&
            proof.styles.every((href) => !href?.includes("DashboardApp")),
          `${scale}/${width}/${theme}/${state}: no dashboard forms or stylesheet loaded`,
        );
        const filename = `scale-${scale}-${width}-${theme}-${state}.png`;
        await floating.screenshot({
          path: join("artifacts/overlay-fix/after", filename),
        });
        pictures.push({ file: filename, scale, width, theme, state });
        if (state === "completed") {
          check(
            proof.answerOverflow,
            `${scale}/${width}/${theme}: long answer has its own scroll area`,
          );
          const before = proof.composer.top;
          await floating.locator(".overlay-answer").focus();
          await floating.keyboard.press("End");
          await floating.keyboard.press("PageDown");
          await floating.waitForFunction(
            () => document.querySelector(".overlay-answer").scrollTop > 0,
          );
          await floating.evaluate(
            () =>
              new Promise((resolve) => {
                const area = document.querySelector(".overlay-answer");
                let last = -1,
                  steady = 0;
                const tick = () => {
                  const now = area.scrollTop;
                  steady = Math.abs(now - last) < 0.5 ? steady + 1 : 0;
                  last = now;
                  if (steady >= 5) resolve();
                  else requestAnimationFrame(tick);
                };
                tick();
              }),
          );
          check(
            await floating
              .locator(".overlay-answer")
              .evaluate(
                (el, before) =>
                  el.scrollTop > 0 &&
                  Math.abs(
                    document
                      .querySelector(".overlay-composer")
                      .getBoundingClientRect().top - before,
                  ) < 1,
                before,
              ),
            `${scale}/${width}/${theme}: long-answer keyboard scrolling keeps input fixed`,
          );
        }
      }
    }
    await fixture("listening", "dark");
    await floating
      .getByRole("button", { name: "Assistant menu", exact: true })
      .click();
    await floating
      .getByRole("menuitem", { name: "Open EveryHint", exact: true })
      .waitFor();
    check(
      await floating.evaluate(
        () => document.activeElement.textContent === "Open EveryHint",
      ),
      `${scale}: overflow menu receives keyboard focus`,
    );
    await floating.keyboard.press("ArrowDown");
    check(
      await floating.evaluate(
        () => document.activeElement.textContent === "View Context",
      ),
      `${scale}: arrow navigation reaches optional context`,
    );
    await floating.keyboard.press("Escape");
    check(
      (await floating
        .getByRole("button", { name: "Assistant menu", exact: true })
        .getAttribute("aria-expanded")) === "false",
      `${scale}: Escape closes the menu and returns focus`,
    );
    await floating.getByLabel("Your question", { exact: true }).focus();
    await floating.keyboard.type("help");
    await floating.keyboard.press("Shift+Enter");
    check(
      (
        await floating.getByLabel("Your question", { exact: true }).inputValue()
      ).includes("\n"),
      `${scale}: keyboard input and Shift+Enter remain usable`,
    );
    await floating.getByRole("button", { name: "Hide", exact: true }).click();
    check(
      !(await windows(desktop)).windows.find((w) => w.role === "assistant")
        .visible,
      `${scale}: the labelled Hide control dismisses only the assistant`,
    );
    await page.evaluate(() => window.everyhint.window("overlay"));
    await floating.reload();
    await floating.locator(".floating-assistant").waitFor();
    check(
      JSON.stringify(await ids(desktop)) === JSON.stringify(stable),
      `${scale}: renderer reload remounts one minimal tree without new windows`,
    );
    check(
      await floating.evaluate(
        () => document.querySelectorAll("#root > main").length === 1,
      ),
      `${scale}: exactly one renderer root after reload`,
    );
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("overlay=1"))
        .setBounds({ x: 100, y: 80, width: 440, height: 500 }),
    );
    const remembered = (await windows(desktop)).windows.find(
      (w) => w.role === "assistant",
    ).bounds;
    await page.evaluate(async () => {
      const s = (await window.everyhint.getSnapshot()).value;
      await window.everyhint.saveSettings({ ...s.settings, startHidden: true });
    });
    await desktop.close();
    desktop = undefined;
    desktop = await _electron.launch({
      executablePath: electron,
      args,
      cwd: project,
      env,
    });
    page = await dashboardPage(desktop);
    await page.waitForFunction(
      () => window.everyhint && document.querySelector(".app"),
    );
    const restored = await windows(desktop),
      restoredOverlay = restored.windows.find((w) => w.role === "assistant");
    check(
      restored.windows.length === 2 &&
        restored.windows.every((w) => !w.visible),
      `${scale}: restart creates one pair and honours start-hidden without duplicate windows`,
    );
    check(
      ["x", "y"].every(
        (key) => Math.abs(restoredOverlay.bounds[key] - remembered[key]) <= 2,
      ),
      `${scale}: valid assistant position survives restart with compact default size: ${JSON.stringify({ remembered, restored: restoredOverlay.bounds })}`,
    );
    check(
      unwrap(await page.evaluate(() => window.everyhint.getSnapshot())).session
        .state === "IDLE",
      `${scale}: restart restores no capture permission`,
    );
    check(errors.length === 0, `${scale}: zero renderer errors`);
  } finally {
    if (desktop) {
      await desktop.close();
      desktop = undefined;
    }
    await rm(home, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
await writeFile(
  "artifacts/overlay-fix/visual-verification.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      assertions: evidence.length,
      evidence,
      pictures,
      observations,
      physicalWindowsDpiChanged: false,
      scaleMethod:
        "Electron --force-device-scale-factor; actual devicePixelRatio asserted at 1/1.25/1.5",
      fixture:
        "real Electron windows/renderers with labelled renderer-only session and answer fixtures; no capture or provider request",
    },
    null,
    2,
  ),
);
console.log(
  `Overlay Windows/visual smoke passed: ${evidence.length} assertions, ${pictures.length} actual renderer screenshots, scales 100/125/150%, no remote requests.`,
);
