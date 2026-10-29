import { useEffect, useState } from "react";
import type { ListenSnapshot, SharingChoices } from "../../shared/listen";
import type { ContextReview } from "../../shared/ai";
import type { SessionSnapshot } from "../../shared/contracts";
import type { TranscriptionSnapshot } from "../../shared/transcription";

export function useListen(): ListenSnapshot | null {
  const [value, setValue] = useState<ListenSnapshot | null>(null);
  useEffect(() => {
    const accept = (next: ListenSnapshot) =>
      setValue((old) => (!old || next.revision >= old.revision ? next : old));
    const off = window.everyhint.listen.onState(accept);
    void window.everyhint.listen.get().then((result) => {
      if (result.ok) accept(result.value);
    });
    return off;
  }, []);
  return value;
}
export const noSharing: SharingChoices = {
  transcript: false,
  screen: false,
  acknowledged: false,
};
export function SharingFields({
  audio,
  screen,
  value,
  change,
}: {
  audio: boolean;
  screen: boolean;
  value: SharingChoices;
  change: (value: SharingChoices) => void;
}) {
  return (
    <fieldset className="session-sharing">
      <legend>ChatGPT sharing for this session</legend>
      <p>
        Only when you press Answer or Ask. Permission ends when you stop, change
        connection or mode, revoke it, or after one hour. Live Assist needs
        separate permission.
      </p>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Share recent transcript with ChatGPT"
          disabled={!audio}
          checked={audio && value.transcript}
          onChange={(e) =>
            change({
              ...value,
              transcript: e.target.checked,
              acknowledged: false,
            })
          }
        />
        Recent transcript · up to two minutes
      </label>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Share screen with ChatGPT"
          disabled={!screen}
          checked={screen && value.screen}
          onChange={(e) =>
            change({ ...value, screen: e.target.checked, acknowledged: false })
          }
        />
        Selected screen · a fresh image per request
      </label>
      {((value.transcript && audio) || (value.screen && screen)) && (
        <label className="acknowledgement">
          <input
            type="checkbox"
            checked={value.acknowledged}
            onChange={(e) =>
              change({ ...value, acknowledged: e.target.checked })
            }
          />
          I allow these types of context to be sent to ChatGPT for my requests
          in this session.
        </label>
      )}
      <small>
        Raw audio stays local and transient. Unchecked context is never included
        in this request path. You can start with local listening only.
      </small>
    </fieldset>
  );
}
export function SpeechSetup() {
  const [speech, setSpeech] = useState<TranscriptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const off = window.everyhint.onTranscription(setSpeech);
    void window.everyhint.getTranscription().then((result) => {
      if (result.ok) setSpeech(result.value);
    });
    return off;
  }, []);
  if (!speech) return <p>Checking local speech recognition…</p>;
  const model = speech.models.find((m) => m.id === speech.settings.model);
  if (speech.runtimeInstalled && model?.state === "installed")
    return (
      <p className="muted">
        Local speech recognition is ready and starts with this session.
      </p>
    );
  return (
    <div className="speech-setup">
      <p>Set up local speech recognition once before listening.</p>
      {!speech.runtimeInstalled ? (
        <p className="warning">
          The local speech helper is missing. Install a build containing the
          speech runtime, or build it with the development speech setup.
        </p>
      ) : (
        <button
          className="secondary"
          disabled={
            model?.state === "downloading" || model?.state === "verifying"
          }
          onClick={() => {
            setError(null);
            void window.everyhint
              .installSpeechModel(speech.settings.model)
              .then((result) => {
                if (!result.ok) setError(result.error);
              });
          }}
        >
          {model?.state === "downloading"
            ? `Downloading speech model · ${Math.round(model.progress * 100)}%`
            : model?.state === "verifying"
              ? "Checking speech model…"
              : "Download local speech model"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ListenControls({
  capture,
  listen,
}: {
  capture: SessionSnapshot;
  listen: ListenSnapshot | null;
}) {
  const [choices, setChoices] = useState({ ...noSharing });
  const [view, setView] = useState(false);
  const [context, setContext] = useState<ContextReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setChoices({ ...noSharing });
    setContext(null);
    setView(false);
  }, [capture.sessionId, listen?.sharing?.expiresAt]);
  useEffect(() => {
    if (!listen?.sharing || capture.state !== "ACTIVE") {
      setContext(null);
      setView(false);
    }
  }, [listen?.sharing, capture.state]);
  if (!listen?.managed && !listen?.message) return null;
  return (
    <div className="listen-controls">
      {listen.message && <p role="status">{listen.message}</p>}
      {listen.managed && (
        <>
          {listen.sharing ? (
            <div className="inline-actions">
              <small>
                For Ask: {listen.sharing.transcript ? "recent transcript" : ""}
                {listen.sharing.transcript && listen.sharing.screen
                  ? " and "
                  : ""}
                {listen.sharing.screen ? "selected screen" : ""}.
              </small>
              <button
                className="text-button"
                onClick={() => void window.everyhint.listen.revoke()}
              >
                Revoke sharing
              </button>
            </div>
          ) : (
            <details open className="sharing-permission">
              <summary>Allow ChatGPT context</summary>
              <SharingFields
                audio={
                  !!(
                    capture.consent?.microphone || capture.consent?.systemAudio
                  )
                }
                screen={!!capture.consent?.screen}
                value={choices}
                change={setChoices}
              />
              <button
                className="secondary"
                disabled={
                  capture.state !== "ACTIVE" ||
                  !choices.acknowledged ||
                  (!choices.transcript && !choices.screen)
                }
                onClick={() => {
                  setError(null);
                  void window.everyhint.listen
                    .authorise(choices)
                    .then((result) => {
                      if (!result.ok) setError(result.error);
                    });
                }}
              >
                Allow for this session
              </button>
            </details>
          )}
          <button
            className="text-button"
            onClick={() => {
              void window.everyhint.listen.context().then((result) => {
                if (result.ok) {
                  setContext(result.value);
                  setView(true);
                } else setError(result.error);
              });
            }}
          >
            View Context
          </button>
          {view && (
            <div
              className="context-transparency"
              role="region"
              aria-label="Last request context"
            >
              <button className="text-button" onClick={() => setView(false)}>
                Close context
              </button>
              <p>
                Exact context for the last conversation request. The next
                request uses fresh approved context.
              </p>
              {context ? (
                <>
                  <p>{context.question || "Conversation guidance"}</p>
                  {context.transcripts.map((e, i) => (
                    <p key={i}>
                      <strong>
                        {e.source === "microphone"
                          ? "Microphone"
                          : "System audio"}
                      </strong>{" "}
                      · {new Date(e.startMs).toLocaleTimeString()}–
                      {new Date(e.endMs).toLocaleTimeString()}
                      <br />
                      {e.text}
                    </p>
                  ))}
                  {context.screenshot && (
                    <figure>
                      <img
                        src={context.screenshot.dataUrl}
                        alt="Screenshot included in the last request"
                      />
                      <figcaption>
                        {context.sourceName} ·{" "}
                        {new Date(
                          context.screenshot.capturedAt,
                        ).toLocaleTimeString()}
                      </figcaption>
                    </figure>
                  )}
                  {context.notices.map((n) => (
                    <small key={n}>{n}</small>
                  ))}
                </>
              ) : (
                <p>No conversation context has been sent in this session.</p>
              )}
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
