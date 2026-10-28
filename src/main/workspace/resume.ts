import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
export class WorkspaceResume {
  constructor(private root: string) {}
  read(profile: string): boolean {
    try {
      const path = this.path(profile);
      if (!existsSync(path) || statSync(path).size > 1024) return false;
      const value = JSON.parse(readFileSync(path, "utf8"));
      return (
        value.version === 1 &&
        value.restore === true &&
        Object.keys(value).length === 2
      );
    } catch {
      return false;
    }
  }
  private path(profile: string) {
    if (!/^[a-f0-9]{64}$/.test(profile))
      throw new Error("Invalid workspace profile.");
    return join(this.root, `${profile}.json`);
  }
  write(profile: string, restore: boolean) {
    const path = this.path(profile);
    mkdirSync(this.root, { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify({ version: 1, restore }), {
      mode: 0o600,
    });
    renameSync(`${path}.tmp`, path);
  }
}
