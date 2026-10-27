export type SessionState =
  "IDLE" | "READY" | "ACTIVE" | "PAUSED" | "STOPPED" | "ERROR";
export type SourceKind = "screen" | "window";
export interface CaptureSource {
  id: string;
  name: string;
  kind: SourceKind;
}
export interface Consent {
  screen: true;
  microphone: false;
  systemAudio: false;
  acknowledged: true;
}
export interface ScreenFrame {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
}
export interface SessionSnapshot {
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
}
export type SessionAction = "start" | "pause" | "resume" | "stop";
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface EveryHintBridge {
  getSnapshot(): Promise<Result<AppSnapshot>>;
  listSources(consent: Consent): Promise<Result<CaptureSource[]>>;
  prepare(input: { sourceId: string; consent: Consent }): Promise<Result<void>>;
  session(action: SessionAction): Promise<Result<void>>;
  saveSettings(settings: Settings): Promise<Result<void>>;
  window(action: "hide" | "quit"): Promise<Result<void>>;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
}

// Contracts only: no audio, transcription, authentication or inference in P1.
export interface AudioCaptureProvider {
  readonly kind: "microphone" | "system-audio";
  start(
    consent: { authorised: true },
    onChunk: (pcm: Float32Array) => void,
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
