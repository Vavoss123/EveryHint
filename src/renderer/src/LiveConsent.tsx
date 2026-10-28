import { useEffect, useState } from "react";
import type {
  IntelligenceSnapshot,
  LiveSharing,
} from "../../shared/intelligence";

export function LiveConsent({ snapshot }: { snapshot: IntelligenceSnapshot }) {
  const [sharing, setSharing] = useState<LiveSharing>({
    microphone: false,
    systemAudio: false,
    screenshot: false,
    history: false,
  });
  const [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const context = snapshot.liveContext,
    limits = snapshot.settings;
  const binding = JSON.stringify({
    context,
    settings: snapshot.settings,
    grant: snapshot.live?.id,
  });
  useEffect(() => {
    setAcknowledged(false);
    setError(null);
    setSharing((previous) =>
      snapshot.live
        ? structuredClone(snapshot.live.sharing)
        : {
            ...previous,
            microphone:
              previous.microphone && Boolean(context?.available.microphone),
            systemAudio:
              previous.systemAudio && Boolean(context?.available.systemAudio),
            screenshot:
              previous.screenshot &&
              Boolean(context?.available.screenshot && context.images),
            ...(previous.knowledge
              ? {
                  knowledge: {
                    enabled:
                      previous.knowledge.enabled &&
                      previous.knowledge.ids.some((id) =>
                        context?.knowledgeSources?.some(
                          (source) => source.id === id,
                        ),
                      ),
                    remote: false,
                    ids: previous.knowledge.ids.filter((id) =>
                      context?.knowledgeSources?.some(
                        (source) => source.id === id,
                      ),
                    ),
                  },
                }
              : {}),
          },
    );
  }, [binding]);
  async function authorise() {
    if (!context) return;
    setBusy(true);
    setError(null);
    setAcknowledged(false);
    try {
      const result = await window.everyhint.authoriseLive({
        acknowledged: true,
        expected: context,
        sharing,
        limits: {
          sessionMinutes: limits.sessionMinutes,
          cooldownSeconds: limits.cooldownSeconds,
          requestLimit: limits.requestLimit,
        },
      });
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not authorise Live Assist.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="context-review live-consent"
      aria-label="Live Assist permission"
    >
      <h3>Separate remote-sharing permission</h3>
      <details open={!snapshot.live}>
        <summary>
          {snapshot.live
            ? "Review active sharing scope and limits"
            : "Review sources, triggers and limits before authorising"}
        </summary>
        <p>
          During an authorised Live session, eligible final spoken questions can
          automatically send selected information to OpenAI through your ChatGPT
          plan. Local capture or transcription alone does not grant this
          permission.
        </p>
        <p>
          <strong>Provider:</strong> OpenAI · ChatGPT plan
          <br />
          <strong>Account:</strong>{" "}
          {context?.accountLabel ?? "Connect a ChatGPT plan account"}
          <br />
          <strong>Model:</strong>{" "}
          {context?.model ??
            "Refresh models and choose one in connection settings"}
          <br />
          <strong>AI mode:</strong> {context?.modeName ?? "General"}
          <br />
          <strong>Screen/window:</strong>{" "}
          {context?.sourceName ?? "No screen selected · audio only"}
        </p>
        <fieldset disabled={busy || Boolean(snapshot.live)}>
          <legend>May be shared automatically</legend>
          {(
            [
              [
                "microphone",
                "Microphone final transcripts and detected questions",
              ],
              [
                "systemAudio",
                "System-audio final transcripts and detected questions",
              ],
              ["screenshot", "Current image of the selected screen/window"],
              [
                "history",
                "Current conversation's previous question/answer text",
              ],
            ] as const
          ).map(([key, label]) => (
            <label className="ai-choice" key={key}>
              <input
                type="checkbox"
                aria-label={`Live share ${key}`}
                checked={sharing[key]}
                disabled={
                  key !== "history" &&
                  (!context?.available[key] ||
                    (key === "screenshot" && !context.images))
                }
                onChange={(event) => {
                  setAcknowledged(false);
                  setSharing((previous) => ({
                    ...previous,
                    [key]: event.target.checked,
                  }));
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {context?.knowledgeSources && (
          <fieldset disabled={busy || Boolean(snapshot.live)}>
            <legend>Knowledge for this Live session</legend>
            <label className="ai-choice">
              <input
                type="checkbox"
                aria-label="Enable Live knowledge retrieval"
                checked={sharing.knowledge?.enabled ?? false}
                onChange={(e) => {
                  setAcknowledged(false);
                  setSharing({
                    ...sharing,
                    knowledge: {
                      enabled: e.target.checked,
                      remote: sharing.knowledge?.remote ?? false,
                      ids: sharing.knowledge?.ids ?? [],
                    },
                  });
                }}
              />
              Enable relevant-excerpt retrieval
            </label>
            <label className="ai-choice">
              <input
                type="checkbox"
                aria-label="Allow Live knowledge remote sharing"
                checked={sharing.knowledge?.remote ?? false}
                onChange={(e) => {
                  setAcknowledged(false);
                  setSharing({
                    ...sharing,
                    knowledge: {
                      enabled: sharing.knowledge?.enabled ?? false,
                      remote: e.target.checked,
                      ids: sharing.knowledge?.ids ?? [],
                    },
                  });
                }}
              />
              Allow selected excerpts to be shared remotely with OpenAI
            </label>
            {context.knowledgeSources.length === 0 && (
              <p>No enabled documents associated with the active mode.</p>
            )}
            {context.knowledgeSources.map((doc) => (
              <label className="ai-choice" key={doc.id}>
                <input
                  type="checkbox"
                  checked={sharing.knowledge?.ids.includes(doc.id) ?? false}
                  onChange={(e) => {
                    setAcknowledged(false);
                    const old = sharing.knowledge ?? {
                      enabled: false,
                      remote: false,
                      ids: [],
                    };
                    setSharing({
                      ...sharing,
                      knowledge: {
                        ...old,
                        ids: e.target.checked
                          ? [...old.ids, doc.id]
                          : old.ids.filter((id) => id !== doc.id),
                      },
                    });
                  }}
                />
                {doc.name}
              </label>
            ))}
            <p>
              At most four relevant excerpts / 4,800 text characters per
              request. Sent excerpts remain inspectable on each answer.
            </p>
          </fieldset>
        )}
        {!context?.transcribing && (
          <p className="muted">
            Start authorised microphone/system capture and enable local Whisper
            transcription first. Choose local analysis sources in Settings. This
            permission never starts recording or downloads a model.
          </p>
        )}
        {context && !context.images && (
          <small>
            The selected model has no confirmed image-input support. Screen
            sharing is unavailable.
          </small>
        )}
        <p>
          <strong>Trigger:</strong> relevant final spoken questions that pass
          the rules and at least {Math.round(limits.confidenceThreshold * 100)}%
          heuristic score. Low-confidence detections stay suggestions. A screen
          change alone never sends a request.
        </p>
        <p>
          <strong>Limits:</strong> expires after {limits.sessionMinutes}{" "}
          minute(s); at least {limits.cooldownSeconds} seconds between automatic
          attempts; at most {limits.requestLimit} attempt(s), including
          failed/uncertain attempts. Relevant selected text is bounded to the
          retained window (at most {Math.min(300, limits.retentionMinutes * 60)}{" "}
          seconds), with optional bounded history/image.
        </p>
        <small>
          Raw audio is never sent. Request limits are not monetary cost
          estimates. There is no paid API fallback, web verification or agent
          tool execution. Current model choices are cached for five minutes;
          expiry or lost access can pause Live earlier, requiring explicit model
          refresh and renewed permission. An unchanged already-sent image may be
          omitted and disclosed on the answer.
        </small>
        <p className="muted">
          Pause Live stops automatic sharing; capture Pause/Stop also revoke
          this permission and cancel automatic work. Resume does not restore it.
          Already transmitted information cannot be recalled. Whole-screen
          capture can include other visible apps; source exclusion covers the
          whole selected source and does not mask individual windows.
        </p>
        <label className="ai-choice">
          <input
            type="checkbox"
            aria-label="Acknowledge Live remote sharing"
            checked={acknowledged}
            disabled={busy || Boolean(snapshot.live) || !context}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I am authorised to share these selected sources, have any required
          participant consent, and authorise automatic ChatGPT-plan requests
          only within these limits.
        </label>
        <button
          className="primary"
          disabled={
            busy ||
            Boolean(snapshot.live) ||
            !context?.transcribing ||
            !acknowledged ||
            (!sharing.microphone && !sharing.systemAudio)
          }
          onClick={() => void authorise()}
        >
          Authorise Live Assist
        </button>
        {snapshot.live && (
          <button
            className="secondary"
            onClick={() => void window.everyhint.pauseLive()}
          >
            End this Live authorisation
          </button>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </details>
    </section>
  );
}
export function LiveStatus({
  snapshot,
}: {
  snapshot: IntelligenceSnapshot | null;
}) {
  const grant = snapshot?.live;
  if (!grant) return null;
  const remaining = Math.max(
    0,
    Math.ceil((grant.expiresAt - Date.now()) / 1000),
  );
  return (
    <div
      className="live-status"
      role="status"
      aria-label="Automatic remote sharing enabled"
    >
      <span>
        <strong>Live · remote sharing enabled</strong> · {grant.model} ·{" "}
        {grant.requests}/{grant.requestLimit} attempts · {remaining}s left
      </span>
      <button
        className="secondary"
        onClick={() => void window.everyhint.pauseLive()}
      >
        Pause Live Assist
      </button>
    </div>
  );
}
