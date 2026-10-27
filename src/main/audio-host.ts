import { BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  Session,
  WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import type {
  AudioCaptureManager,
  AudioDiagnostic,
  AudioPlan,
  AudioSourceId,
  MicrophoneDevice,
  AudioFrame,
} from "../shared/contracts";
import { parseAudioReport, type AudioWorkerPlan } from "../shared/audio-ipc";
import { errorMessage } from "../shared/validation";
import { trustedDocument } from "./security";
import { audioPermissionAllowed } from "./audio-permissions";
import { parseAudioFrame } from "../shared/transcription";
import { exactKeys, record } from "../shared/validation";

interface Operation {
  window: BrowserWindow;
  plan: AudioWorkerPlan;
  resolve: (devices?: MicrophoneDevice[]) => void;
  reject: (error: Error) => void;
  settled: boolean;
  timeout: ReturnType<typeof setTimeout>;
  update: (diagnostic: AudioDiagnostic) => void;
  failure: (message: string, source?: AudioSourceId) => void;
  displayGranted: boolean;
  activationGranted: boolean;
}
export class ElectronAudioCapture implements AudioCaptureManager {
  private operation: Operation | undefined;
  private readonly browserSession: Session;
  private transcriptionToken: string | null = null;
  constructor(
    private readonly url: string,
    private readonly preload: string,
    configureSession: (target: Session, audio: boolean) => void,
    private readonly pcm: (token: string, frame: AudioFrame) => boolean = () =>
      false,
  ) {
    this.browserSession = session.fromPartition("everyhint-audio", {
      cache: false,
    });
    configureSession(this.browserSession, true);
    this.browserSession.setPermissionCheckHandler(
      (contents, permission, _origin, details) => {
        const current = this.trustedContents(contents);
        return (
          !!current &&
          audioPermissionAllowed(
            current.plan,
            permission,
            [details.mediaType ?? "unknown"],
            details.isMainFrame &&
              (!details.requestingUrl ||
                trustedDocument(details.requestingUrl, this.url)),
          )
        );
      },
    );
    this.browserSession.setPermissionRequestHandler(
      (contents, permission, callback, details) => {
        const current = this.trustedContents(contents);
        const media = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
        callback(
          !!current &&
            audioPermissionAllowed(
              current.plan,
              permission,
              media,
              details.isMainFrame &&
                trustedDocument(details.requestingUrl, this.url),
            ),
        );
      },
    );
    this.browserSession.setDisplayMediaRequestHandler((request, callback) => {
      const current = this.operation;
      if (
        !current ||
        current.plan.mode !== "capture" ||
        !current.plan.capture.systemAudio ||
        current.displayGranted ||
        process.platform !== "win32" ||
        !request.audioRequested ||
        !request.videoRequested ||
        request.frame !== current.window.webContents.mainFrame ||
        !trustedDocument(request.frame.url, this.url)
      ) {
        callback(null);
        return;
      }
      current.displayGranted = true;
      void desktopCapturer
        .getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        })
        .then((sources) => {
          if (
            this.operation !== current ||
            current.window.isDestroyed() ||
            !request.frame ||
            request.frame.detached ||
            !sources[0]
          ) {
            callback(null);
            return;
          }
          // 'loopback' leaves speakers playing. Never use loopbackWithMute.
          callback({ video: sources[0], audio: "loopback" });
        })
        .catch((error: unknown) => {
          if (this.operation === current) {
            callback(null);
            this.fail(
              `Windows loopback could not start: ${errorMessage(error)}`,
              "systemAudio",
            );
          }
        });
    });
    ipcMain.handle(
      "everyhint:audio-configuration",
      (event: IpcMainInvokeEvent) => this.trusted(event).plan,
    );
    ipcMain.handle(
      "everyhint:audio-pcm",
      (event: IpcMainInvokeEvent, value: unknown): boolean => {
        const current = this.trusted(event),
          input = record(value);
        exactKeys(input, ["token", "frame"]);
        if (
          current.plan.mode !== "capture" ||
          !this.transcriptionToken ||
          input.token !== this.transcriptionToken
        )
          return false;
        const frame = parseAudioFrame(input.frame);
        if (!current.plan.capture[frame.source])
          throw new Error("PCM source is not authorised.");
        return this.pcm(this.transcriptionToken, frame);
      },
    );
    ipcMain.handle("everyhint:audio-ready", (event: IpcMainInvokeEvent) => {
      const current = this.trusted(event);
      if (current.plan.mode !== "capture")
        throw new Error("Audio activation was not authorised.");
      if (current.activationGranted)
        throw new Error("Audio activation was already requested.");
      current.activationGranted = true;
      // Fixed local function; user activation is needed by getDisplayMedia.
      void current.window.webContents
        .executeJavaScript("window.startEveryHintAudio()", true)
        .catch((error: unknown) => {
          if (this.operation === current)
            this.fail(`Audio startup failed: ${errorMessage(error)}`);
        });
    });
    ipcMain.on(
      "everyhint:audio-report",
      (event: IpcMainEvent, value: unknown) => {
        let current: Operation;
        try {
          current = this.trusted(event);
        } catch {
          return;
        } // Ignore events from disposed/untrusted renderers.
        try {
          const report = parseAudioReport(value);
          if (report.type === "error") {
            this.fail(report.message, report.source);
            return;
          }
          if (report.type === "devices") {
            if (current.plan.mode !== "devices")
              throw new Error("Unexpected microphone enumeration.");
            this.complete(current, report.devices);
            this.destroy(current);
            return;
          }
          if (current.plan.mode !== "capture")
            throw new Error("Unexpected audio capture.");
          for (const source of report.sources) {
            if (!current.plan.capture[source.source])
              throw new Error("Audio source was not authorised.");
            current.update(source);
          }
          if (
            this.operation === current &&
            (!current.plan.capture.microphone ||
              report.sources.some(
                (source) => source.source === "microphone",
              )) &&
            (!current.plan.capture.systemAudio ||
              report.sources.some((source) => source.source === "systemAudio"))
          )
            this.complete(current);
        } catch (error) {
          if (this.operation === current)
            this.fail(`Invalid audio capture report: ${errorMessage(error)}`);
        }
      },
    );
  }
  private trustedContents(contents: WebContents | null): Operation | undefined {
    const current = this.operation;
    return current &&
      !current.window.isDestroyed() &&
      contents === current.window.webContents &&
      trustedDocument(contents.getURL(), this.url)
      ? current
      : undefined;
  }
  private trusted(event: IpcMainEvent | IpcMainInvokeEvent): Operation {
    const current = this.trustedContents(event.sender);
    if (
      !current ||
      event.senderFrame !== current.window.webContents.mainFrame ||
      !event.senderFrame ||
      !trustedDocument(event.senderFrame.url, this.url)
    )
      throw new Error("Untrusted EveryHint audio worker.");
    return current;
  }
  async listMicrophones(): Promise<MicrophoneDevice[]> {
    return this.create(
      "devices",
      { microphone: true, systemAudio: false, microphoneDeviceId: "default" },
      () => {},
      () => {},
    ).then((devices) => devices ?? []);
  }
  async start(
    plan: AudioPlan,
    update: Operation["update"],
    failure: Operation["failure"],
  ): Promise<void> {
    return this.create("capture", plan, update, failure).then(() => {});
  }
  private create(
    mode: AudioWorkerPlan["mode"],
    capture: AudioPlan,
    update: Operation["update"],
    failure: Operation["failure"],
  ): Promise<MicrophoneDevice[] | undefined> {
    if (this.operation)
      return Promise.reject(
        new Error(
          "Another audio operation is already running. Stop or wait before trying again.",
        ),
      );
    const window = new BrowserWindow({
      width: 64,
      height: 64,
      show: false,
      title: "EveryHint audio capture",
      skipTaskbar: true,
      webPreferences: {
        session: this.browserSession,
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    try {
      window.setMenu(null);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
    } catch (error) {
      window.destroy();
      throw error;
    }
    return new Promise((resolve, reject) => {
      const current: Operation = {
        window,
        plan: { token: randomUUID(), mode, capture: { ...capture } },
        resolve,
        reject,
        update,
        failure,
        settled: false,
        displayGranted: false,
        activationGranted: false,
        timeout: setTimeout(() => {
          if (this.operation === current)
            this.fail(
              "Audio startup timed out. Check Windows permissions and devices, then prepare again.",
            );
        }, 20000),
      };
      this.operation = current;
      window.webContents.on("render-process-gone", () => {
        if (this.operation === current)
          this.fail(
            "The audio capture context stopped. Capture has been released.",
          );
      });
      window.webContents.on("unresponsive", () => {
        if (this.operation === current)
          this.fail(
            "Audio capture became unresponsive. Capture has been released.",
          );
      });
      window.on("closed", () => {
        if (this.operation === current)
          this.fail("The audio capture context closed.");
      });
      void window.loadURL(this.url).catch((error: unknown) => {
        if (this.operation === current)
          this.fail(`Audio context could not load: ${errorMessage(error)}`);
      });
    });
  }
  private complete(current: Operation, devices?: MicrophoneDevice[]): void {
    if (current.settled) return;
    clearTimeout(current.timeout);
    current.settled = true;
    current.resolve(devices);
  }
  private fail(message: string, source?: AudioSourceId): void {
    const current = this.operation;
    if (!current) return;
    this.destroy(current);
    current.failure(message, source);
    if (!current.settled) {
      current.settled = true;
      current.reject(new Error(message));
    }
  }
  private destroy(current: Operation): void {
    this.transcriptionToken = null;
    if (this.operation === current) this.operation = undefined;
    clearTimeout(current.timeout);
    if (!current.window.isDestroyed()) current.window.destroy();
  }
  setMicrophoneMuted(muted: boolean): void {
    const current = this.operation;
    if (
      !current ||
      current.plan.mode !== "capture" ||
      !current.plan.capture.microphone
    )
      throw new Error("No authorised microphone is capturing.");
    current.window.webContents.send("everyhint:audio-control", { muted });
  }
  stop(): void {
    const current = this.operation;
    if (!current) return;
    this.destroy(current);
    if (!current.settled) {
      current.settled = true;
      current.reject(new Error("Audio operation cancelled."));
    }
  }
  setTranscriptionToken(token: string | null): void {
    this.transcriptionToken = token;
    const current = this.operation;
    if (
      current &&
      current.plan.mode === "capture" &&
      !current.window.isDestroyed()
    )
      current.window.webContents.send("everyhint:audio-control", {
        transcriptionToken: token,
      });
  }
}
