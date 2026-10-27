import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  protocol,
  screen,
  session,
  Tray,
} from "electron";
import type { IpcMainInvokeEvent, Session } from "electron";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSnapshot,
  HotkeyStatus,
  Result,
  SessionAction,
  SessionState,
} from "../shared/contracts";
import { errorMessage } from "../shared/validation";
import { ElectronScreenCapture } from "./electron-capture";
import { HotkeyController } from "./hotkeys";
import {
  assetPath,
  contentSecurityPolicy,
  developmentUrl,
  trustedDocument,
} from "./security";
import { CaptureSessionController } from "./session";
import { SettingsStore } from "./settings";
import { ElectronAudioCapture } from "./audio-host";

const directory = dirname(fileURLToPath(import.meta.url));
app.setName("EveryHint");
app.setAppUserModelId("com.everyhint.desktop");
// Smoke tests get isolated settings and never start native desktop capture.
if (process.env.EVERYHINT_TEST_USER_DATA)
  app.setPath("userData", process.env.EVERYHINT_TEST_USER_DATA);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "everyhint",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let store: SettingsStore;
let controller: CaptureSessionController;
let shortcuts: HotkeyController;
let hotkeys: HotkeyStatus[] = [];
const warnings: string[] = [];
let revision = 0;
let quitting = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastTrayState: string | undefined;
let expandedHeight = 440;
const devUrl = developmentUrl(process.env.ELECTRON_RENDERER_URL);
const documentUrl = devUrl
  ? new URL(devUrl).href
  : "everyhint://app/index.html";

function warn(message: string): void {
  console.error(message);
  if (!warnings.includes(message)) warnings.push(message);
  if (warnings.length > 10) warnings.shift();
  if (store && controller) publish();
}
function snapshot(): AppSnapshot {
  return {
    revision,
    session: controller.value,
    settings: { ...store.settings },
    hotkeys,
    warnings: [...warnings],
    systemAudioSupported: process.platform === "win32",
  };
}
function icon(state: SessionState): Electron.NativeImage {
  const color =
    state === "ACTIVE"
      ? [255, 96, 109]
      : state === "PAUSED"
        ? [246, 190, 89]
        : state === "ERROR"
          ? [255, 133, 74]
          : [153, 143, 255];
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const e =
        (x >= 7 && x <= 11 && y >= 6 && y <= 25) ||
        (x >= 11 &&
          x <= 24 &&
          ((y >= 6 && y <= 10) ||
            (y >= 14 && y <= 17) ||
            (y >= 22 && y <= 25)));
      const offset = (y * 32 + x) * 4;
      pixels[offset] = e ? color[2]! : 22;
      pixels[offset + 1] = e ? color[1]! : 22;
      pixels[offset + 2] = e ? color[0]! : 27;
      pixels[offset + 3] = 255;
    }
  return nativeImage.createFromBitmap(pixels, { width: 32, height: 32 });
}
function show(): void {
  window?.show();
  window?.focus();
}
function hide(): void {
  if (!tray || tray.isDestroyed())
    throw new Error(
      "The tray indicator is unavailable. Keep EveryHint visible or quit.",
    );
  window?.hide();
}
function safely(action: () => void): void {
  try {
    action();
  } catch (error) {
    warn(errorMessage(error));
    show();
  }
}
function updateTray(): void {
  if (!tray || tray.isDestroyed()) return;
  const value = controller.value;
  const state = value.state;
  const summary = Object.entries(value.sources)
    .map(
      ([id, source]) =>
        `${id === "systemAudio" ? "System" : id === "microphone" ? "Mic" : "Screen"} ${source.state.toLowerCase()}${source.muted ? " (muted)" : ""}`,
    )
    .join(" · ");
  const key = `${state}:${summary}`;
  if (key === lastTrayState) return;
  lastTrayState = key;
  tray.setImage(icon(state));
  tray.setToolTip(`EveryHint · ${state} · ${summary}`.slice(0, 127));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `EveryHint · ${state}`, enabled: false },
      ...Object.entries(value.sources).map(([id, source]) => ({
        label: `${id === "systemAudio" ? "System audio" : id === "microphone" ? "Microphone" : "Screen"}: ${source.state.toLowerCase()}${source.muted ? " (muted)" : ""}`,
        enabled: false,
      })),
      { label: "Show EveryHint", click: show },
      {
        label:
          state === "PAUSED" ? "Resume authorised capture" : "Pause capture",
        enabled: ["ACTIVE", "PAUSED"].includes(state),
        click: () => {
          safely(() => controller.togglePause());
        },
      },
      {
        label: "Stop all capture",
        accelerator: "Control+Alt+Shift+X",
        click: () => controller.stop(),
      },
      { type: "separator" },
      { label: "Quit EveryHint", click: () => app.quit() },
    ]),
  );
  window?.setTitle(`EveryHint · ${state}`);
}
function publish(): void {
  revision++;
  updateTray();
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send("everyhint:snapshot", snapshot());
}
function persistBounds(): void {
  if (!window || window.isDestroyed()) return;
  try {
    store.save(store.settings, window.getNormalBounds());
  } catch (error) {
    warn(`Could not save EveryHint settings. ${errorMessage(error)}`);
  }
}
function queueBounds(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistBounds, 250);
}
function configureSize(): void {
  if (!window) return;
  window.setAlwaysOnTop(store.settings.alwaysOnTop);
  if (store.settings.compact) {
    expandedHeight = Math.max(440, window.getBounds().height);
    window.setMinimumSize(360, 180);
    window.setSize(window.getBounds().width, 190);
  } else {
    window.setMinimumSize(360, 380);
    window.setSize(window.getBounds().width, expandedHeight);
  }
}
function handle(
  channel: string,
  action: (input: unknown) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(
    channel,
    async (
      event: IpcMainInvokeEvent,
      input: unknown,
    ): Promise<Result<unknown>> => {
      try {
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          !trustedDocument(event.senderFrame.url, documentUrl)
        ) {
          throw new Error("Untrusted EveryHint IPC sender.");
        }
        return { ok: true, value: await action(input) };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
  );
}

function configureSession(target: Session, audio = false): void {
  const csp = contentSecurityPolicy(devUrl, audio);
  target.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  target.setPermissionCheckHandler(() => false);
  target.setDisplayMediaRequestHandler((_request, callback) => callback(null));
  target.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = devUrl
      ? url.origin === new URL(devUrl).origin ||
        url.origin === new URL(devUrl).origin.replace("http:", "ws:")
      : url.protocol === "everyhint:" && url.hostname === "app";
    callback({ cancel: !local && url.protocol !== "data:" });
  });
  target.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers))
      if (key.toLowerCase() === "content-security-policy") delete headers[key];
    callback({
      responseHeaders: { ...headers, "Content-Security-Policy": [csp] },
    });
  });
  target.protocol.handle("everyhint", async (request) => {
    try {
      const path = assetPath(join(directory, "../renderer"), request.url);
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      };
      const content = await readFile(path);
      return new Response(content, {
        headers: {
          "Content-Type": mime[extname(path)] ?? "application/octet-stream",
          "Content-Security-Policy": csp,
        },
      });
    } catch {
      return new Response("EveryHint asset not found", { status: 404 });
    }
  });
}

async function initialise(): Promise<void> {
  mkdirSync(app.getPath("userData"), { recursive: true });
  store = new SettingsStore(
    join(app.getPath("userData"), "settings.json"),
    warn,
  );
  configureSession(session.defaultSession);
  const audio = new ElectronAudioCapture(
    new URL("audio.html", documentUrl).href,
    join(directory, "../preload/audio.cjs"),
    configureSession,
  );
  controller = new CaptureSessionController(
    new ElectronScreenCapture(),
    () => store.settings.captureIntervalMs,
    publish,
    audio,
    (event) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send("everyhint:audio-meters", event);
    },
    process.platform === "win32",
  );

  const saved = store.bounds;
  const area = screen.getDisplayMatching(
    saved ?? { x: 0, y: 0, width: 460, height: 440 },
  ).workArea;
  const width = Math.min(area.width, saved?.width ?? 460);
  const height = Math.min(
    area.height,
    store.settings.compact ? 190 : Math.max(380, saved?.height ?? 440),
  );
  expandedHeight = Math.max(440, height);
  window = new BrowserWindow({
    title: "EveryHint",
    width,
    height,
    x: Math.max(
      area.x,
      Math.min(
        saved?.x ?? area.x + area.width - width - 40,
        area.x + area.width - width,
      ),
    ),
    y: Math.max(
      area.y,
      Math.min(saved?.y ?? area.y + 80, area.y + area.height - height),
    ),
    minWidth: 360,
    minHeight: store.settings.compact ? 180 : 380,
    frame: false,
    alwaysOnTop: store.settings.alwaysOnTop,
    backgroundColor: "#111217",
    show: false,
    icon: icon("IDLE"),
    webPreferences: {
      preload: join(directory, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("did-start-loading", () => {
    if (controller.value.state !== "IDLE") controller.stop();
  });
  window.webContents.on("render-process-gone", (_event, details) =>
    controller.fail(
      `EveryHint's interface stopped (${details.reason}). Capture has been stopped. Restart EveryHint.`,
    ),
  );
  window.webContents.on("unresponsive", () => {
    controller.fail("EveryHint is unresponsive. Capture has been stopped.");
  });
  window.on("resize", queueBounds);
  window.on("move", queueBounds);
  window.on("minimize", () => {
    if (!tray || tray.isDestroyed()) controller.stop();
  });
  window.on("hide", () => {
    if (!quitting && (!tray || tray.isDestroyed())) controller.stop();
  });
  window.on("close", (event) => {
    if (!quitting && tray && !tray.isDestroyed()) {
      event.preventDefault();
      safely(hide);
    } else if (!quitting) app.quit();
  });
  try {
    tray = new Tray(icon("IDLE"));
    tray.setTitle("EveryHint");
    tray.on("double-click", show);
    updateTray();
  } catch (error) {
    warn(
      `EveryHint tray unavailable. Hiding is disabled. ${errorMessage(error)}`,
    );
  }
  shortcuts = new HotkeyController(globalShortcut);
  hotkeys = shortcuts.register({
    toggle: () => {
      safely(() => (window?.isVisible() ? hide() : show()));
    },
    pause: () => {
      safely(() => controller.togglePause());
    },
    stop: () => controller.stop(),
  });
  for (const hotkey of hotkeys)
    if (!hotkey.registered)
      warn(
        `Shortcut ${hotkey.accelerator} is unavailable (${hotkey.action}). Use the overlay or tray controls.`,
      );

  handle("everyhint:get", () => snapshot());
  handle("everyhint:sources", (input) => controller.listSources(input));
  handle("everyhint:microphones", (input) => controller.listMicrophones(input));
  handle("everyhint:microphone-mute", (input) =>
    controller.setMicrophoneMuted(input),
  );
  handle("everyhint:prepare", (input) => controller.prepare(input));
  handle("everyhint:session", (input) => {
    if (
      typeof input !== "string" ||
      !["start", "pause", "resume", "stop"].includes(input)
    )
      throw new Error("Unknown session action.");
    return controller.action(input as SessionAction);
  });
  handle("everyhint:settings", (input) => {
    // Appearance is safe to edit during capture; interval changes apply on next start/resume.
    const oldCompact = store.settings.compact;
    store.save(input, window?.getNormalBounds());
    window?.setAlwaysOnTop(store.settings.alwaysOnTop);
    if (oldCompact !== store.settings.compact) configureSize();
    publish();
  });
  handle("everyhint:window", (input) => {
    if (input === "hide") hide();
    else if (input === "quit") app.quit();
    else throw new Error("Unknown window action.");
  });
  powerMonitor.on("suspend", () => controller.stop());
  powerMonitor.on("lock-screen", () => controller.stop());
  await window.loadURL(documentUrl);
  show();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  void app
    .whenReady()
    .then(initialise)
    .catch((error: unknown) => {
      dialog.showErrorBox("EveryHint could not start", errorMessage(error));
      app.quit();
    });
}
app.on("before-quit", () => {
  quitting = true;
  controller?.stop();
  shortcuts?.dispose();
  if (saveTimer) clearTimeout(saveTimer);
  if (store) persistBounds();
  tray?.destroy();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
