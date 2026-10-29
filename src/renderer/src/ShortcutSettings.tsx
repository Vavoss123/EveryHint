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
  const [answer, setAnswer] = useState(
    settings.answerShortcut ?? DEFAULT_HOTKEYS.answer,
  );
  const [assist, setAssist] = useState(
    settings.assistShortcut ?? DEFAULT_HOTKEYS.assist,
  );
  const [clear, setClear] = useState(
    settings.clearShortcut ?? DEFAULT_HOTKEYS.clear,
  );
  const [toggle, setToggle] = useState(
    settings.toggleShortcut ?? DEFAULT_HOTKEYS.toggle,
  );
  const [pause, setPause] = useState(
    settings.pauseShortcut ?? DEFAULT_HOTKEYS.pause,
  );
  const [stop, setStop] = useState(
    settings.stopShortcut ?? DEFAULT_HOTKEYS.stop,
  );
  useEffect(() => {
    setAnswer(settings.answerShortcut ?? DEFAULT_HOTKEYS.answer);
    setAssist(settings.assistShortcut ?? DEFAULT_HOTKEYS.assist);
    setClear(settings.clearShortcut ?? DEFAULT_HOTKEYS.clear);
    setToggle(settings.toggleShortcut ?? DEFAULT_HOTKEYS.toggle);
    setPause(settings.pauseShortcut ?? DEFAULT_HOTKEYS.pause);
    setStop(settings.stopShortcut ?? DEFAULT_HOTKEYS.stop);
  }, [
    settings.answerShortcut,
    settings.assistShortcut,
    settings.clearShortcut,
    settings.toggleShortcut,
    settings.pauseShortcut,
    settings.stopShortcut,
  ]);
  return (
    <div className="panel-stack">
      <label>
        Answer from conversation
        <input
          aria-label="Answer from conversation shortcut"
          value={answer}
          maxLength={80}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <label>
        Show / hide overlay
        <input
          aria-label="Show / hide overlay shortcut"
          value={toggle}
          maxLength={80}
          onChange={(e) => setToggle(e.target.value)}
        />
      </label>
      <label>
        Pause / resume
        <input
          aria-label="Pause / resume shortcut"
          value={pause}
          maxLength={80}
          onChange={(e) => setPause(e.target.value)}
        />
      </label>
      <label>
        Stop session
        <input
          aria-label="Stop session shortcut"
          value={stop}
          maxLength={80}
          onChange={(e) => setStop(e.target.value)}
        />
      </label>
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
        onClick={() =>
          save({
            answerShortcut: answer,
            assistShortcut: assist,
            clearShortcut: clear,
            toggleShortcut: toggle,
            pauseShortcut: pause,
            stopShortcut: stop,
          })
        }
      >
        Apply shortcuts
      </button>
      <small>
        Use Control plus Alt or Shift and a key. Each shortcut must be
        different. Answer sends the active session’s approved context when you
        press it. Assist prepares extra context for review; approval and Ask are
        still required. Clear cancels the answer and clears this conversation.
        Unavailable shortcuts are reported below.
      </small>
    </div>
  );
}
