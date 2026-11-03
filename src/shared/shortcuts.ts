import type { HotkeyBindings } from "./contracts";

export const DEFAULT_HOTKEYS: HotkeyBindings = {
  toggle: "Control+\\",
  pause: "Control+Alt+P",
  stop: "Control+Alt+Shift+X",
  assist: "Control+Alt+A",
  clear: "Control+Alt+Shift+C",
  answer: "Control+Enter",
};
/** Earlier defaults; saved copies are upgraded to the Cluely-style keys. */
export const LEGACY_HOTKEYS: Partial<HotkeyBindings> = {
  toggle: "Control+Alt+Space",
  answer: "Control+Alt+Enter",
};
// Control alone is accepted only for these keys, matching familiar
// overlay-assistant chords. Everything else needs a second modifier.
const CONTROL_ONLY = new Set(["Enter", "\\"]);
export function parseShortcut(value: unknown): string {
  if (typeof value !== "string" || value.length > 80)
    throw new Error("Enter a shortcut such as Control+Enter or Control+Alt+A.");
  const parts = value
    .trim()
    .replace(/^Ctrl\+/i, "Control+")
    .split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.map(
    (part) =>
      ({ control: "Control", alt: "Alt", shift: "Shift" })[part.toLowerCase()],
  );
  const normalizedKey = /^(space|enter)$/i.test(key)
    ? key[0]!.toUpperCase() + key.slice(1).toLowerCase()
    : key.toUpperCase();
  if (
    parts.length < 1 ||
    (parts.length < 2 && !CONTROL_ONLY.has(normalizedKey)) ||
    modifiers.some((part) => !part) ||
    new Set(modifiers).size !== parts.length ||
    !modifiers.includes("Control") ||
    !/^(?:[a-z0-9\\]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter)$/i.test(key)
  )
    throw new Error(
      "Use Control+Enter, Control+\\, or Control plus Alt or Shift with a letter, digit, F1–F24, Space or Enter.",
    );
  return [
    ...["Control", "Alt", "Shift"].filter((part) => modifiers.includes(part)),
    normalizedKey,
  ].join("+");
}
