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
}
export class SettingsStore {
  settings: Settings = { ...DEFAULT_SETTINGS };
  bounds: WindowBounds | undefined;
  constructor(
    private readonly path: string,
    private readonly warning: (message: string) => void,
  ) {
    if (!existsSync(path)) return;
    try {
      const stored = record(JSON.parse(readFileSync(path, "utf8")) as unknown);
      exactKeys(stored, ["version", "settings", "bounds"]);
      if (stored.version !== 1)
        throw new Error("Unsupported settings version.");
      this.settings = parseSettings(stored.settings);
      // An ordinary upgrade never forces existing users into first-run setup.
      if (this.settings.setupComplete === undefined)
        this.settings.setupComplete = true;
      if (stored.bounds !== undefined) this.bounds = parseBounds(stored.bounds);
    } catch (error) {
      this.settings = { ...DEFAULT_SETTINGS };
      this.bounds = undefined;
      this.warning(
        `EveryHint settings could not be loaded; defaults restored. ${errorMessage(error)}`,
      );
    }
  }
  save(settings: unknown, bounds = this.bounds): void {
    const validated = parseSettings(settings);
    const stored: StoredSettings = { version: 1, settings: validated };
    if (bounds) stored.bounds = parseBounds(bounds);
    writeFileSync(`${this.path}.tmp`, JSON.stringify(stored, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(`${this.path}.tmp`, this.path);
    this.settings = validated;
    this.bounds = stored.bounds;
  }
}
