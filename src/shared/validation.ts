import type { Consent, Settings, WindowBounds } from "./contracts";

export const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: true,
  compact: false,
  captureIntervalMs: 3000,
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
export function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error("Unexpected input field.");
}
export function parseConsent(value: unknown): Consent {
  const input = record(value);
  exactKeys(input, ["screen", "microphone", "systemAudio", "acknowledged"]);
  if (
    input.acknowledged !== true ||
    ["screen", "microphone", "systemAudio"].some(
      (key) => typeof input[key] !== "boolean",
    )
  )
    throw new Error(
      "Explicit source consent and participant acknowledgement are required.",
    );
  if (!input.screen && !input.microphone && !input.systemAudio)
    throw new Error("Enable at least one capture source.");
  return {
    screen: input.screen as boolean,
    microphone: input.microphone as boolean,
    systemAudio: input.systemAudio as boolean,
    acknowledged: true,
  };
}
export function parseDeviceId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("Invalid microphone device.");
  return value;
}
export function parseSettings(value: unknown): Settings {
  const input = record(value);
  exactKeys(input, ["alwaysOnTop", "compact", "captureIntervalMs"]);
  if (
    typeof input.alwaysOnTop !== "boolean" ||
    typeof input.compact !== "boolean"
  )
    throw new Error("Window options must be booleans.");
  if (
    !Number.isInteger(input.captureIntervalMs) ||
    (input.captureIntervalMs as number) < 1000 ||
    (input.captureIntervalMs as number) > 30000
  ) {
    throw new Error(
      "Capture interval must be between 1 and 30 seconds, in whole milliseconds.",
    );
  }
  return {
    alwaysOnTop: input.alwaysOnTop,
    compact: input.compact,
    captureIntervalMs: input.captureIntervalMs as number,
  };
}
export function parseBounds(value: unknown): WindowBounds {
  const input = record(value);
  exactKeys(input, ["x", "y", "width", "height"]);
  for (const key of ["x", "y", "width", "height"]) {
    if (
      !Number.isInteger(input[key]) ||
      Math.abs(input[key] as number) > 100000
    )
      throw new Error("Invalid window bounds.");
  }
  const bounds = input as unknown as WindowBounds;
  if (
    bounds.width < 360 ||
    bounds.width > 2000 ||
    bounds.height < 180 ||
    bounds.height > 2000
  )
    throw new Error("Invalid window size.");
  return { ...bounds };
}
export function parseSourceId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(screen|window):\d+:\d+$/.test(value) ||
    value.trim() !== value ||
    value.length > 100
  )
    throw new Error("Invalid capture source.");
  return value;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected EveryHint error occurred.";
}
