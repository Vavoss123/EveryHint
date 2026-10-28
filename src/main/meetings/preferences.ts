import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MEETINGS,
  parseMeetingPreferences,
  type MeetingPreferences,
} from "../../shared/meetings";

export class MeetingPreferencesStore {
  constructor(private readonly root: string) {}
  read(profile: string): MeetingPreferences {
    if (!/^[a-f0-9]{64}$/.test(profile))
      throw new Error("Invalid local history profile.");
    const file = join(this.root, `${profile}.json`);
    if (!existsSync(file)) return { ...DEFAULT_MEETINGS };
    try {
      return parseMeetingPreferences(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      throw new Error(
        "Meeting preferences could not be read. Saving is disabled until you choose valid settings.",
      );
    }
  }
  write(profile: string, value: MeetingPreferences): void {
    if (!/^[a-f0-9]{64}$/.test(profile))
      throw new Error("Invalid local history profile.");
    const checked = parseMeetingPreferences(value),
      file = join(this.root, `${profile}.json`);
    mkdirSync(this.root, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(checked), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
}
