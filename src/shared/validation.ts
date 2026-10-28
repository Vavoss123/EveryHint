import type { Consent, Settings, WindowBounds } from "./contracts";
import { DEFAULT_HOTKEYS, parseShortcut } from "./shortcuts";

export const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: true,
  compact: false,
  captureIntervalMs: 3000,
  theme: "light",
  layout: "assistant",
  opacity: 1,
  assistShortcut: DEFAULT_HOTKEYS.assist,
  clearShortcut: DEFAULT_HOTKEYS.clear,
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
  exactKeys(input, [
    "alwaysOnTop",
    "compact",
    "captureIntervalMs",
    "theme",
    "layout",
    "opacity",
    "assistShortcut",
    "clearShortcut",
  ]);
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
  const theme = input.theme === undefined ? "light" : input.theme,
    layout = input.layout === undefined ? "assistant" : input.layout,
    opacity = input.opacity === undefined ? 1 : input.opacity;
  if (theme !== "light" && theme !== "dark" && theme !== "system")
    throw new Error("Choose Light, Dark or System theme.");
  if (layout !== "assistant" && layout !== "dashboard")
    throw new Error("Choose an assistant or dashboard layout.");
  if (
    typeof opacity !== "number" ||
    !Number.isFinite(opacity) ||
    opacity < 0.8 ||
    opacity > 1
  )
    throw new Error("Window opacity must be between 80 and 100 percent.");
  const assistShortcut = parseShortcut(
    input.assistShortcut === undefined
      ? DEFAULT_HOTKEYS.assist
      : input.assistShortcut,
  );
  const clearShortcut = parseShortcut(
    input.clearShortcut === undefined
      ? DEFAULT_HOTKEYS.clear
      : input.clearShortcut,
  );
  if (
    new Set([
      DEFAULT_HOTKEYS.toggle,
      DEFAULT_HOTKEYS.pause,
      DEFAULT_HOTKEYS.stop,
      assistShortcut,
      clearShortcut,
    ]).size !== 5
  )
    throw new Error(
      "Each shortcut must be different, including Show/hide, Pause and Stop.",
    );
  return {
    alwaysOnTop: input.alwaysOnTop,
    compact: input.compact,
    captureIntervalMs: input.captureIntervalMs as number,
    theme,
    layout,
    opacity,
    assistShortcut,
    clearShortcut,
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
