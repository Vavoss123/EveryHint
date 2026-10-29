import { useState } from "react";
import type { MeetingState } from "../../shared/meetings";
import { meetingResult, meetingScope } from "./useMeetings";

export function HistoryDataControls({ state }: { state: MeetingState }) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel-stack" aria-label="History data controls">
      <button
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () =>
            meetingResult(
              await (state.locked
                ? window.everyhint.meetings.unlock(
                    meetingScope(state, undefined),
                  )
                : window.everyhint.meetings.lock(
                    meetingScope(state, undefined),
                  )),
            ),
          )
        }
      >
        {state.locked ? "Unlock History" : "Lock history"}
      </button>
      <details>
        <summary>Delete all saved meetings</summary>
        <p>
          Deletes this profile’s encrypted meetings and notes. Exports and
          previously shared text remain separate.
        </p>
        <label className="check">
          <input
            aria-label="Confirm deleting all saved meetings"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm deleting all saved meetings in this profile.
        </label>
        <button
          className="danger"
          disabled={!confirmed || state.locked || state.saving || busy}
          onClick={() =>
            void run(async () => {
              meetingResult(
                await window.everyhint.meetings.deleteAll(
                  meetingScope(state, { acknowledged: true }),
                ),
              );
              setConfirmed(false);
            })
          }
        >
          Delete all saved meetings
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
