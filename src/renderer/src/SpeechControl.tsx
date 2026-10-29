import { useEffect, useState } from "react";
import type { SessionSnapshot } from "../../shared/contracts";
import type { TranscriptionSnapshot } from "../../shared/transcription";

export function SpeechControl({ capture }: { capture: SessionSnapshot }) {
  const [state, setState] = useState<TranscriptionSnapshot | null>(null),
    [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const accept = (next: TranscriptionSnapshot) =>
      setState((previous) =>
        !previous || next.revision >= previous.revision ? next : previous,
      );
    const off = window.everyhint.onTranscription(accept);
    void window.everyhint.getTranscription().then((result) => {
      if (result.ok) accept(result.value);
    });
    return off;
  }, []);
  const enabled = state?.state === "LISTENING" || state?.state === "LOADING";
  const available =
    capture.state === "ACTIVE" &&
    [capture.sources.microphone, capture.sources.systemAudio].some(
      (s) => s.state === "CAPTURING",
    );
  const installed =
    state?.runtimeInstalled &&
    state.models.some(
      (model) =>
        model.id === state.settings.model && model.state === "installed",
    );
  return (
    <div className="panel-stack">
      <div className="setting-row">
        <span>
          Local transcription
          <small>
            {enabled
              ? "Listening"
              : state?.state === "PAUSED"
                ? "Paused"
                : "Off"}
          </small>
        </span>
        <button
          className="secondary"
          disabled={working || (!enabled && (!available || !installed))}
          onClick={async () => {
            setWorking(true);
            setError("");
            try {
              const result = await window.everyhint.transcription(
                enabled ? "pause" : "enable",
              );
              if (!result.ok) setError(result.error);
            } finally {
              setWorking(false);
            }
          }}
        >
          {enabled
            ? "Pause transcription"
            : state?.state === "PAUSED"
              ? "Resume transcription"
              : "Enable transcription"}
        </button>
      </div>
      {!installed && (
        <small>
          Set up the English speech model in Settings → Audio & Screen.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
