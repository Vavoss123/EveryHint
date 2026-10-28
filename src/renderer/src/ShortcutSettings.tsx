import { useEffect, useState } from "react";
import type { Settings } from "../../shared/contracts";
import { DEFAULT_HOTKEYS } from "../../shared/shortcuts";

export function ShortcutSettings({
  settings,
  save,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => void;
}) {
  const [assist, setAssist] = useState(
    settings.assistShortcut ?? DEFAULT_HOTKEYS.assist,
  );
  const [clear, setClear] = useState(
    settings.clearShortcut ?? DEFAULT_HOTKEYS.clear,
  );
  useEffect(() => {
    setAssist(settings.assistShortcut ?? DEFAULT_HOTKEYS.assist);
    setClear(settings.clearShortcut ?? DEFAULT_HOTKEYS.clear);
  }, [settings.assistShortcut, settings.clearShortcut]);
  return (
    <div className="panel-stack">
      <label>
        Assist shortcut
        <input
          aria-label="Assist shortcut"
          value={assist}
          maxLength={80}
          onChange={(event) => setAssist(event.target.value)}
        />
      </label>
      <label>
        Clear context shortcut
        <input
          aria-label="Clear context shortcut"
          value={clear}
          maxLength={80}
          onChange={(event) => setClear(event.target.value)}
        />
      </label>
      <button
        className="secondary"
        onClick={() => save({ assistShortcut: assist, clearShortcut: clear })}
      >
        Apply shortcuts
      </button>
      <small>
        Use Control plus Alt or Shift and a key. Each shortcut must be
        different. Assist prepares context for review; approval and Ask are
        still required. Clear cancels the answer and clears this conversation.
        Unavailable shortcuts are reported below.
      </small>
    </div>
  );
}
