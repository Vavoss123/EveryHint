import type {
  AudioDiagnostic,
  AudioFrame,
  AudioPlan,
  MicrophoneDevice,
} from "./contracts";
import { exactKeys, parseDeviceId, record } from "./validation";
export type AudioWorkerPlan = {
  token: string;
  mode: "devices" | "capture";
  capture: AudioPlan;
};
export type AudioWorkerReport =
  | { type: "devices"; devices: MicrophoneDevice[] }
  | { type: "diagnostics"; sources: AudioDiagnostic[] }
  | { type: "error"; message: string; source?: "microphone" | "systemAudio" };
export interface AudioWorkerBridge {
  configuration(): Promise<AudioWorkerPlan>;
  ready(): Promise<void>;
  report(report: AudioWorkerReport): void;
  pcm(token: string, frame: AudioFrame): Promise<boolean>;
  onControl(
    listener: (command: {
      muted?: boolean;
      transcriptionToken?: string | null;
    }) => void,
  ): () => void;
}
export function parseAudioReport(value: unknown): AudioWorkerReport {
  const input = record(value);
  if (input.type === "devices") {
    exactKeys(input, ["type", "devices"]);
    if (!Array.isArray(input.devices) || input.devices.length > 128)
      throw new Error("Invalid microphone list.");
    return {
      type: "devices",
      devices: input.devices.map((entry: unknown) => {
        const device = record(entry);
        exactKeys(device, ["deviceId", "label"]);
        if (typeof device.label !== "string" || device.label.length > 200)
          throw new Error("Invalid microphone label.");
        return {
          deviceId: parseDeviceId(device.deviceId),
          label: device.label,
        };
      }),
    };
  }
  if (input.type === "error") {
    exactKeys(input, ["type", "message", "source"]);
    if (
      typeof input.message !== "string" ||
      input.message.length > 1000 ||
      (input.source !== undefined &&
        input.source !== "microphone" &&
        input.source !== "systemAudio")
    )
      throw new Error("Invalid audio error.");
    return { type: "error", message: input.message, source: input.source };
  }
  exactKeys(input, ["type", "sources"]);
  if (
    input.type !== "diagnostics" ||
    !Array.isArray(input.sources) ||
    input.sources.length > 2
  )
    throw new Error("Invalid audio diagnostics.");
  const seen = new Set<string>();
  const sources: AudioDiagnostic[] = input.sources.map((entry: unknown) => {
    const source = record(entry);
    exactKeys(source, [
      "source",
      "state",
      "name",
      "deviceId",
      "level",
      "muted",
      "error",
    ]);
    if (
      (source.source !== "microphone" && source.source !== "systemAudio") ||
      seen.has(source.source)
    )
      throw new Error("Invalid audio source.");
    seen.add(source.source);
    if (
      source.state !== "CAPTURING" ||
      typeof source.name !== "string" ||
      source.name.length > 200 ||
      typeof source.muted !== "boolean" ||
      typeof source.level !== "number" ||
      !Number.isFinite(source.level) ||
      source.level < 0 ||
      source.level > 1 ||
      source.error !== null
    )
      throw new Error("Invalid audio status.");
    return {
      source: source.source,
      state: "CAPTURING",
      name: source.name,
      deviceId:
        source.deviceId === null ? null : parseDeviceId(source.deviceId),
      level: source.level,
      muted: source.muted,
      error: null,
    };
  });
  return { type: "diagnostics", sources };
}
