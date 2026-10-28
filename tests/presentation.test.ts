import { describe, expect, it } from "vitest";
import { presentation, presentationBounds } from "../src/main/presentation";
import { DEFAULT_SETTINGS, parseSettings } from "../src/shared/validation";
import design from "../resources/design-tokens.json";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
describe("appearance and window presentation", () => {
  it("migrates existing appearance settings without changing capture choices or inventing consent", () => {
    const value = parseSettings({
      alwaysOnTop: false,
      compact: true,
      captureIntervalMs: 5000,
    });
    expect(value).toEqual({
      alwaysOnTop: false,
      compact: true,
      captureIntervalMs: 5000,
      theme: "light",
      layout: "assistant",
      opacity: 1,
      assistShortcut: "Control+Alt+A",
      clearShortcut: "Control+Alt+Shift+C",
    });
  });
  it.each([
    { theme: "purple" },
    { theme: null },
    { layout: "remote" },
    { opacity: null },
    { opacity: 0.79 },
    { opacity: 1.01 },
    { opacity: NaN },
    { opacity: "0.8" },
  ])("rejects invalid native appearance input %j", (patch) =>
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, ...patch })).toThrow(),
  );
  it("keeps compact precedence while preserving the chosen expanded layout", () => {
    expect(
      presentation({ ...DEFAULT_SETTINGS, compact: true, layout: "dashboard" }),
    ).toBe("compact");
    expect(presentation({ ...DEFAULT_SETTINGS, layout: "dashboard" })).toBe(
      "dashboard",
    );
  });
  it("fits the dashboard to the current monitor, including negative monitor origins", () => {
    const bounds = presentationBounds(
      "dashboard",
      { x: -100, y: 900, width: 540, height: 720 },
      { x: -1280, y: 0, width: 1280, height: 960 },
    );
    expect(bounds).toEqual({ x: -1040, y: 200, width: 1040, height: 760 });
    expect(
      presentationBounds("dashboard", bounds, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      }),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
  it("retains resized dimensions while keeping compact and emergency controls bounded", () => {
    const current = { x: 40, y: 20, width: 1100, height: 800 },
      area = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(presentationBounds("compact", current, area).height).toBe(190);
    expect(
      presentationBounds("assistant", current, area, {
        width: 600,
        height: 900,
      }),
    ).toMatchObject({ width: 600, height: 900 });
  });
  it("meets text, primary-action, status and focus contrast targets in both themes", () => {
    for (const palette of [design.light, design.dark]) {
      for (const surface of [
        palette.background,
        palette.surface,
        palette.elevated,
      ]) {
        expect(contrast(palette.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette["text-secondary"], surface),
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.focus, surface)).toBeGreaterThanOrEqual(3);
        expect(
          contrast(palette["control-border"], surface),
        ).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrast(palette["on-brand"], palette.brand),
      ).toBeGreaterThanOrEqual(4.5);
      for (const state of ["success", "warning", "danger"] as const)
        expect(
          contrast(palette[state], palette[`${state}-surface`]),
        ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps generated semantic CSS in sync and removes placeholder colour literals from components", () => {
    execFileSync(process.execPath, ["scripts/build-theme.mjs", "--check"]);
    const css = readFileSync("src/renderer/src/styles.css", "utf8");
    expect(css).not.toMatch(/#[a-f0-9]{3,8}\b/i);
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("focus-visible");
  });
});
