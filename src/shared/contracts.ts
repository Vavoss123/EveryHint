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
  sessionId: string | null;
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
  theme?: "light" | "dark" | "system";
  layout?: "assistant" | "dashboard";
  opacity?: number;
  assistShortcut?: string;
  clearShortcut?: string;
  intelligence?: import("./intelligence").IntelligenceSettings;
}
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type HotkeyAction = "toggle" | "pause" | "stop" | "assist" | "clear";
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
  workspace: import("./workspace").WorkspaceBridge;
  personal: import("./personal").PersonalBridge;
  meetings: import("./meeting-bridge").MeetingBridge;
  authoriseLive(
    input: import("./intelligence").LiveConsentInput,
  ): Promise<Result<void>>;
  pauseLive(): Promise<Result<void>>;
  getIntelligence(): Promise<
    Result<import("./intelligence").IntelligenceSnapshot>
  >;
  onIntelligence(
    listener: (value: import("./intelligence").IntelligenceSnapshot) => void,
  ): () => void;
  setOperatingMode(
    mode: import("./intelligence").OperatingMode,
  ): Promise<Result<void>>;
  saveIntelligenceSettings(
    settings: import("./intelligence").IntelligenceSettings,
  ): Promise<Result<void>>;
  contextualAction(
    input: import("./intelligence").ContextualActionInput,
  ): Promise<Result<import("./intelligence").ActionOutcome>>;
  dismissSuggestion(input: {
    id: string;
    similar: boolean;
  }): Promise<Result<void>>;
  getAccountConnection(): Promise<
    Result<import("./accounts").AccountConnection>
  >;
  account(action: import("./accounts").AccountAction): Promise<Result<void>>;
  selectChatgptAccount(id: string): Promise<Result<void>>;
  discoverModels(): Promise<Result<void>>;
  selectModel(id: string): Promise<Result<void>>;
  onAccountConnection(
    listener: (value: import("./accounts").AccountConnection) => void,
  ): () => void;
  getAssistant(): Promise<Result<import("./ai").AssistantSnapshot>>;
  inspectProviders(): Promise<Result<void>>;
  selectProvider(provider: import("./ai").ProviderId): Promise<Result<void>>;
  setClaudeApiBilling(enabled: boolean): Promise<Result<void>>;
  reviewContext(input: import("./ai").ReviewInput): Promise<Result<void>>;
  removeContext(input: {
    reviewId: string;
    kind: "transcripts" | "history" | "screenshot" | "workspace" | "knowledge";
    index: number;
  }): Promise<Result<void>>;
  onAssist(listener: () => void): () => void;
  ask(input: {
    reviewId: string;
    acknowledged: boolean;
  }): Promise<Result<void>>;
  copyResponse(text: string): Promise<Result<void>>;
  assistant(
    action: "cancel" | "clear" | "discard-review",
  ): Promise<Result<void>>;
  onAssistant(
    listener: (snapshot: import("./ai").AssistantSnapshot) => void,
  ): () => void;
  getTranscription(): Promise<
    Result<import("./transcription").TranscriptionSnapshot>
  >;
  transcription(
    action: "enable" | "pause" | "clear" | "inspect",
  ): Promise<Result<void>>;
  installSpeechModel(
    model: import("./transcription").SpeechModel,
  ): Promise<Result<void>>;
  saveTranscriptionSettings(
    settings: import("./transcription").TranscriptionSettings,
  ): Promise<Result<void>>;
  onTranscription(
    listener: (
      snapshot: import("./transcription").TranscriptionSnapshot,
    ) => void,
  ): () => void;
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
export type { AIProvider, AIRequest, AIResponse } from "./ai";
