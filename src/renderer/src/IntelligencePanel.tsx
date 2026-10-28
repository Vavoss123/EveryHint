import { useEffect, useState } from "react";
import { LiveConsent } from "./LiveConsent";
import type { SessionSnapshot, Result } from "../../shared/contracts";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import {
  ACTION_LABELS,
  DEFAULT_INTELLIGENCE,
  type ContextualAction,
  type IntelligenceSettings,
  type IntelligenceSnapshot,
  type OperatingMode,
} from "../../shared/intelligence";

const modeNames = {
  manual: "Manual",
  "auto-hint": "Auto-Hint",
  live: "Live Assist",
};
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function IntelligencePanel({
  snapshot,
  compact,
  openReview,
}: {
  snapshot: IntelligenceSnapshot | null;
  compact: boolean;
  openReview: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [action, setAction] = useState<ContextualAction>("get-answer"),
    [question, setQuestion] = useState(""),
    [participantInfo, setParticipantInfo] = useState("");
  useEffect(() => {
    setQuestion("");
    setParticipantInfo("");
    setError(null);
  }, [snapshot?.sessionId]);
  if (!snapshot) return null;
  const options = {
    ...DEFAULT_CONTEXT,
    microphone: snapshot.settings.sources.microphone,
    systemAudio: snapshot.settings.sources.systemAudio,
    screenshot: snapshot.settings.sources.screen,
    recentSeconds: Math.min(300, snapshot.settings.retentionMinutes * 60),
  };
  async function run(task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Intelligence action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const review = (requested: ContextualAction, suggestionId?: string) =>
    run(async () => {
      const result = unwrap(
        await window.everyhint.contextualAction({
          action: requested,
          options,
          ...(suggestionId ? { suggestionId } : { question }),
          ...(requested === "who" ? { participantInfo } : {}),
        }),
      );
      if (result.type === "review") openReview();
    });
  if (compact) {
    if (snapshot.mode === "manual") return null;
    const top = snapshot.suggestions[0];
    return (
      <div
        className="intelligence-compact"
        aria-label="Compact conversation intelligence"
      >
        <p title={snapshot.questions.at(-1)?.text}>
          {modeNames[snapshot.mode]} ·{" "}
          {snapshot.questions.at(-1)?.text ??
            "Waiting for selected local context"}
        </p>
        {top ? (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void review(top.action, top.id)}
          >
            Review · {ACTION_LABELS[top.action]}
          </button>
        ) : (
          <small>No eligible suggestion</small>
        )}
        {error && (
          <p className="error-message" role="alert" title={error}>
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <section
      className="intelligence-panel panel-stack"
      aria-label="Conversation intelligence"
    >
      <label>
        Operating mode
        <select
          aria-label="Operating mode"
          value={snapshot.mode}
          disabled={busy}
          onChange={(event) =>
            void run(async () =>
              unwrap(
                await window.everyhint.setOperatingMode(
                  event.target.value as OperatingMode,
                ),
              ),
            )
          }
        >
          <option value="manual">Manual Assist</option>
          <option value="auto-hint">Auto-Hint · local suggestions</option>
          <option value="live">Live Assist · separate authorisation</option>
        </select>
      </label>
      <p className="muted" role="status">
        {snapshot.status}
      </p>
      {snapshot.mode === "live" && <LiveConsent snapshot={snapshot} />}
      <small>
        Capture and local transcription need their own consent. Source choices
        and detection limits are in Settings. Accepting a suggestion prepares a
        review; it does not send it.
      </small>
      {snapshot.mode !== "manual" && (
        <div aria-label="Contextual suggestions">
          <h3>Suggested actions</h3>
          {!snapshot.suggestions.length && (
            <p className="muted">No relevant local suggestion yet.</p>
          )}
          {snapshot.suggestions.map((suggestion, index) => (
            <article className="suggestion-card" key={suggestion.id}>
              <small>
                {index === 0 ? "Top suggestion" : "Suggestion"} ·{" "}
                {suggestion.source === "systemAudio"
                  ? "System audio · participant unknown"
                  : suggestion.source === "microphone"
                    ? "Microphone"
                    : "Selected screen"}
              </small>
              <p>{suggestion.text}</p>
              <div className="ai-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void review(suggestion.action, suggestion.id)}
                >
                  Accept · {ACTION_LABELS[suggestion.action]}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      unwrap(
                        await window.everyhint.dismissSuggestion({
                          id: suggestion.id,
                          similar: false,
                        }),
                      ),
                    )
                  }
                >
                  Dismiss
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      unwrap(
                        await window.everyhint.dismissSuggestion({
                          id: suggestion.id,
                          similar: true,
                        }),
                      ),
                    )
                  }
                >
                  Dismiss similar this session
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <details>
        <summary>Contextual actions</summary>
        <div className="panel-stack">
          <label>
            Action
            <select
              aria-label="Contextual action"
              value={action}
              onChange={(event) =>
                setAction(event.target.value as ContextualAction)
              }
            >
              {Object.entries(ACTION_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Question, topic or claim
            <textarea
              aria-label="Action topic"
              value={question}
              maxLength={6000}
              rows={2}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          {action === "who" && (
            <label>
              Explicit participant information (optional)
              <textarea
                aria-label="Authorised participant information"
                value={participantInfo}
                maxLength={1500}
                rows={2}
                onChange={(event) => setParticipantInfo(event.target.value)}
              />
            </label>
          )}
          {action === "fact-check" && (
            <p className="warning-message">
              Unverified · context-only. No web retrieval or independent
              authoritative fact check is available.
            </p>
          )}
          {action === "recap" && (
            <small>
              Only the selected retained window (up to {options.recentSeconds}{" "}
              seconds) is available, not the entire meeting.
            </small>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void review(action)}
          >
            {action === "who"
              ? "Show authorised participant information"
              : "Review contextual action"}
          </button>
          <small>
            Actions use the checked local analysis sources; the exact frozen
            payload can be removed or excluded before approval. Screenshot
            requires active capture and an image-capable model.
          </small>
        </div>
      </details>
      {snapshot.localResult && (
        <div className="context-review" aria-label="Local contextual result">
          <strong>
            {ACTION_LABELS[snapshot.localResult.action]} · local result
          </strong>
          <p>{snapshot.localResult.text}</p>
        </div>
      )}
      {snapshot.mode !== "manual" && (
        <details>
          <summary>Live local context timeline</summary>
          <ol className="context-timeline">
            {snapshot.events.slice(-12).map((event) => (
              <li key={event.id}>
                <small>
                  {new Date(event.at).toLocaleTimeString()} · {event.type}
                  {event.source
                    ? ` · ${event.source === "systemAudio" ? "System audio (participant unknown)" : event.source}`
                    : ""}
                </small>
                <p>{event.text}</p>
              </li>
            ))}
          </ol>
          <h3>Recent detected questions</h3>
          {snapshot.questions.slice(-5).map((item) => (
            <p key={item.id}>
              {item.text}
              <small>
                {" "}
                Rule score {Math.round(item.confidence * 100)}% (heuristic, not
                a probability)
                {item.automaticEligible
                  ? " · eligible for a separately authorised Live session"
                  : " · review only"}
                {item.screen
                  ? ` · correlated with ${item.screen.name}`
                  : " · no correlated screen"}
              </small>
            </p>
          ))}
          <small>
            {snapshot.screen
              ? `Selected screen: ${snapshot.screen.name} · ${new Date(snapshot.screen.capturedAt).toLocaleTimeString()}. A visual change does not identify a question or error.`
              : "No current selected screen observation."}
          </small>
        </details>
      )}
      <details>
        <summary>Local intelligence diagnostics</summary>
        <p>
          {snapshot.diagnostics.analysedTranscripts} final excerpts ·{" "}
          {snapshot.diagnostics.duplicateQuestions} repeated questions
          suppressed · {snapshot.diagnostics.sampledFrames} screen samples ·{" "}
          {snapshot.diagnostics.unchangedFrames} unchanged frames ·{" "}
          {snapshot.diagnostics.screenChanges} stable changes
        </p>
        <small>
          Last detection {snapshot.diagnostics.detectionMs.toFixed(3)} ms ·
          screen processing {snapshot.diagnostics.screenMs.toFixed(3)} ms ·
          queue {snapshot.diagnostics.queueDepth}. These are local observations,
          not real-call accuracy or cost estimates.
        </small>
      </details>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function IntelligenceSettingsPanel({
  snapshot,
  capture,
}: {
  snapshot: IntelligenceSnapshot | null;
  capture: SessionSnapshot;
}) {
  const [draft, setDraft] = useState<IntelligenceSettings>(
    structuredClone(DEFAULT_INTELLIGENCE),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = JSON.stringify(snapshot?.settings ?? DEFAULT_INTELLIGENCE);
  useEffect(() => {
    setDraft(JSON.parse(saved) as IntelligenceSettings);
  }, [saved]);
  async function save(value: IntelligenceSettings) {
    setBusy(true);
    setError(null);
    try {
      unwrap(await window.everyhint.saveIntelligenceSettings(value));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save intelligence settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel-stack intelligence-settings"
      aria-label="Intelligence settings"
    >
      <h2>Conversation intelligence</h2>
      <label>
        Operating mode
        <select
          aria-label="Intelligence operating mode"
          value={snapshot?.mode ?? "manual"}
          disabled={busy}
          onChange={(event) => {
            setError(null);
            void window.everyhint
              .setOperatingMode(event.target.value as OperatingMode)
              .then((result) => {
                if (!result.ok) setError(result.error);
              });
          }}
        >
          <option value="manual">Manual Assist</option>
          <option value="auto-hint">Auto-Hint · local suggestions</option>
          <option value="live">Live Assist · permission in Assistant</option>
        </select>
      </label>
      <p className="muted">
        Choose sources for local question and screen-change analysis. These
        choices do not start capture or authorise remote automation. Live Assist
        requires a separate expiring permission.
      </p>
      <fieldset disabled={busy}>
        <legend>Analyse locally / review in contextual actions</legend>
        {(["microphone", "systemAudio", "screen"] as const).map((source) => (
          <label className="ai-choice" key={source}>
            <input
              type="checkbox"
              aria-label={`Analyse ${source} locally`}
              checked={draft.sources[source]}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  sources: {
                    ...previous.sources,
                    [source]: event.target.checked,
                  },
                }))
              }
            />
            {source === "systemAudio"
              ? "System-audio final transcripts"
              : source === "microphone"
                ? "Microphone final transcripts"
                : "Selected screen changes"}
          </label>
        ))}
      </fieldset>
      {(
        [
          [
            "confidenceThreshold",
            "Automatic question rule threshold",
            0.85,
            0.99,
            0.01,
          ],
          ["cooldownSeconds", "Automatic request cooldown seconds", 30, 600, 1],
          ["requestLimit", "Requests per Live authorisation", 1, 100, 1],
          ["sessionMinutes", "Live authorisation duration minutes", 1, 60, 1],
          [
            "retentionMinutes",
            "Local intelligence retention minutes",
            1,
            15,
            1,
          ],
        ] as const
      ).map(([key, label, min, max, step]) => (
        <label key={key}>
          {label}
          <input
            aria-label={label}
            type="number"
            value={draft[key]}
            min={min}
            max={max}
            step={step}
            disabled={busy}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                [key]: Number(event.target.value),
              }))
            }
          />
        </label>
      ))}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void save(draft)}
      >
        Apply intelligence settings
      </button>
      <small>
        Applying changes revokes any Live authorisation and pending review. Mode
        and sharing permission are never restored on startup. Subscription
        request limits are not monetary cost estimates.
      </small>
      <p className="muted">
        Current source: {capture.source?.name ?? "None selected"}. Exclusion
        covers the entire selected source; individual apps inside a whole-screen
        capture are not masked.
      </p>
      <button
        className="secondary"
        disabled={busy || !capture.source}
        onClick={() => {
          if (capture.source) {
            const id = capture.source.id;
            const excluded = draft.excludedSourceIds.includes(id);
            const next = {
              ...draft,
              excludedSourceIds: excluded
                ? draft.excludedSourceIds.filter((value) => value !== id)
                : [...draft.excludedSourceIds, id],
            };
            setDraft(next);
            void save(next);
          }
        }}
      >
        {capture.source && draft.excludedSourceIds.includes(capture.source.id)
          ? "Allow selected source in intelligence"
          : "Exclude selected source from intelligence"}
      </button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
