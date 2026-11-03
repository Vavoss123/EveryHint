import { homedir } from "node:os";
import { join } from "node:path";
export function speechHome() {
  return (
    process.env.EVERYHINT_SPEECH_HOME ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA, "EveryHint", "speech")
      : join(
          process.platform === "darwin"
            ? join(homedir(), "Library", "Application Support")
            : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")),
          "EveryHint",
          "speech",
        ))
  );
}
