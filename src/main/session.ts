import type {
  AudioCaptureManager,
  AudioDiagnostic,
  AudioMeterEvent,
  CaptureSource,
  CaptureSourceId,
  SessionAction,
  SessionSnapshot,
  SourceStatus,
} from "../shared/contracts";
import {
  errorMessage,
  exactKeys,
  parseConsent,
  parseDeviceId,
  parseSourceId,
  record,
} from "../shared/validation";
import { ScreenCaptureService, type ScreenCaptureBackend } from "./capture";

const sourceIds: CaptureSourceId[] = ["screen", "microphone", "systemAudio"];
function statuses(): SessionSnapshot["sources"] {
  const status = (name: string): SourceStatus => ({
    state: "DISABLED",
    name,
    deviceId: null,
    level: 0,
    muted: false,
    error: null,
  });
  return {
    screen: status("Screen"),
    microphone: status("Microphone"),
    systemAudio: status("Windows system audio"),
  };
}
export class CaptureSessionController {
  private snapshot: SessionSnapshot = {
    sessionId: null,
    epoch: 0,
    state: "IDLE",
    consent: null,
    source: null,
    sources: statuses(),
    frame: null,
    frameCount: 0,
    error: null,
  };
  private sources = new Map<string, CaptureSource>();
  private microphones = new Set<string>(["default"]);
  private generation = 0;
  private microphoneMuted = false;
  private readonly capture: ScreenCaptureService;

  constructor(
    private readonly backend: ScreenCaptureBackend,
    private readonly interval: () => number,
    private readonly changed: () => void,
    private readonly audio?: AudioCaptureManager,
    private readonly meters: (event: AudioMeterEvent) => void = () => {},
    private readonly systemAudioSupported = false,
  ) {
    this.capture = new ScreenCaptureService(backend);
  }
  get value(): SessionSnapshot {
    return structuredClone(this.snapshot);
  }
  get metadata(): SessionSnapshot {
    return structuredClone({ ...this.snapshot, frame: null });
  }
  get indicator(): Pick<SessionSnapshot, "state" | "sources"> {
    return structuredClone({
      state: this.snapshot.state,
      sources: this.snapshot.sources,
    });
  }
  async freshScreenshot(): Promise<SessionSnapshot> {
    if (
      this.snapshot.state !== "ACTIVE" ||
      !this.snapshot.consent?.screen ||
      !this.snapshot.consent.acknowledged ||
      !this.snapshot.source ||
      this.snapshot.sources.screen.state !== "CAPTURING"
    )
      throw new Error(
        "Start or resume authorised screen capture before requesting a fresh screenshot.",
      );
    const generation = this.generation;
    const frame = await this.capture.snapshot(this.snapshot.source);
    if (generation !== this.generation || this.snapshot.state !== "ACTIVE")
      throw new Error(
        "Screen capture changed while preparing Assist. Review again.",
      );
    this.snapshot.frame = frame;
    this.snapshot.frameCount++;
    this.changed();
    return this.value;
  }
  private ensureSelectionAllowed(): void {
    if (["ACTIVE", "PAUSED"].includes(this.snapshot.state))
      throw new Error("Stop the current session before choosing a new source.");
  }
  async listSources(input: unknown): Promise<CaptureSource[]> {
    if (!parseConsent(input).screen)
      throw new Error("Screen consent is required to list screens.");
    this.ensureSelectionAllowed();
    const generation = this.generation;
    this.sources.clear();
    try {
      const sources = await this.backend.listSources();
      if (generation !== this.generation)
        throw new Error("Source selection was cancelled. Choose again.");
      this.sources = new Map(sources.map((source) => [source.id, source]));
      return sources;
    } catch (error) {
      if (generation === this.generation) this.fail(errorMessage(error));
      throw error;
    }
  }
  async listMicrophones(input: unknown) {
    if (!parseConsent(input).microphone)
      throw new Error("Microphone consent is required to list microphones.");
    this.ensureSelectionAllowed();
    if (!this.audio) throw new Error("Microphone capture is unavailable.");
    const generation = this.generation;
    const devices = await this.audio.listMicrophones();
    if (generation !== this.generation)
      throw new Error("Device selection was cancelled. Choose again.");
    this.microphones = new Set([
      "default",
      ...devices.map((device) => device.deviceId),
    ]);
    return devices;
  }
  prepare(input: unknown): void {
    this.ensureSelectionAllowed();
    const request = record(input);
    exactKeys(request, ["sourceId", "consent", "microphoneDeviceId"]);
    const consent = parseConsent(request.consent);
    if ((consent.microphone || consent.systemAudio) && !this.audio)
      throw new Error("Audio capture is unavailable.");
    if (consent.systemAudio && !this.systemAudioSupported)
      throw new Error("System audio loopback is supported on Windows only.");
    const source = consent.screen
      ? this.sources.get(parseSourceId(request.sourceId))
      : null;
    if (consent.screen && !source)
      throw new Error("Choose an available source before preparing capture.");
    if (!consent.screen && request.sourceId)
      throw new Error("A screen source requires screen consent.");
    const deviceId = consent.microphone
      ? parseDeviceId(request.microphoneDeviceId ?? "default")
      : null;
    if (deviceId && !this.microphones.has(deviceId))
      throw new Error("Refresh microphones and select an available device.");
    if (!consent.microphone && request.microphoneDeviceId)
      throw new Error("A microphone device requires microphone consent.");
    this.capture.stop();
    this.audio?.stop();
    this.microphoneMuted = false;
    const sources = statuses();
    for (const id of sourceIds)
      if (consent[id]) sources[id].state = "AVAILABLE";
    if (source) sources.screen.name = source.name;
    sources.microphone.deviceId = deviceId;
    this.snapshot = {
      sessionId: crypto.randomUUID(),
      epoch: ++this.generation,
      state: "READY",
      consent,
      source: source ? { ...source } : null,
      sources,
      frame: null,
      frameCount: 0,
      error: null,
    };
    this.changed();
  }
  action(action: SessionAction): void | Promise<void> {
    if (action === "stop") {
      this.stop();
      return;
    }
    if (
      (action === "start" && this.snapshot.state === "READY") ||
      (action === "resume" && this.snapshot.state === "PAUSED")
    )
      return this.activate();
    if (action === "pause" && this.snapshot.state === "ACTIVE") {
      ++this.generation;
      this.capture.stop();
      this.audio?.stop();
      this.snapshot.epoch = this.generation;
      this.snapshot.frame = null;
      this.snapshot.state = "PAUSED";
      for (const id of sourceIds)
        if (this.snapshot.consent?.[id])
          Object.assign(this.snapshot.sources[id], {
            state: "PAUSED",
            level: 0,
            muted: id === "microphone" && this.microphoneMuted,
          });
      this.changed();
      return;
    }
    throw new Error(`Cannot ${action} a session in ${this.snapshot.state}.`);
  }
  togglePause(): void {
    if (this.snapshot.state === "ACTIVE") this.action("pause");
    else if (this.snapshot.state === "PAUSED") void this.action("resume");
  }
  setMicrophoneMuted(input: unknown): void {
    if (typeof input !== "boolean") throw new Error("Mute must be a boolean.");
    if (
      this.snapshot.state !== "ACTIVE" ||
      this.snapshot.sources.microphone.state !== "CAPTURING" ||
      !this.snapshot.consent?.microphone
    )
      throw new Error(
        "An authorised microphone must be capturing before it can be muted.",
      );
    this.audio?.setMicrophoneMuted(input);
    this.microphoneMuted = input;
  }
  stop(): void {
    ++this.generation;
    this.capture.stop();
    this.audio?.stop();
    this.sources.clear();
    this.microphones = new Set(["default"]);
    this.microphoneMuted = false;
    const sources = statuses();
    for (const id of sourceIds)
      if (this.snapshot.sources[id].state !== "DISABLED") {
        sources[id].state = "STOPPED";
        sources[id].name = this.snapshot.sources[id].name;
      }
    this.snapshot = {
      sessionId: null,
      epoch: this.generation,
      state: "STOPPED",
      consent: null,
      source: null,
      sources,
      frame: null,
      frameCount: 0,
      error: null,
    };
    this.changed();
  }
  fail(message: string, failedSource?: CaptureSourceId): void {
    this.stop();
    this.snapshot.state = "ERROR";
    this.snapshot.error = message;
    if (failedSource)
      Object.assign(this.snapshot.sources[failedSource], {
        state: "ERROR",
        error: message,
      });
    this.changed();
  }
  private activate(): void | Promise<void> {
    const consent = parseConsent(this.snapshot.consent);
    if (consent.screen && !this.snapshot.source)
      throw new Error("Session consent and a source are required.");
    const generation = ++this.generation;
    this.snapshot.epoch = generation;
    this.snapshot.state = "ACTIVE";
    this.snapshot.frame = null;
    for (const id of sourceIds)
      if (consent[id])
        Object.assign(this.snapshot.sources[id], {
          state: id === "screen" ? "CAPTURING" : "STARTING",
          level: 0,
          muted: id === "microphone" && this.microphoneMuted,
        });
    this.changed();
    if (consent.screen && this.snapshot.source)
      this.capture.start(
        this.snapshot.source,
        this.interval(),
        (frame) => {
          this.snapshot.frame = frame;
          this.snapshot.frameCount++;
          this.changed();
        },
        (message) => this.fail(message, "screen"),
      );
    if ((consent.microphone || consent.systemAudio) && this.audio) {
      return this.audio
        .start(
          {
            microphone: consent.microphone,
            systemAudio: consent.systemAudio,
            microphoneDeviceId:
              this.snapshot.sources.microphone.deviceId ?? "default",
            microphoneMuted: this.microphoneMuted,
          },
          (update) => {
            if (
              generation === this.generation &&
              this.snapshot.state === "ACTIVE"
            )
              this.audioUpdate(update);
          },
          (message, source) => {
            if (generation === this.generation) this.fail(message, source);
          },
        )
        .catch((error: unknown) => {
          if (generation === this.generation) this.fail(errorMessage(error));
        });
    }
  }
  private audioUpdate(update: AudioDiagnostic): void {
    if (!this.snapshot.consent?.[update.source]) {
      this.fail("An unauthorised audio source attempted to start.");
      return;
    }
    const previous = this.snapshot.sources[update.source];
    const structural =
      previous.state !== update.state ||
      previous.name !== update.name ||
      previous.muted !== update.muted ||
      previous.deviceId !== update.deviceId;
    const { source, ...status } = update;
    this.snapshot.sources[source] = {
      ...status,
      level: status.muted ? 0 : status.level,
    };
    if (structural) this.changed();
    this.meters({
      epoch: this.snapshot.epoch,
      sources: {
        microphone: { ...this.snapshot.sources.microphone },
        systemAudio: { ...this.snapshot.sources.systemAudio },
      },
    });
  }
}
