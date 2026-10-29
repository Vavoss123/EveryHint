import {
  app,
  clipboard,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
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
import { existsSync, mkdirSync } from "node:fs";
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
import { IntelligenceController } from "./intelligence/controller";
import { sampleScreen } from "./intelligence/native-screen";
import { DEFAULT_INTELLIGENCE } from "../shared/intelligence";
import { parseIntelligenceSettings } from "../shared/validation";
import { ChatGptProvider } from "./ai/plan/provider";
import { ClaudeProvider } from "./ai/claude";
import { ChatGptAccounts } from "./ai/plan/accounts";
import { ProviderError, providerError } from "./ai/errors";
import { MeetingController } from "./meetings/controller";
import { MeetingAIController } from "./meetings/ai";
import { PostMeetingNotes } from "./meetings/post-notes";
import { HistoryWorker } from "./meetings/store";
import { MeetingPreferencesStore } from "./meetings/preferences";
import { historyProfile } from "./meetings/keys";
import { registerMeetingIPC } from "./meetings/ipc";
import { MeetingSharing } from "./meetings/sharing";
import { PersonalController } from "./personal/controller";
import { PersonalStore } from "./personal/store";
import { defaultConfig, migratePreset } from "../shared/modes";
import { WorkspaceController } from "./workspace/controller";
import { WorkspaceResume } from "./workspace/resume";
import { GoogleAccount } from "./google/accounts";
import { MeetingKeys } from "./meetings/keys";
import { AsyncEntry } from "@napi-rs/keyring";
import { exportBrief } from "./workspace/export";
import { parseReview } from "../shared/ai";
import { meetingId } from "../shared/meetings";
import { defaultCatalogModel } from "../shared/connection";
import { record } from "../shared/validation";
import { configureWindowPrivacy } from "./window-privacy";
import type { WindowPrivacy } from "../shared/desktop";
import { UpdateController } from "./updates";
import { updatePolicy } from "./updates-policy";
import { windowsUpdater } from "./updates-electron";
import updateConfiguration from "../../resources/windows-updates.json";
import design from "../../resources/design-tokens.json";
import { presentationBounds } from "./presentation";

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
let overlay: BrowserWindow | undefined;
let closePrompt = false;
let tray: Tray | undefined;
let store: SettingsStore;
let controller: CaptureSessionController;
let speech: TranscriptionController | undefined;
let transcriptionListening = false;
let currentAccountLabel = "Selected ChatGPT account";
let assistant: AssistantController | undefined;
let intelligence: IntelligenceController | undefined;
let accounts: ChatGptAccounts | undefined;
let chatgpt: ChatGptProvider | undefined;
let meetings: MeetingController | undefined;
let historyRoot = "";
let interfaceReady = false;
let meetingAI: MeetingAIController | undefined;
let postNotes: PostMeetingNotes | undefined;
let meetingProfile = "";
let personal: PersonalController | undefined;
let workspace: WorkspaceController | undefined;
let meetingAIRevision = 0;
let lastMeetingAIState = "";
let shortcuts: HotkeyController;
let hotkeys: HotkeyStatus[] = [];
const warnings: string[] = [];
let revision = 0;
let quitting = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastTrayState: string | undefined;
let privacy: WindowPrivacy | undefined;
let updates: UpdateController | undefined;
const devUrl = developmentUrl(
  process.env.ELECTRON_RENDERER_URL,
  app.isPackaged,
);
const documentUrl = devUrl
  ? new URL(devUrl).href
  : "everyhint://app/index.html";
const overlayUrl = new URL(documentUrl);
overlayUrl.searchParams.set("overlay", "1");
function broadcast(channel: string, value: unknown): void {
  for (const target of [window, overlay])
    if (target && !target.isDestroyed() && !target.webContents.isDestroyed())
      target.webContents.send(channel, value);
}

function warn(message: string): void {
  console.error(message);
  if (!warnings.includes(message)) warnings.push(message);
  if (warnings.length > 10) warnings.shift();
  if (store && controller) publish();
}
function meetingAISnapshot() {
  return {
    ...meetingAI!.value,
    ...postNotes!.value,
    revision: meetingAIRevision,
  };
}
function publishMeetingAI(): void {
  postNotes?.observe();
  updateTray();
  const signature = JSON.stringify({
    revision: meetingAI?.revision,
    post: postNotes?.value,
  });
  if (signature === lastMeetingAIState) return;
  lastMeetingAIState = signature;
  meetingAIRevision++;
  if (
    meetingAI &&
    postNotes &&
    window &&
    !window.isDestroyed() &&
    !window.webContents.isDestroyed()
  )
    broadcast("everyhint:meeting-ai-state", meetingAISnapshot());
}
function cancelMeetingWork(): void {
  postNotes?.revoke();
  meetingAI?.cancel();
}
function clearAssistantContext(): void {
  cancelMeetingWork();
  assistant?.clear();
}
function stopCapture(): void {
  cancelMeetingWork();
  intelligence?.revoke("Session stopped. Renew remote sharing explicitly.");
  assistant?.cancel();
  assistant?.discardReview();
  controller?.stop();
}
function lockMeetingHistory(reason: string): void {
  workspace?.lock();
  personal?.lock();
  postNotes?.revoke(reason);
  meetingAI?.resetProfile();
  meetings?.lock(reason);
}
function updateMeetingProfile(): void {
  if (!meetings) return;
  const connection = accounts?.value,
    selected = connection?.accounts?.find(
      (account) =>
        account.id === connection.selectedAccount && account.signedIn,
    );
  const profile = historyProfile(app.getPath("userData"), selected?.id ?? null);
  if (profile === meetingProfile) return;
  meetingProfile = profile;
  personal?.switchProfile(profile);
  workspace?.switchProfile(profile);
  cancelMeetingWork();
  meetingAI?.resetProfile();
  meetings.switchProfile(
    profile,
    selected
      ? `${selected.label} · local encrypted history`
      : "Local-only history · this Windows user",
  );
  if (interfaceReady) restoreExistingHistory();
}
function restoreExistingHistory(): void {
  if (
    historyRoot &&
    meetingProfile &&
    existsSync(join(historyRoot, `${meetingProfile}.sqlite`))
  )
    void meetings?.unlock().catch(() => {
      /* Existing controller exposes Unlock History and preserves encrypted data. */
    });
}
function snapshot(): AppSnapshot {
  return {
    revision,
    privacy,
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
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
}
function showOverlay(): void {
  if (!overlay || overlay.isDestroyed()) return;
  if (overlay.isMinimized()) overlay.restore();
  overlay.show();
  overlay.focus();
}
function toggleOverlay(): void {
  if (overlay?.isVisible() && !overlay.isMinimized()) overlay.hide();
  else showOverlay();
}
async function closeDashboard(): Promise<void> {
  if (closePrompt || quitting) return;
  if (!["ACTIVE", "PAUSED", "READY"].includes(controller.value.state)) {
    app.quit();
    return;
  }
  closePrompt = true;
  try {
    const result = await dialog.showMessageBox(window!, {
      type: "question",
      message: "Your session is still open",
      detail:
        "Keep it running with a tray indicator and Stop control, or stop capture and quit EveryHint.",
      buttons: ["Keep running in background", "Stop and quit", "Cancel"],
      defaultId: 2,
      cancelId: 2,
    });
    if (result.response === 0) {
      hide();
      overlay?.hide();
    }
    if (result.response === 1) {
      stopCapture();
      app.quit();
    }
  } finally {
    closePrompt = false;
  }
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
  const value = controller.indicator;
  const state = value.state;
  const summary = Object.entries(value.sources)
    .map(
      ([id, source]) =>
        `${id === "systemAudio" ? "System" : id === "microphone" ? "Mic" : "Screen"} ${source.state.toLowerCase()}${source.muted ? " (muted)" : ""}`,
    )
    .join(" · ");
  const sharing = intelligence?.indicator;
  const recording = meetings?.indicator.saving ?? false;
  const postEnabled = postNotes?.enabled ?? false;
  const mode =
    sharing?.mode === "live"
      ? "Live Assist"
      : sharing?.mode === "auto-hint"
        ? "Auto-Hint"
        : "Manual";
  const remote = sharing?.enabled
    ? `LIVE REMOTE ENABLED · ${sharing.requests}/${sharing.limit} attempts`
    : `${mode} · live sharing off`;
  const key = `${state}:${summary}:${remote}:${sharing?.expiresAt ?? 0}:${recording}:${postEnabled}`;
  if (key === lastTrayState) return;
  lastTrayState = key;
  tray.setImage(icon(state));
  tray.setToolTip(
    `EveryHint · ${remote} · ${recording ? "saving final text" : "temporary"}${postEnabled ? " · End notes enabled" : ""} · ${state} · ${summary}`.slice(
      0,
      127,
    ),
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `EveryHint · ${state}`, enabled: false },
      { label: remote, enabled: false },
      {
        label: recording
          ? "Saved meeting · final text is persisted locally"
          : "Temporary session · no meeting persistence",
        enabled: false,
      },
      {
        label: "Cancel automatic End notes",
        enabled: postEnabled,
        click: () =>
          postNotes?.revoke(
            "Automatic post-meeting notes cancelled from the tray.",
          ),
      },
      {
        label: "Pause Live Assist",
        enabled: sharing?.enabled ?? false,
        click: () =>
          intelligence?.revoke(
            "Paused from the tray. Renew explicitly to resume automatic sharing.",
          ),
      },
      ...Object.entries(value.sources).map(([id, source]) => ({
        label: `${id === "systemAudio" ? "System audio" : id === "microphone" ? "Microphone" : "Screen"}: ${source.state.toLowerCase()}${source.muted ? " (muted)" : ""}`,
        enabled: false,
      })),
      { label: "Show dashboard", click: show },
      {
        label: "Show / hide overlay",
        accelerator: store.settings.toggleShortcut ?? DEFAULT_HOTKEYS.toggle,
        click: toggleOverlay,
      },
      {
        label: "Hide to Tray",
        click: () =>
          safely(() => {
            hide();
            overlay?.hide();
          }),
      },
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
        accelerator: store.settings.stopShortcut ?? DEFAULT_HOTKEYS.stop,
        enabled: ["ACTIVE", "PAUSED", "READY"].includes(state),
        click: stopCapture,
      },
      { type: "separator" },
      { label: "Quit EveryHint", click: () => app.quit() },
    ]),
  );
  if (window && !window.isDestroyed())
    window.setTitle(
      `EveryHint · ${mode}${sharing?.enabled ? " · remote enabled" : ""}${postEnabled ? " · End notes enabled" : ""}${recording ? " · saving final text" : ""} · ${state}`,
    );
}
function publish(): void {
  if (speech && controller) speech.captureChanged(controller.value);
  if (assistant && controller) assistant.captureChanged(controller.value);
  if (intelligence && controller)
    intelligence.update(controller.value, speech?.value.events ?? []);
  if (meetings && controller)
    meetings.observe(controller.metadata, speech?.value.events ?? []);
  publishMeetingAI();
  revision++;
  updateTray();
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    broadcast("everyhint:snapshot", snapshot());
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
function applyAppearance(): void {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(false);
  window.setOpacity(1);
  overlay?.setAlwaysOnTop(store.settings.alwaysOnTop);
  overlay?.setOpacity(store.settings.opacity ?? 1);
  const requested = store.settings.protectWindow === true;
  if (!privacy || privacy.requested !== requested) {
    privacy = configureWindowPrivacy(window, requested);
    if (overlay) {
      const overlayPrivacy = configureWindowPrivacy(overlay, requested);
      if (
        overlayPrivacy.state === "error" ||
        overlayPrivacy.state === "unsupported"
      )
        privacy = overlayPrivacy;
    }
  }
  const dark =
    store.settings.theme === "dark" ||
    (store.settings.theme === "system" && nativeTheme.shouldUseDarkColors);
  window.setBackgroundColor((dark ? design.dark : design.light).background);
  overlay?.setBackgroundColor((dark ? design.dark : design.light).background);
}
function handle(
  channel: string,
  action: (input: unknown, sender: BrowserWindow) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(
    channel,
    async (
      event: IpcMainInvokeEvent,
      input: unknown,
    ): Promise<Result<unknown>> => {
      try {
        const sender = [window, overlay].find(
          (target) =>
            target &&
            !target.isDestroyed() &&
            event.sender === target.webContents,
        );
        if (
          !sender ||
          event.senderFrame !== sender.webContents.mainFrame ||
          !trustedDocument(
            event.senderFrame.url,
            sender === overlay ? overlayUrl.href : documentUrl,
          )
        ) {
          throw new Error("Untrusted EveryHint IPC sender.");
        }
        return { ok: true, value: await action(input, sender) };
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
  const installation = new SpeechInstallation(
    speechRoot,
    () => speech?.publish(),
    app.isPackaged
      ? {
          directory: join(process.resourcesPath, "speech"),
          manifestPath: join(directory, "speech-runtime.json"),
        }
      : undefined,
  );
  speech = new TranscriptionController(
    installation,
    (value) => {
      transcriptionListening = value.state === "LISTENING";
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:transcription", value);
      if (controller) intelligence?.update(controller.value, value.events);
      if (controller) meetings?.observe(controller.metadata, value.events);
      publishMeetingAI();
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
        broadcast("everyhint:audio-meters", event);
    },
    process.platform === "win32",
  );

  let accountBinding = "";
  accounts = new ChatGptAccounts(
    join(app.getPath("userData"), "chatgpt-plan"),
    (value) => {
      const binding = `${value.selectedAccount}:${value.planUsage}:${value.accounts?.find((item) => item.id === value.selectedAccount)?.signedIn}`;
      currentAccountLabel =
        value.accounts?.find((item) => item.id === value.selectedAccount)
          ?.label ?? "Selected ChatGPT account";
      if (binding !== accountBinding) {
        accountBinding = binding;
        chatgpt?.invalidate();
        assistant?.clear();
      }
      updateMeetingProfile();
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:account", value);
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
        broadcast("everyhint:assistant", value);
      intelligence?.assistantChanged(value);
      meetingAI?.assistantChanged(value);
      publishMeetingAI();
    },
    90000,
    Date.now,
    () => controller.freshScreenshot(),
    () =>
      personal?.modeContext ?? {
        mode: defaultConfig().modes[0]!,
        outputLanguage: "default",
      },
    (query, ids) => personal!.knowledgeContext(query, ids),
    (query, selection) => workspace!.buildContext(query, selection),
  );
  intelligence = new IntelligenceController(
    assistant,
    (value) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:intelligence", value);
      updateTray();
    },
    Date.now,
    sampleScreen,
    () => ({
      accountId: accounts?.identity ?? null,
      accountLabel: currentAccountLabel,
      transcribing: transcriptionListening,
      ...(workspace?.liveContext
        ? { workspaceSources: workspace.liveContext }
        : {}),
      ...(personal
        ? {
            modeId: personal.modeContext.mode.id,
            modeName: personal.modeContext.mode.name,
            knowledgeSources: personal.value.documents
              .filter(
                (d) =>
                  d.enabled &&
                  personal!.modeContext.mode.knowledgeIds.includes(d.id),
              )
              .map((d) => ({ id: d.id, name: d.name })),
          }
        : {}),
    }),
  );
  intelligence.configure(store.settings.intelligence ?? DEFAULT_INTELLIGENCE);
  const meetingRoot = process.env.EVERYHINT_TEST_USER_DATA
    ? join(app.getPath("userData"), "meetings")
    : join(
        process.env.LOCALAPPDATA ?? app.getPath("userData"),
        "EveryHint",
        "meetings",
      );
  historyRoot = meetingRoot;
  personal = new PersonalController(
    (profile) => new PersonalStore(join(meetingRoot, "personal"), profile),
    (value) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:personal-state", value);
    },
    () => {
      workspace?.invalidate();
      intelligence?.revoke(
        "AI mode or personal knowledge changed. Renew sharing explicitly.",
      );
      cancelMeetingWork();
      assistant?.clear();
    },
    async () => {
      const result = await dialog.showOpenDialog(window!, {
        title: "Import local knowledge",
        properties: ["openFile"],
        filters: [
          {
            name: "Reference documents",
            extensions: ["pdf", "docx", "txt", "md"],
          },
        ],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );
  meetings = new MeetingController(
    () => ({
      capture: controller.metadata,
      events: speech?.value.events ?? [],
    }),
    async (profile) => {
      const worker = new HistoryWorker(meetingRoot, profile);
      await worker.open();
      return worker;
    },
    new MeetingPreferencesStore(join(meetingRoot, "preferences")),
    (value) => {
      updateTray();
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:meetings-state", value);
      publishMeetingAI();
    },
  );
  meetingAI = new MeetingAIController(
    assistant,
    meetings,
    () => ({
      capture: controller.metadata,
      events: speech?.value.events ?? [],
    }),
    () => ({ accountId: accounts?.identity ?? null }),
    publishMeetingAI,
    Date.now,
    (id) => personal!.template(id),
  );
  postNotes = new PostMeetingNotes(
    meetingAI,
    meetings,
    assistant,
    () => controller.metadata,
    () => ({
      accountId: accounts?.identity ?? null,
      accountLabel: currentAccountLabel,
      transcribing: transcriptionListening,
    }),
    publishMeetingAI,
  );
  workspace = new WorkspaceController(
    {
      store: (profile) =>
        new PersonalStore(
          join(meetingRoot, "context"),
          profile,
          new MeetingKeys((p) => new AsyncEntry("EveryHint.Context.v1", p)),
        ),
      google: (profile, service, changed) =>
        GoogleAccount.forProfile(
          profile,
          service,
          (url) => shell.openExternal(url),
          changed,
        ),
      changed: (value) => {
        if (
          window &&
          !window.isDestroyed() &&
          !window.webContents.isDestroyed()
        )
          broadcast("everyhint:workspace-state", value);
      },
      invalidate: () => {
        if (intelligence?.value.live?.sharing.workspace?.enabled)
          intelligence.revoke(
            "Calendar, People or memory context changed. Renew sharing explicitly.",
          );
        const current = assistant?.value;
        if (
          current?.review?.workspaceContext ||
          current?.responses.some((response) => response.workspaceContext)
        )
          assistant?.clear();
      },
      notify: (event, titles) => {
        if (!Notification.isSupported()) return () => {};
        const toast = new Notification({
          title: titles ? event.title : "Upcoming meeting",
          body: "View preparation in EveryHint. Opening this notification never joins or starts capture.",
          silent: false,
        });
        toast.on("click", () => {
          if (window && !window.isDestroyed()) {
            show();
            broadcast("everyhint:workspace-navigate", event.id);
          }
        });
        toast.show();
        return () => toast.close();
      },
      openURL: (url) => shell.openExternal(url),
      assistant,
      meetings,
      personal,
      captureIdle: () =>
        ["IDLE", "STOPPED"].includes(controller.metadata.state),
      exportText: (name, text, valid) =>
        exportBrief(
          async (suggested) => {
            const result = await dialog.showSaveDialog(window!, {
              title: "Export unencrypted pre-call brief",
              defaultPath: suggested,
              filters: [{ name: "Text brief", extensions: ["txt"] }],
            });
            return result.canceled ? null : (result.filePath ?? null);
          },
          name,
          text,
          valid,
        ),
    },
    new WorkspaceResume(join(meetingRoot, "context-resume")),
  );
  updateMeetingProfile();
  await accounts.restore();

  const saved = store.bounds;
  const area = screen.getDisplayMatching(
    saved ?? { x: 0, y: 0, width: 540, height: 720 },
  ).workArea;
  const width = Math.min(area.width, Math.max(860, saved?.width ?? 1040));
  const height = Math.min(area.height, Math.max(540, saved?.height ?? 760));
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
    minHeight: 380,
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: false,
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
  overlay = new BrowserWindow({
    title: "EveryHint Assistant",
    width: 480,
    height: 580,
    minWidth: 360,
    minHeight: 380,
    frame: false,
    show: false,
    alwaysOnTop: store.settings.alwaysOnTop,
    skipTaskbar: false,
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
  overlay.setMenu(null);
  overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  overlay.webContents.on("will-navigate", (event) => event.preventDefault());
  overlay.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  overlay.webContents.on("render-process-gone", () => {
    stopCapture();
    overlay?.hide();
  });
  overlay.webContents.on("unresponsive", () => {
    stopCapture();
    overlay?.hide();
  });
  overlay.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      overlay?.hide();
    }
  });
  overlay.webContents.on("did-start-navigation", (details) => {
    if (!interfaceReady || !details.isMainFrame || details.isSameDocument)
      return;
    stopCapture();
    lockMeetingHistory("Assistant reloaded. Permissions were revoked.");
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
  });
  const fitWindows = (): void => {
    for (const target of [window, overlay]) {
      if (!target || target.isDestroyed()) continue;
      const bounds = target.getNormalBounds();
      target.setBounds(
        presentationBounds(
          target === window ? "dashboard" : "assistant",
          bounds,
          screen.getDisplayMatching(bounds).workArea,
          bounds,
        ),
      );
    }
  };
  screen.on("display-removed", fitWindows);
  screen.on("display-metrics-changed", fitWindows);
  screen.on("display-added", fitWindows);
  applyAppearance();
  nativeTheme.on("updated", applyAppearance);
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("did-start-navigation", (details) => {
    // A loading spinner can restart without replacing the trusted document.
    if (!interfaceReady || !details.isMainFrame || details.isSameDocument)
      return;
    lockMeetingHistory(
      "Interface reload locked local history; no recording or remote permission is restored.",
    );
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    if (controller.value.state !== "IDLE") stopCapture();
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    lockMeetingHistory("Interface failure locked local history.");
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    controller.fail(
      `EveryHint's interface stopped (${details.reason}). Capture has been stopped. Restart EveryHint.`,
    );
  });
  window.webContents.on("unresponsive", () => {
    lockMeetingHistory("An unresponsive interface locked local history.");
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    controller.fail("EveryHint is unresponsive. Capture has been stopped.");
  });
  window.on("resize", queueBounds);
  window.on("move", queueBounds);
  window.on("minimize", () => {
    if (!tray || tray.isDestroyed()) stopCapture();
  });
  window.on("hide", () => {
    if (!quitting && (!tray || tray.isDestroyed())) stopCapture();
  });
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      void closeDashboard().catch((error) => warn(errorMessage(error)));
    }
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
    lastTrayState = undefined;
    hotkeys = shortcuts.register(
      {
        toggle: () => {
          safely(toggleOverlay);
        },
        pause: () => {
          safely(() => controller.togglePause());
        },
        stop: stopCapture,
        assist: () => {
          showOverlay();
          overlay?.webContents.send("everyhint:assist");
        },
        clear: clearAssistantContext,
      },
      {
        ...DEFAULT_HOTKEYS,
        assist: store.settings.assistShortcut ?? DEFAULT_HOTKEYS.assist,
        clear: store.settings.clearShortcut ?? DEFAULT_HOTKEYS.clear,
        toggle: store.settings.toggleShortcut ?? DEFAULT_HOTKEYS.toggle,
        pause: store.settings.pauseShortcut ?? DEFAULT_HOTKEYS.pause,
        stop: store.settings.stopShortcut ?? DEFAULT_HOTKEYS.stop,
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
  updates = new UpdateController(
    app.isPackaged && process.platform === "win32"
      ? updatePolicy(updateConfiguration)
      : null,
    app.getVersion(),
    (policy) => windowsUpdater(policy, join(directory, "update-config.yml")),
    (value) => {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        broadcast("everyhint:updates", value);
    },
    async () => {
      if (!window || window.isDestroyed()) return false;
      const result = await dialog.showMessageBox(window, {
        type: "question",
        buttons: ["Restart and install", "Later"],
        defaultId: 1,
        cancelId: 1,
        message: `Install EveryHint ${updates?.value.availableVersion ?? "update"}?`,
        detail:
          "Save your work first. Restarting stops capture and remote AI requests. Your encrypted local data and models are preserved.",
      });
      if (result.response !== 0) return false;
      stopCapture();
      await meetings?.flush();
      lockMeetingHistory("Restarting to install a verified update.");
      accounts?.cancel();
      return true;
    },
  );
  handle("everyhint:update", async (input) => {
    await updates!.command(input as import("../shared/updates").UpdateAction);
    return updates!.value;
  });
  handle("everyhint:desktop-status", (input) => {
    if (input !== undefined) throw new Error("Desktop status takes no input.");
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
      updates: updates!.value,
    };
  });
  registerMeetingIPC({
    snapshotAI: meetingAISnapshot,
    sourcesChanged: () => workspace?.sourceChanged("meeting"),
    handle,
    meetings,
    sharing: new MeetingSharing(meetings, {
      choose: async (suggested, extension, label) => {
        if (!window || window.isDestroyed())
          throw Error("The main window is unavailable.");
        const result = await dialog.showSaveDialog(window, {
          title: "Export unencrypted meeting content",
          defaultPath: suggested,
          buttonLabel: "Export plaintext copy",
          filters: [{ name: label, extensions: [extension] }],
        });
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      clipboard: (text) => clipboard.writeText(text),
      email: (url) => shell.openExternal(url),
    }),
    ai: meetingAI,
    post: postNotes,
    stop: () => controller.stop(),
    cancelContent: () => {
      cancelMeetingWork();
      intelligence?.revoke("Local meeting content was cleared or deleted.");
      assistant?.clear();
    },
    revokeLive: () => intelligence?.revoke("Meeting AI was chosen."),
    changed: () => {
      if (meetings && window && !window.isDestroyed())
        broadcast("everyhint:meetings-state", meetings.value);
      publishMeetingAI();
    },
  });
  handle("everyhint:intelligence-get", () => intelligence!.value);
  handle("everyhint:intelligence-authorise", (input) =>
    intelligence!.authorise(input),
  );
  handle("everyhint:intelligence-pause", (input) => {
    if (input !== undefined)
      throw new Error("Pause Live Assist takes no parameters.");
    intelligence!.revoke(
      "Paused by you. Renew explicitly to resume automatic sharing.",
    );
  });
  handle("everyhint:intelligence-mode", (input) => {
    intelligence!.mode(input);
  });
  handle("everyhint:intelligence-configure", (input) => {
    const settings = parseIntelligenceSettings(input);
    store.save(
      { ...store.settings, intelligence: settings },
      window?.getNormalBounds(),
    );
    intelligence!.configure(settings);
    assistant!.discardReview();
    publish();
  });
  handle("everyhint:intelligence-action", (input) =>
    intelligence!.action(input),
  );
  handle("everyhint:intelligence-dismiss", (input) =>
    intelligence!.dismiss(input),
  );
  handle("everyhint:account-get", () => accounts!.value);
  handle("everyhint:account-action", async (input) => {
    cancelMeetingWork();
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
    try {
      if (
        (input === "sign-in" || input === "grant-plan") &&
        accounts!.value.state === "signed-in" &&
        accounts!.value.planUsage
      ) {
        await chatgpt!.discoverModels();
        const model = defaultCatalogModel(
          (await chatgpt!.inspect()).modelDetails,
        );
        if (model) chatgpt!.selectModel(model.id);
      }
    } finally {
      await assistant!.inspect();
    }
  });
  handle("everyhint:account-select", async (input) => {
    cancelMeetingWork();
    await accounts!.select(input);
    chatgpt!.invalidate();
    assistant!.clear();
    await assistant!.inspect();
  });
  handle("everyhint:ai-models", async (input) => {
    cancelMeetingWork();
    if (input !== undefined || assistant!.value.selected !== "codex")
      throw new Error("Select ChatGPT before refreshing models.");
    assistant!.clear();
    try {
      await chatgpt!.discoverModels();
      const status = await chatgpt!.inspect();
      const model = defaultCatalogModel(status.modelDetails);
      if (model) chatgpt!.selectModel(model.id);
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
    cancelMeetingWork();
    chatgpt!.selectModel(input);
    assistant!.clear();
    await assistant!.inspect();
  });
  handle("everyhint:ai-get", () => assistant!.value);
  handle("everyhint:personal-get", () => personal!.value);
  handle("everyhint:workspace-get", (input) => {
    if (input !== undefined)
      throw new Error("Workspace status takes no payload.");
    return workspace!.value;
  });
  handle("everyhint:workspace-command", (input) => workspace!.command(input));
  handle("everyhint:workspace-query", (input) => workspace!.query(input));
  handle("everyhint:personal-command", async (input) => {
    const result = await personal!.command(input);
    if (result.scopeId !== personal!.value.scopeId)
      throw new Error(
        "Personal profile changed before context reconciliation.",
      );
    const command = (input as { value?: { type?: string; id?: string } })
      ?.value;
    if (command?.type === "document" || command?.type === "delete-document")
      await workspace?.sourceChanged("document", command.id);
    else await workspace?.reconcileSources();
    if (result.scopeId !== personal!.value.scopeId)
      throw new Error(
        "Personal profile changed during context reconciliation.",
      );
    return result;
  });
  handle("everyhint:personal-inspect", (input) => personal!.inspect(input));
  handle("everyhint:personal-search", (input) => personal!.search(input));
  handle("everyhint:ai-inspect", () => assistant!.inspect());
  handle("everyhint:ai-select", async (input) => {
    cancelMeetingWork();
    assistant!.select(input);
    accounts?.cancel();
    if (input !== "codex") chatgpt?.invalidate();
    await assistant!.inspect();
  });
  handle("everyhint:ai-billing", (input) => {
    cancelMeetingWork();
    return assistant!.billing(input);
  });
  handle("everyhint:ai-review", async (input) => {
    cancelMeetingWork();
    intelligence!.revoke("Manual Assist was started.");
    if (Object.hasOwn(record(input), "preset")) {
      const parsed = parseReview(input);
      await personal!.command({
        scopeId: personal!.value.scopeId,
        value: { type: "select", id: migratePreset(parsed.preset!) },
      });
    }
    return assistant!.prepare(input);
  });
  handle("everyhint:ai-remove", (input) => assistant!.removeContext(input));
  handle("everyhint:ai-ask", (input) => {
    intelligence!.revoke("A manually reviewed request was chosen.");
    if (assistant!.value.review?.meetingContext) return meetingAI!.ask(input);
    return assistant!.ask(input);
  });
  handle("everyhint:ai-copy", (input) => {
    if (typeof input !== "string" || input.length === 0 || input.length > 32000)
      throw new Error("Invalid response text.");
    clipboard.writeText(input);
  });
  handle("everyhint:ai-action", (input) => {
    cancelMeetingWork();
    intelligence!.revoke(
      "The assistant was cancelled, cleared or manually edited.",
    );
    if (input === "cancel") return assistant!.cancel();
    if (input === "clear") return assistant!.clear();
    if (input === "discard-review") return assistant!.discardReview();
    throw new Error("Unknown assistant action.");
  });
  handle("everyhint:transcription-get", () => speech!.value);
  handle("everyhint:transcription-action", (input) => {
    if (input === "enable") return speech!.enable();
    if (input === "pause") {
      intelligence!.revoke("Local transcription was paused.");
      return speech!.pause();
    }
    if (input === "clear") {
      cancelMeetingWork();
      intelligence!.clear();
      assistant!.discardReview();
      return speech!.clear();
    }
    if (input === "inspect") return installation.inspect();
    throw new Error("Unknown transcription action.");
  });
  handle("everyhint:transcription-install", (input) =>
    installation.install(input),
  );
  handle("everyhint:transcription-settings", (input) => {
    intelligence!.revoke("Local transcription settings changed.");
    return speech!.configure(input);
  });
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
    if (input === "stop") {
      stopCapture();
      return;
    }
    return controller.action(input as SessionAction);
  });
  handle("everyhint:settings", (input) => {
    // Appearance is safe to edit during capture; interval changes apply on next start/resume.
    const oldIntelligence = JSON.stringify(
      store.settings.intelligence ?? DEFAULT_INTELLIGENCE,
    );
    const oldShortcuts = [
      store.settings.assistShortcut,
      store.settings.clearShortcut,
      store.settings.toggleShortcut,
      store.settings.pauseShortcut,
      store.settings.stopShortcut,
    ].join("|");
    store.save(input, window?.getNormalBounds());
    if (
      oldIntelligence !==
      JSON.stringify(store.settings.intelligence ?? DEFAULT_INTELLIGENCE)
    ) {
      intelligence!.configure(
        store.settings.intelligence ?? DEFAULT_INTELLIGENCE,
      );
      assistant!.discardReview();
    }
    if (
      oldShortcuts !==
      [
        store.settings.assistShortcut,
        store.settings.clearShortcut,
        store.settings.toggleShortcut,
        store.settings.pauseShortcut,
        store.settings.stopShortcut,
      ].join("|")
    )
      registerShortcuts();
    applyAppearance();
    publish();
  });
  handle("everyhint:window", (input, sender) => {
    if (input === "hide") {
      if (sender === overlay) overlay?.hide();
      else {
        hide();
        overlay?.hide();
      }
    } else if (input === "minimize") sender.minimize();
    else if (input === "maximize") {
      if (sender.isMaximized()) sender.unmaximize();
      else sender.maximize();
    } else if (input === "close") {
      if (sender === overlay) overlay?.hide();
      else return closeDashboard();
    } else if (input === "overlay") toggleOverlay();
    else if (input === "dashboard") show();
    else if (input === "account") {
      show();
      window?.webContents.send("everyhint:account-settings");
    } else if (
      ["move-left", "move-right", "move-up", "move-down"].includes(
        input as string,
      ) &&
      overlay
    ) {
      const bounds = overlay.getBounds();
      bounds.x += input === "move-left" ? -40 : input === "move-right" ? 40 : 0;
      bounds.y += input === "move-up" ? -40 : input === "move-down" ? 40 : 0;
      overlay.setBounds(
        presentationBounds(
          "assistant",
          bounds,
          screen.getDisplayMatching(bounds).workArea,
          bounds,
        ),
      );
    } else if (input === "quit") app.quit();
    else throw new Error("Unknown window action.");
  });
  handle("everyhint:meeting-navigate", (input) => {
    const id = input === undefined ? undefined : meetingId(input);
    show();
    window?.webContents.send("everyhint:meeting-navigate", id);
  });
  powerMonitor.on("suspend", () => {
    lockMeetingHistory(
      "Windows suspend locked local history and revoked remote permission.",
    );
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    stopCapture();
  });
  powerMonitor.on("lock-screen", () => {
    lockMeetingHistory(
      "Windows lock locked local history and revoked remote permission.",
    );
    accounts?.cancel();
    chatgpt?.invalidate();
    assistant?.clear();
    stopCapture();
  });
  await window.loadURL(documentUrl);
  await overlay.loadURL(overlayUrl.href);
  interfaceReady = true;
  restoreExistingHistory();
  await workspace.restoreChosen();
  if (!store.settings.startHidden || !tray || tray.isDestroyed())
    window.showInactive();
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
      if (quitting) return;
      dialog.showErrorBox("EveryHint could not start", errorMessage(error));
      app.quit();
    });
}
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  updates?.dispose();
  personal?.lock();
  const workspaceClosed = workspace?.dispose();
  postNotes?.dispose();
  meetingAI?.cancel();
  accounts?.dispose();
  controller?.stop();
  speech?.dispose();
  intelligence?.dispose();
  shortcuts?.dispose();
  if (saveTimer) clearTimeout(saveTimer);
  if (store) persistBounds();
  tray?.destroy();
  // Allow SDK teardown and temporary-directory removal to finish before exiting.
  void Promise.race([
    Promise.all([
      workspaceClosed ?? Promise.resolve(),
      assistant?.dispose() ?? Promise.resolve(),
      (async () => {
        try {
          await meetings?.flush();
        } finally {
          meetings?.lock("Application closed; history is locked.");
        }
      })(),
    ]),
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
    .finally(() => {
      meetings?.lock("Application closed; history is locked.");
      app.quit();
    });
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
