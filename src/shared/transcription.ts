import type { AudioFrame, AudioSourceId } from "./contracts";
import { exactKeys, record } from "./validation";
export type SpeechModel = "tiny.en" | "base.en";
export interface TranscriptionSettings {
  model: SpeechModel;
  threshold: number;
  silenceMs: number;
  maxSegmentMs: number;
  overlapMs: number;
  retentionMinutes: number;
  maxEvents: number;
}
export const DEFAULT_TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
  model: "tiny.en",
  threshold: 0.012,
  silenceMs: 900,
  maxSegmentMs: 12000,
  overlapMs: 400,
  retentionMinutes: 15,
  maxEvents: 200,
};
export interface TranscriptEvent {
  id: string;
  sessionId: string;
  source: AudioSourceId;
  startMs: number;
  endMs: number;
  text: string;
  state: "partial" | "final";
  model: SpeechModel;
}
export interface RecognitionJob {
  id: string;
  source: AudioSourceId;
  startMs: number;
  endMs: number;
  samples: Float32Array;
  final: boolean;
  overlapMs: number;
}
export interface ModelStatus {
  id: SpeechModel;
  bytes: number;
  state: "missing" | "verifying" | "installed" | "downloading" | "invalid";
  progress: number;
  error: string | null;
}
export interface TranscriptionSnapshot {
  revision: number;
  state: "OFF" | "LOADING" | "LISTENING" | "PAUSED" | "ERROR";
  error: string | null;
  settings: TranscriptionSettings;
  models: ModelStatus[];
  runtimeInstalled: boolean;
  events: TranscriptEvent[];
  diagnostics: {
    loadMs: number;
    averageLatencyMs: number;
    queueLength: number;
    droppedJobs: number;
    gaps: number;
    completedJobs: number;
    workerCpuPercent: number | null;
    workerMemoryBytes: number | null;
  };
}
export function parseTranscriptionSettings(
  value: unknown,
): TranscriptionSettings {
  const input = record(value);
  exactKeys(input, Object.keys(DEFAULT_TRANSCRIPTION_SETTINGS));
  if (input.model !== "tiny.en" && input.model !== "base.en")
    throw new Error("Choose tiny.en or base.en.");
  const ranges: Record<string, [number, number]> = {
    threshold: [0.003, 0.08],
    silenceMs: [600, 2500],
    maxSegmentMs: [10000, 15000],
    overlapMs: [0, 1000],
    retentionMinutes: [1, 60],
    maxEvents: [20, 500],
  };
  for (const [key, [min, max]] of Object.entries(ranges))
    if (
      typeof input[key] !== "number" ||
      !Number.isFinite(input[key]) ||
      (input[key] as number) < min ||
      (input[key] as number) > max ||
      (key !== "threshold" && !Number.isInteger(input[key]))
    )
      throw new Error(`Invalid transcription setting: ${key}.`);
  return { ...input } as unknown as TranscriptionSettings;
}
export function parseAudioFrame(value: unknown): AudioFrame {
  const frame = record(value);
  exactKeys(frame, [
    "source",
    "streamId",
    "sequence",
    "timestamp",
    "sampleRate",
    "channels",
    "format",
    "lifecycle",
    "samples",
  ]);
  if (frame.source !== "microphone" && frame.source !== "systemAudio")
    throw new Error("Invalid PCM source.");
  if (
    typeof frame.streamId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.streamId) ||
    !Number.isSafeInteger(frame.sequence) ||
    (frame.sequence as number) < 0
  )
    throw new Error("Invalid PCM stream identity.");
  if (
    typeof frame.timestamp !== "number" ||
    !Number.isFinite(frame.timestamp) ||
    frame.timestamp < 0 ||
    !Number.isInteger(frame.sampleRate) ||
    (frame.sampleRate as number) < 8000 ||
    (frame.sampleRate as number) > 192000 ||
    ![1, 2].includes(frame.channels as number) ||
    frame.format !== "f32-interleaved" ||
    !["started", "data", "stopped"].includes(frame.lifecycle as string)
  )
    throw new Error("Invalid PCM metadata.");
  if (
    !(frame.samples instanceof Float32Array) ||
    frame.samples.length > 8192 ||
    frame.samples.length % (frame.channels as number) !== 0 ||
    (frame.lifecycle === "data" && !frame.samples.length) ||
    frame.samples.some(
      (sample) => !Number.isFinite(sample) || Math.abs(sample) > 1.001,
    )
  )
    throw new Error("Invalid PCM samples.");
  return frame as unknown as AudioFrame;
}
