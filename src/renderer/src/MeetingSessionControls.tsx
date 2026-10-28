import { useEffect, useState } from "react";
import type { SessionSnapshot } from "../../shared/contracts";
import type { MeetingState, MeetingPreferences } from "../../shared/meetings";
import type { MeetingAIState } from "../../shared/meeting-ai";
import { meetingResult, meetingScope } from "./useMeetings";

export function MeetingStatus({
  state,
  ai,
  open,
}: {
  state: MeetingState | null;
  ai: MeetingAIState | null;
  open: () => void;
}) {
  if (
    !state ||
    !(
      state.saving ||
      state.pendingResumeId ||
      ai?.autoGrant ||
      ai?.status === "draft"
    )
  )
    return null;
  const text = [
    state.saving
      ? "Saving final text locally"
      : state.pendingResumeId
        ? "Saved meeting armed for next capture"
        : null,
    ai?.autoGrant ? "End notes authorised" : null,
    ai?.status === "draft" ? "Meeting draft ready for review" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className="meeting-status"
      role="status"
      aria-label="Meeting persistence and notes status"
    >
      <span title={text}>{text}</span>
      <button className="secondary" onClick={open}>
        Open meetings
      </button>
      {ai?.autoGrant && (
        <button
          className="secondary"
          onClick={() =>
            void window.everyhint.meetings.cancelPost(
              meetingScope(state, undefined),
            )
          }
        >
          Cancel End notes
        </button>
      )}
    </div>
  );
}
export function MeetingPreferencesPanel({ state }: { state: MeetingState }) {
  const [settings, setSettings] = useState<MeetingPreferences>(
      state.preferences,
    ),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSettings(state.preferences);
    setAck(false);
    setError(null);
  }, [state.scopeId, JSON.stringify(state.preferences)]);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      meetingResult(
        await window.everyhint.meetings.configure(
          meetingScope(state, {
            settings,
            acknowledged: ack,
            applyRetention: ack,
          }),
        ),
      );
      setAck(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Meeting preferences could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card panel-stack"
      aria-label="Meeting history preferences"
    >
      <h2>Local meeting history</h2>
      <p className="muted">
        {state.profileLabel}. Temporary sessions are the default. Capture
        consent, persistence and remote AI sharing are separate.
      </p>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Save meeting history"
          checked={settings.enabled}
          onChange={(event) => {
            setSettings({
              ...settings,
              enabled: event.target.checked,
              autoSave: event.target.checked && settings.autoSave,
            });
            setAck(false);
          }}
        />
        Allow locally saved meeting history
      </label>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Automatically save authorised meeting sessions"
          checked={settings.autoSave}
          disabled={!settings.enabled}
          onChange={(event) => {
            setSettings({ ...settings, autoSave: event.target.checked });
            setAck(false);
          }}
        />
        Automatically save my future authorised audio capture sessions in this
        profile
      </label>
      <small>
        Auto-save stores final text from the microphone/system sources you
        consent to capture. It never starts recording or grants remote
        permission. Raw audio and screenshots are not saved.
      </small>
      <label>
        Default retention
        <select
          aria-label="Meeting retention"
          value={settings.retentionDays ?? "indefinite"}
          onChange={(event) => {
            setSettings({
              ...settings,
              retentionDays:
                event.target.value === "indefinite"
                  ? null
                  : (Number(event.target.value) as 7 | 30 | 90),
            });
            setAck(false);
          }}
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="indefinite">Indefinite</option>
        </select>
      </label>
      <small>
        Retention runs when history is unlocked and is measured from last
        modification. A shorter policy may delete older meetings, transcripts
        and notes. Export before applying it if needed. Turning saving off keeps
        existing history until deletion/retention.
      </small>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Acknowledge meeting persistence and retention"
          checked={ack}
          onChange={(event) => setAck(event.target.checked)}
        />
        I authorise these persistence settings and application of the selected
        retention/deletion policy.
      </label>
      <button
        className="primary"
        disabled={!ack || busy}
        onClick={() => void save()}
      >
        Save history preferences
      </button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <small>
        Transcript/notes are encrypted with a Windows-protected key. IDs,
        timing, counts and file size remain visible. Lost keys can make history
        unreadable; no plaintext fallback is used. Local deletion cannot
        guarantee physical SSD erasure, remove exported copies or recall
        provider data.
      </small>
    </section>
  );
}
export function MeetingSessionControls({
  state,
  ai,
  capture,
  open,
  saved,
}: {
  state: MeetingState | null;
  ai: MeetingAIState | null;
  capture: SessionSnapshot;
  open: () => void;
  saved: (id: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [ack, setAck] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [postAck, setPostAck] = useState(false),
    [sharing, setSharing] = useState({ microphone: false, systemAudio: false }),
    [minutes, setMinutes] = useState(30);
  const context = ai?.postContext,
    binding = JSON.stringify(context);
  useEffect(() => {
    setAck(false);
    setPostAck(false);
    setError(null);
  }, [state?.scopeId, capture.sessionId, binding]);
  if (!state) return null;
  async function save() {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const doc = meetingResult(
        await window.everyhint.meetings.saveSession(
          meetingScope(state, {
            sessionId: capture.sessionId!,
            title: title.trim() || `Meeting ${new Date().toLocaleString()}`,
            acknowledged: ack,
          }),
        ),
      );
      setAck(false);
      saved(doc.id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Meeting could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const id = meetingResult(
        await window.everyhint.meetings.end(meetingScope(state, undefined)),
      );
      if (id) saved(id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Meeting could not be ended.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card panel-stack meeting-session"
      aria-label="Meeting session controls"
    >
      <div className="section-heading">
        <h2>{state.saving ? "Saved meeting" : "Temporary session"}</h2>
        <button className="secondary" onClick={open}>
          Meeting history
        </button>
      </div>
      <p className="muted">
        {state.saving
          ? "Final transcripts are being saved locally. Pause/Stop keep working; remote notes need separate permission."
          : "Transcripts stay in memory unless you explicitly save this session or enable authorised auto-save."}
      </p>
      {capture.state === "ACTIVE" && !state.saving && (
        <>
          <label>
            Meeting title
            <input
              aria-label="Save session meeting title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="ai-choice">
            <input
              type="checkbox"
              aria-label="Authorise saving this meeting session"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            Save this session's available retained and future final transcripts
            and source metadata locally under my retention policy.
          </label>
          <button
            className="primary"
            disabled={!ack || !state.preferences.enabled || busy}
            onClick={() => void save()}
          >
            Save this meeting session
          </button>
          {!state.preferences.enabled && (
            <small>
              Enable saved history and acknowledge its retention policy in
              Settings or Meeting history first.
            </small>
          )}
        </>
      )}
      {state.pendingResumeId && (
        <>
          <p>
            Fresh capture will append to the saved meeting you selected. Opening
            it did not start recording.
          </p>
          <button
            className="secondary"
            onClick={() =>
              void window.everyhint.meetings.cancelResume(
                meetingScope(state, undefined),
              )
            }
          >
            Cancel planned append
          </button>
        </>
      )}
      {["ACTIVE", "PAUSED"].includes(capture.state) && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void end()}
        >
          End meeting
        </button>
      )}
      <details className="meeting-post-consent">
        <summary>
          Automatic notes on End meeting ·{" "}
          {ai?.autoGrant ? "authorised" : "off"}
        </summary>
        <p>
          Optionally authorise one ChatGPT-plan attempt after deliberate End
          meeting. Only selected final text from this capture segment is
          eligible: up to 100 excerpts / 12,000 text characters. Earlier resumed
          segments, screenshots, raw audio and AI history are excluded. The
          draft is not saved until reviewed.
        </p>
        <p>
          {context
            ? `${context.accountLabel} · ${context.model}`
            : "Start consented audio and local transcription, connect ChatGPT and choose a model first."}
        </p>
        {(["microphone", "systemAudio"] as const).map((source) => (
          <label className="ai-choice" key={source}>
            <input
              type="checkbox"
              aria-label={`Post notes share ${source}`}
              checked={sharing[source]}
              disabled={!context?.available[source] || Boolean(ai?.autoGrant)}
              onChange={(event) => {
                setSharing({ ...sharing, [source]: event.target.checked });
                setPostAck(false);
              }}
            />
            {source === "microphone"
              ? "Microphone final transcripts"
              : "System-audio final transcripts"}
          </label>
        ))}
        <label>
          Permission duration
          <select
            aria-label="Post notes duration"
            value={minutes}
            disabled={Boolean(ai?.autoGrant)}
            onChange={(event) => {
              setMinutes(Number(event.target.value));
              setPostAck(false);
            }}
          >
            {[1, 5, 15, 30, 60].map((value) => (
              <option key={value} value={value}>
                {value} minute(s)
              </option>
            ))}
          </select>
        </label>
        <small>
          One attempt, no retry or paid fallback. Stop/Pause,
          source/account/model changes and expiry revoke this permission. The
          five-minute model catalog may require explicit refresh/reselection and
          renewed permission before End.
        </small>
        <label className="ai-choice">
          <input
            type="checkbox"
            aria-label="Acknowledge automatic post-meeting remote notes"
            checked={postAck}
            disabled={!context || Boolean(ai?.autoGrant)}
            onChange={(event) => setPostAck(event.target.checked)}
          />
          I am authorised to share these selected transcript sources with OpenAI
          and permit one automatic summary attempt on deliberate End within this
          duration.
        </label>
        <button
          className="primary"
          disabled={
            !context ||
            !postAck ||
            (!sharing.microphone && !sharing.systemAudio) ||
            Boolean(ai?.autoGrant)
          }
          onClick={() => {
            if (context)
              void window.everyhint.meetings
                .authorisePost(
                  meetingScope(state, {
                    expected: context,
                    sharing,
                    minutes,
                    requestLimit: 1,
                    acknowledged: true,
                  }),
                )
                .then((result) => {
                  meetingResult(result);
                  setPostAck(false);
                })
                .catch((error) => setError(error.message));
          }}
        >
          Authorise automatic End notes
        </button>
        {ai?.autoGrant && (
          <button
            className="secondary"
            onClick={() =>
              void window.everyhint.meetings.cancelPost(
                meetingScope(state, undefined),
              )
            }
          >
            Cancel automatic End notes
          </button>
        )}
        <p className="muted">{ai?.postStatus}</p>
      </details>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {state.error && (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}
