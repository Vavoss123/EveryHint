import type { SessionAction, SessionState } from "../../shared/contracts";

export function SessionControls({
  state,
  action,
  start,
  busy = false,
}: {
  state: SessionState;
  action: (action: SessionAction) => void;
  start?: () => void;
  busy?: boolean;
}) {
  const running = state === "ACTIVE" || state === "PAUSED";
  return (
    <div className="capture-controls">
      {state === "ACTIVE" ? (
        <button
          className="secondary"
          onClick={() => action("pause")}
          disabled={busy}
        >
          Pause
        </button>
      ) : state === "PAUSED" ? (
        <button
          className="primary"
          onClick={() => action("resume")}
          disabled={busy}
        >
          Resume
        </button>
      ) : state === "READY" ? (
        <button
          className="primary"
          onClick={() => action("start")}
          disabled={busy}
        >
          Start EveryHint
        </button>
      ) : start ? (
        <button
          className="primary start-session"
          onClick={start}
          disabled={busy}
        >
          Start EveryHint
        </button>
      ) : null}
      {state === "READY" && (
        <button className="secondary" onClick={() => action("stop")}>
          Cancel setup
        </button>
      )}
      {running && (
        <button
          className="stop-button"
          onClick={() => action("stop")}
          title="Stop capture and revoke session permissions"
        >
          Stop
        </button>
      )}
    </div>
  );
}
