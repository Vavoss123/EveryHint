import { parseShortcut } from "../shared/shortcuts";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Settings, WindowBounds } from "../shared/contracts";
import {
  DEFAULT_SETTINGS,
  errorMessage,
  exactKeys,
  parseBounds,
  parseSettings,
  record,
} from "../shared/validation";

interface StoredSettings {
  version: 1;
  settings: Settings;
  bounds?: WindowBounds;
  overlayBounds?: WindowBounds;
}
export class SettingsStore {
  settings: Settings = { ...DEFAULT_SETTINGS };
  bounds: WindowBounds | undefined;
  overlayBounds: WindowBounds | undefined;
  constructor(
    private readonly path: string,
    private readonly warning: (message: string) => void,
  ) {
    if (!existsSync(path)) return;
    try {
      const stored = record(JSON.parse(readFileSync(path, "utf8")) as unknown);
      exactKeys(stored, ["version", "settings", "bounds", "overlayBounds"]);
      if (stored.version !== 1)
        throw new Error("Unsupported settings version.");
      const prior = record(stored.settings);
      if (prior.answerShortcut === undefined) {
        const used = new Set(
          Object.entries(prior)
            .filter(([key]) => key.endsWith("Shortcut"))
            .map(([, value]) => parseShortcut(value)),
        );
        prior.answerShortcut = [
          "Control+Alt+Enter",
          "Control+Alt+Shift+Enter",
          "Control+Alt+F12",
          ...Array.from(
            { length: 24 },
            (_, index) => `Control+Alt+Shift+F${index + 1}`,
          ),
        ].find((key) => !used.has(key));
      }
      this.settings = parseSettings(prior);
      // An ordinary upgrade never forces existing users into first-run setup.
      if (this.settings.setupComplete === undefined)
        this.settings.setupComplete = true;
      if (stored.bounds !== undefined) this.bounds = parseBounds(stored.bounds);
      if (stored.overlayBounds !== undefined) {
        try {
          this.overlayBounds = parseBounds(stored.overlayBounds);
        } catch {
          this.warning(
            "The saved assistant position was invalid; a default position will be used. Your settings are preserved.",
          );
        }
      }
    } catch (error) {
      this.settings = { ...DEFAULT_SETTINGS };
      this.bounds = undefined;
      this.warning(
        `EveryHint settings could not be loaded; defaults restored. ${errorMessage(error)}`,
      );
    }
  }
  save(
    settings: unknown,
    bounds = this.bounds,
    overlayBounds = this.overlayBounds,
  ): void {
    const validated = parseSettings(settings);
    const stored: StoredSettings = { version: 1, settings: validated };
    if (bounds) stored.bounds = parseBounds(bounds);
    if (overlayBounds) stored.overlayBounds = parseBounds(overlayBounds);
    writeFileSync(`${this.path}.tmp`, JSON.stringify(stored, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(`${this.path}.tmp`, this.path);
    this.settings = validated;
    this.bounds = stored.bounds;
    this.overlayBounds = stored.overlayBounds;
  }
}
