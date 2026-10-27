export type SessionState =
  "IDLE" | "READY" | "ACTIVE" | "PAUSED" | "STOPPED" | "ERROR";
export type SourceKind = "screen" | "window";
export interface CaptureSource {
  id: string;
  name: string;
  kind: SourceKind;
}
export interface Consent {
  screen: boolean;
  microphone: boolean;
  systemAudio: boolean;
  acknowledged: true;
}
export type CaptureSourceId = "screen" | "microphone" | "systemAudio";
export type AudioSourceId = Exclude<CaptureSourceId, "screen">;
export type CaptureSourceState =
  | "DISABLED"
  | "AVAILABLE"
  | "STARTING"
  | "CAPTURING"
  | "PAUSED"
  | "STOPPED"
  | "ERROR";
export interface SourceStatus {
  state: CaptureSourceState;
  name: string;
  deviceId: string | null;
  level: number;
  muted: boolean;
  error: string | null;
}
export interface MicrophoneDevice {
  deviceId: string;
  label: string;
}
export interface AudioPlan {
  microphone: boolean;
  systemAudio: boolean;
  microphoneDeviceId: string;
  microphoneMuted?: boolean;
}
export interface PrepareCapture {
  sourceId?: string;
  microphoneDeviceId?: string;
  consent: Consent;
}
export interface AudioDiagnostic extends SourceStatus {
  source: AudioSourceId;
}
export interface AudioMeterEvent {
  epoch: number;
  sources: Record<AudioSourceId, SourceStatus>;
}
export interface ScreenFrame {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
}
export interface SessionSnapshot {
  epoch: number;
  sources: Record<CaptureSourceId, SourceStatus>;
  state: SessionState;
  source: CaptureSource | null;
  consent: Consent | null;
  frame: ScreenFrame | null;
  frameCount: number;
  error: string | null;
}
export interface Settings {
  alwaysOnTop: boolean;
  compact: boolean;
  captureIntervalMs: number;
}
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type HotkeyAction = "toggle" | "pause" | "stop";
export type HotkeyBindings = Record<HotkeyAction, string>;
export interface HotkeyStatus {
  action: HotkeyAction;
  accelerator: string;
  registered: boolean;
}
export interface AppSnapshot {
  revision: number;
  session: SessionSnapshot;
  settings: Settings;
  hotkeys: HotkeyStatus[];
  warnings: string[];
  systemAudioSupported: boolean;
}
export type SessionAction = "start" | "pause" | "resume" | "stop";
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface EveryHintBridge {
  getSnapshot(): Promise<Result<AppSnapshot>>;
  listSources(consent: Consent): Promise<Result<CaptureSource[]>>;
  listMicrophones(consent: Consent): Promise<Result<MicrophoneDevice[]>>;
  prepare(input: PrepareCapture): Promise<Result<void>>;
  setMicrophoneMuted(muted: boolean): Promise<Result<void>>;
  session(action: SessionAction): Promise<Result<void>>;
  saveSettings(settings: Settings): Promise<Result<void>>;
  window(action: "hide" | "quit"): Promise<Result<void>>;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  onAudioMeters(listener: (event: AudioMeterEvent) => void): () => void;
}

// Native-rate float32 interleaved PCM; no recognition or 16 kHz conversion in P2.
export interface AudioFrame {
  source: AudioSourceId;
  streamId: string;
  sequence: number;
  timestamp: number;
  sampleRate: number;
  channels: number;
  format: "f32-interleaved";
  lifecycle: "started" | "data" | "stopped";
  samples: Float32Array;
}
export interface AudioCaptureManager {
  listMicrophones(): Promise<MicrophoneDevice[]>;
  start(
    plan: AudioPlan,
    update: (diagnostic: AudioDiagnostic) => void,
    fail: (message: string, source?: AudioSourceId) => void,
  ): Promise<void>;
  setMicrophoneMuted(muted: boolean): void;
  stop(): void;
}
export interface AudioCaptureProvider {
  readonly kind: AudioSourceId;
  start(
    consent: { authorised: true },
    onChunk: (frame: AudioFrame) => void,
  ): Promise<void>;
  stop(): Promise<void>;
}
export interface TranscriptionProvider {
  start(
    onTranscript: (
      event: Extract<ContextEvent, { type: "transcript" }>,
    ) => void,
  ): Promise<void>;
  acceptAudio(pcm: Float32Array): void;
  stop(): Promise<void>;
}
export type ContextEvent =
  | { type: "screen"; timestamp: number; frame: ScreenFrame }
  | { type: "transcript"; timestamp: number; text: string; final: boolean }
  | { type: "question"; timestamp: number; text: string };
export interface AssistantResponse {
  id: string;
  provider: "codex" | "claude";
  kind: "text" | "code";
  content: string;
  done: boolean;
}
export interface AIProvider {
  readonly id: "codex" | "claude";
  respond(
    context: readonly ContextEvent[],
    signal: AbortSignal,
  ): AsyncIterable<AssistantResponse>;
}
