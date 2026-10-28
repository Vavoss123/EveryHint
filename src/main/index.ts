import {
  app,
  clipboard,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  powerMonitor,
  protocol,
  screen,
  shell,
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
import { DEFAULT_HOTKEYS, HotkeyController } from "./hotkeys";
import {
  assetPath,
  contentSecurityPolicy,
  developmentUrl,
  trustedDocument,
} from "./security";
import { CaptureSessionController } from "./session";
import { SettingsStore } from "./settings";
import { ElectronAudioCapture } from "./audio-host";
import { SpeechInstallation } from "./transcription/models";
import { TranscriptionController } from "./transcription/controller";
import { AssistantController } from "./ai/controller";
import { ChatGptProvider } from "./ai/plan/provider";
import { ClaudeProvider } from "./ai/claude";
import { ChatGptAccounts } from "./ai/plan/accounts";
import { ProviderError, providerError } from "./ai/errors";
import design from "../../resources/design-tokens.json";
import {
  presentation,
  presentationBounds,
  type Presentation,
} from "./presentation";

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
let speech: TranscriptionController | undefined;
let assistant: AssistantController | undefined;
let accounts: ChatGptAccounts | undefined;
let chatgpt: ChatGptProvider | undefined;
let shortcuts: HotkeyController;
let hotkeys: HotkeyStatus[] = [];
const warnings: string[] = [];
let revision = 0;
let quitting = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastTrayState: string | undefined;
const presentationSizes = new Map<
  Presentation,
  { width: number; height: number }
>();
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
  const palette = design.light;
  const hex =
    state === "ACTIVE"
      ? palette.brand
      : state === "PAUSED"
        ? palette.warning
        : state === "ERROR"
          ? palette.danger
          : palette["brand-deep"];
  const color = [1, 3, 5].map((offset) =>
    parseInt(hex.slice(offset, offset + 2), 16),
  );
  const background = [1, 3, 5].map((offset) =>
    parseInt(palette.background.slice(offset, offset + 2), 16),
  );
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
      pixels[offset] = e ? color[2]! : background[2]!;
      pixels[offset + 1] = e ? color[1]! : background[1]!;
      pixels[offset + 2] = e ? color[0]! : background[0]!;
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
  if (speech && controller) speech.captureChanged(controller.value);
  if (assistant && controller) assistant.captureChanged(controller.value);
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
function configureSize(previous: Presentation): void {
  if (!window) return;
  const current = window.getBounds(),
    mode = presentation(store.settings);
  presentationSizes.set(previous, {
    width: current.width,
    height: current.height,
  });
  window.setMinimumSize(360, mode === "compact" ? 180 : 380);
  window.setBounds(
    presentationBounds(
      mode,
      current,
      screen.getDisplayMatching(current).workArea,
      presentationSizes.get(mode),
    ),
  );
}
function applyAppearance(): void {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(store.settings.alwaysOnTop);
  window.setOpacity(store.settings.opacity ?? 1);
  const dark =
    store.settings.theme === "dark" ||
    (store.settings.theme === "system" && nativeTheme.shouldUseDarkColors);
  window.setBackgroundColor((dark ? design.dark : design.light).background);
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
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
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
    (token, frame) => speech?.accept(token, frame) ?? false,
  );
  const speechRoot =
    process.env.EVERYHINT_SPEECH_HOME ??
    join(
      process.env.LOCALAPPDATA ?? app.getPath("userData"),
      "EveryHint",
      "speech",
    );
  const installation = new SpeechInstallation(speechRoot, () =>
    speech?.publish(),
  );
  speech = new TranscriptionController(
    installation,
    (value) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send("everyhint:transcription", value);
    },
    (token) => audio.setTranscriptionToken(token),
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

  let accountBinding = "";
  accounts = new ChatGptAccounts(
    join(app.getPath("userData"), "chatgpt-plan"),
    (value) => {
      const binding = `${value.selectedAccount}:${value.planUsage}:${value.accounts?.find((item) => item.id === value.selectedAccount)?.signedIn}`;
      if (binding !== accountBinding) {
        accountBinding = binding;
        chatgpt?.invalidate();
        assistant?.clear();
      }
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send("everyhint:account", value);
      void assistant?.inspect();
    },
    (url) => shell.openExternal(url),
  );
  chatgpt = new ChatGptProvider(accounts);
  assistant = new AssistantController(
    [chatgpt, new ClaudeProvider()],
    () => ({ capture: controller.value, events: speech?.value.events ?? [] }),
    (value) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send("everyhint:assistant", value);
    },
    90000,
    Date.now,
    () => controller.freshScreenshot(),
  );
  await accounts.restore();

  const saved = store.bounds;
  const area = screen.getDisplayMatching(
    saved ?? { x: 0, y: 0, width: 540, height: 720 },
  ).workArea;
  const width = Math.min(
    area.width,
    saved?.width ?? (store.settings.layout === "dashboard" ? 1040 : 540),
  );
  const height = Math.min(
    area.height,
    store.settings.compact ? 190 : Math.max(380, saved?.height ?? 720),
  );
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
    backgroundColor: design.light.background,
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
  applyAppearance();
  nativeTheme.on("updated", applyAppearance);
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("did-start-loading", () => {
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    if (controller.value.state !== "IDLE") controller.stop();
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    controller.fail(
      `EveryHint's interface stopped (${details.reason}). Capture has been stopped. Restart EveryHint.`,
    );
  });
  window.webContents.on("unresponsive", () => {
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
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
  const registerShortcuts = (): void => {
    hotkeys = shortcuts.register(
      {
        toggle: () => {
          safely(() => (window?.isVisible() ? hide() : show()));
        },
        pause: () => {
          safely(() => controller.togglePause());
        },
        stop: () => controller.stop(),
        assist: () => {
          show();
          if (window && !window.isDestroyed())
            window.webContents.send("everyhint:assist");
        },
        clear: () => assistant?.clear(),
      },
      {
        ...DEFAULT_HOTKEYS,
        assist: store.settings.assistShortcut ?? DEFAULT_HOTKEYS.assist,
        clear: store.settings.clearShortcut ?? DEFAULT_HOTKEYS.clear,
      },
    );
  };
  registerShortcuts();
  for (const hotkey of hotkeys)
    if (!hotkey.registered)
      warn(
        `Shortcut ${hotkey.accelerator} is unavailable (${hotkey.action}). Use the overlay or tray controls.`,
      );

  handle("everyhint:get", () => snapshot());
  handle("everyhint:account-get", () => accounts!.value);
  handle("everyhint:account-action", async (input) => {
    if (
      input !== "sign-in" &&
      input !== "sign-out" &&
      input !== "cancel" &&
      input !== "grant-plan"
    )
      throw new Error("Unknown account action.");
    assistant!.clear();
    chatgpt!.invalidate();
    if (input === "cancel") {
      accounts!.cancel();
      await assistant!.inspect();
      return;
    }
    if (input === "sign-in" || input === "grant-plan")
      await accounts!.signIn(input === "grant-plan");
    else await accounts!.signOut();
    if (
      accounts!.value.state !== "error" &&
      accounts!.value.state !== "cancelled"
    )
      await assistant!.inspect();
  });
  handle("everyhint:account-select", async (input) => {
    await accounts!.select(input);
    chatgpt!.invalidate();
    assistant!.clear();
    await assistant!.inspect();
  });
  handle("everyhint:ai-models", async (input) => {
    if (input !== undefined || assistant!.value.selected !== "codex")
      throw new Error("Select ChatGPT before refreshing models.");
    assistant!.clear();
    try {
      await chatgpt!.discoverModels();
    } catch (error) {
      throw new ProviderError(
        providerError(error).code,
        providerError(error).message,
      );
    } finally {
      await assistant!.inspect();
    }
  });
  handle("everyhint:ai-model-select", async (input) => {
    chatgpt!.selectModel(input);
    assistant!.clear();
    await assistant!.inspect();
  });
  handle("everyhint:ai-get", () => assistant!.value);
  handle("everyhint:ai-inspect", () => assistant!.inspect());
  handle("everyhint:ai-select", async (input) => {
    assistant!.select(input);
    accounts?.cancel();
    if (input !== "codex") chatgpt?.invalidate();
    await assistant!.inspect();
  });
  handle("everyhint:ai-billing", (input) => assistant!.billing(input));
  handle("everyhint:ai-review", (input) => assistant!.prepare(input));
  handle("everyhint:ai-remove", (input) => assistant!.removeContext(input));
  handle("everyhint:ai-ask", (input) => assistant!.ask(input));
  handle("everyhint:ai-copy", (input) => {
    if (typeof input !== "string" || input.length === 0 || input.length > 32000)
      throw new Error("Invalid response text.");
    clipboard.writeText(input);
  });
  handle("everyhint:ai-action", (input) => {
    if (input === "cancel") return assistant!.cancel();
    if (input === "clear") return assistant!.clear();
    if (input === "discard-review") return assistant!.discardReview();
    throw new Error("Unknown assistant action.");
  });
  handle("everyhint:transcription-get", () => speech!.value);
  handle("everyhint:transcription-action", (input) => {
    if (input === "enable") return speech!.enable();
    if (input === "pause") return speech!.pause();
    if (input === "clear") {
      assistant!.discardReview();
      return speech!.clear();
    }
    if (input === "inspect") return installation.inspect();
    throw new Error("Unknown transcription action.");
  });
  handle("everyhint:transcription-install", (input) =>
    installation.install(input),
  );
  handle("everyhint:transcription-settings", (input) =>
    speech!.configure(input),
  );
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
    const oldPresentation = presentation(store.settings);
    const oldShortcuts = [
      store.settings.assistShortcut,
      store.settings.clearShortcut,
    ].join("|");
    store.save(input, window?.getNormalBounds());
    if (
      oldShortcuts !==
      [store.settings.assistShortcut, store.settings.clearShortcut].join("|")
    )
      registerShortcuts();
    applyAppearance();
    if (oldPresentation !== presentation(store.settings))
      configureSize(oldPresentation);
    publish();
  });
  handle("everyhint:window", (input) => {
    if (input === "hide") hide();
    else if (input === "quit") app.quit();
    else throw new Error("Unknown window action.");
  });
  powerMonitor.on("suspend", () => {
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    controller.stop();
  });
  powerMonitor.on("lock-screen", () => {
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    controller.stop();
  });
  await window.loadURL(documentUrl);
  show();
  void assistant
    .inspect()
    .catch(() =>
      warn(
        "Could not inspect local provider authentication. Use Check connection to retry.",
      ),
    );
  void installation
    .inspect()
    .catch((error: unknown) =>
      warn(`Could not inspect speech models: ${errorMessage(error)}`),
    );
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
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  accounts?.dispose();
  controller?.stop();
  speech?.dispose();
  shortcuts?.dispose();
  if (saveTimer) clearTimeout(saveTimer);
  if (store) persistBounds();
  tray?.destroy();
  // Allow SDK teardown and temporary-directory removal to finish before exiting.
  void Promise.race([
    assistant?.dispose() ?? Promise.resolve(),
    new Promise<void>((done) => {
      const timer = setTimeout(done, 5000);
      timer.unref();
    }),
  ])
    .catch(() =>
      console.error(
        "Assistant cleanup did not complete. Check temporary EveryHint AI directories.",
      ),
    )
    .finally(() => app.quit());
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
