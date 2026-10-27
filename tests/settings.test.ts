import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsStore } from "../src/main/settings";
import {
  DEFAULT_SETTINGS,
  parseBounds,
  parseSettings,
} from "../src/shared/validation";

describe("settings validation and storage", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "everyhint-settings-"));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  it("uses safe defaults on first launch", () => {
    expect(
      new SettingsStore(join(directory, "settings.json"), vi.fn()).settings,
    ).toEqual(DEFAULT_SETTINGS);
  });
  it.each([
    null,
    [],
    {},
    { ...DEFAULT_SETTINGS, alwaysOnTop: "true" },
    { ...DEFAULT_SETTINGS, captureIntervalMs: 0 },
    { ...DEFAULT_SETTINGS, captureIntervalMs: 30001 },
    { ...DEFAULT_SETTINGS, captureIntervalMs: 1.5 },
    { ...DEFAULT_SETTINGS, captureIntervalMs: NaN },
    { ...DEFAULT_SETTINGS, apiKey: "secret" },
    { ...DEFAULT_SETTINGS, state: "ACTIVE" },
  ])("rejects unsafe settings: %j", (input) => {
    expect(() => parseSettings(input)).toThrow();
  });
  it("persists appearance and bounds, without persisting consent or frames", () => {
    const path = join(directory, "settings.json"),
      warning = vi.fn();
    const store = new SettingsStore(path, warning);
    const settings = {
      ...DEFAULT_SETTINGS,
      alwaysOnTop: false,
      captureIntervalMs: 5000,
    };
    const bounds = { x: -900, y: 0, width: 460, height: 440 };
    store.save(settings, bounds);
    const loaded = new SettingsStore(path, warning);
    expect(loaded.settings).toEqual(settings);
    expect(loaded.bounds).toEqual(bounds);
    expect(
      Object.keys(JSON.parse(readFileSync(path, "utf8")) as object),
    ).toEqual(["version", "settings", "bounds"]);
    expect(warning).not.toHaveBeenCalled();
  });
  it("restores defaults and reports corrupt storage", () => {
    const path = join(directory, "settings.json"),
      warning = vi.fn();
    writeFileSync(path, "{broken");
    expect(new SettingsStore(path, warning).settings).toEqual(DEFAULT_SETTINGS);
    expect(warning).toHaveBeenCalledTimes(1);
  });
  it("reports unsupported storage versions", () => {
    const path = join(directory, "settings.json"),
      warning = vi.fn();
    writeFileSync(
      path,
      JSON.stringify({ version: 99, settings: DEFAULT_SETTINGS }),
    );
    expect(new SettingsStore(path, warning).settings).toEqual(DEFAULT_SETTINGS);
    expect(warning).toHaveBeenCalledTimes(1);
  });
  it("leaves current settings intact and reports write failures to its caller", () => {
    const store = new SettingsStore(
      join(directory, "missing", "settings.json"),
      vi.fn(),
    );
    expect(() => store.save({ ...DEFAULT_SETTINGS, compact: true })).toThrow();
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });
  it.each([
    { x: 0, y: 0, width: 50, height: 20 },
    { x: Infinity, y: 0, width: 460, height: 440 },
    { x: 0, y: 0, width: 460, height: 440, secret: true },
  ])("rejects invalid bounds: %j", (bounds) => {
    expect(() => parseBounds(bounds)).toThrow();
  });
});
