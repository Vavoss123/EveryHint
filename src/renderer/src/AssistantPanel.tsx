import { useEffect, useRef, useState } from "react";
import type {
  AssistantSnapshot,
  ContextOptions,
  ProviderId,
  AssistPreset,
} from "../../shared/ai";
import { ASSIST_PRESETS, DEFAULT_CONTEXT } from "../../shared/ai";
import type { Result } from "../../shared/contracts";
import { AccountPanel } from "./AccountPanel";
import { ResponseText } from "./ResponseText";
import { ACTION_LABELS, type OperatingMode } from "../../shared/intelligence";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function AssistantPanel({
  compact,
  hideImage,
  expand,
  sourceName,
  operatingMode = "manual",
  openMeetings,
}: {
  compact: boolean;
  hideImage: boolean;
  expand: () => void;
  sourceName: string;
  operatingMode?: OperatingMode;
  openMeetings?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [question, setQuestion] = useState("");
  const [preset, setPreset] = useState<AssistPreset>("general");
  const [options, setOptions] = useState<ContextOptions>({
    ...DEFAULT_CONTEXT,
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const operation = useRef(false);
  useEffect(() => {
    const accept = (value: AssistantSnapshot): void =>
      setSnapshot((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const off = window.everyhint.onAssistant(accept);
    void window.everyhint
      .getAssistant()
      .then((value) => accept(unwrap(value)))
      .catch(() => setError("Could not connect to the assistant."));
    return off;
  }, []);
  useEffect(() => {
    setAcknowledged(false);
  }, [snapshot?.review?.requestId, snapshot?.sessionId]);
  useEffect(() => {
    setQuestion("");
    setPreset("general");
    setOptions({ ...DEFAULT_CONTEXT });
  }, [snapshot?.sessionId]);
  async function run(task: () => Promise<unknown>): Promise<void> {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Assistant action failed.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function invalidate(): void {
    setAcknowledged(false);
    void window.everyhint.assistant("discard-review");
  }
  function changeOption<K extends keyof ContextOptions>(
    key: K,
    value: ContextOptions[K],
  ): void {
    invalidate();
    setOptions((previous) => ({ ...previous, [key]: value }));
  }
  function prepareReview(): Promise<void> {
    if (
      !snapshot ||
      snapshot.responses.some(
        (response) =>
          response.status === "sending" || response.status === "generating",
      )
    )
      return Promise.resolve();
    return run(async () => {
      setAcknowledged(false);
      unwrap(
        await window.everyhint.reviewContext({ question, options, preset }),
      );
    });
  }
  function removeContext(
    reviewId: string,
    kind: "transcripts" | "history" | "screenshot",
    index: number,
  ): void {
    setAcknowledged(false);
    void run(async () =>
      unwrap(await window.everyhint.removeContext({ reviewId, kind, index })),
    );
  }
  useEffect(() =>
    window.everyhint.onAssist(() => {
      void prepareReview();
    }),
  );
  if (!snapshot)
    return <div className="muted">Connecting to local assistant controls…</div>;
  const selected = snapshot.providers.find(
    (provider) => provider.id === snapshot.selected,
  )!;
  const latest = snapshot.responses.at(-1);
  const active =
    latest?.status === "sending" || latest?.status === "generating";
  const review = snapshot.review;
  const labels = {
    sending: "Sending",
    generating: "Generating",
    completed: "Completed",
    cancelled: "Cancelled",
    error: "Error",
    "rate-limited": "Rate limited",
  };
  if (compact)
    return (
      <div className="assistant-compact">
        <button
          className="text-button"
          onClick={expand}
          title="Expand assistant"
        >
          {operatingMode === "manual" ? "Manual · " : ""}
          {latest
            ? `${snapshot.selected === "codex" ? "ChatGPT" : "Claude"} · ${labels[latest.status]} · ${latest.text.slice(-90) || latest.error?.message || ""}`
            : `${snapshot.selected === "codex" ? "ChatGPT" : "Claude"} · ${selected.ready ? "Ready" : "Not connected"} · Expand to ask`}
        </button>
        <button
          className="secondary quick-ask"
          onClick={() => {
            expand();
            void prepareReview();
          }}
          title="Expand and review selected context. Acknowledgement and Ask are required before transmission."
        >
          Get Answer
        </button>
        {active && (
          <button
            onClick={() =>
              void run(async () =>
                unwrap(await window.everyhint.assistant("cancel")),
              )
            }
          >
            Cancel
          </button>
        )}
      </div>
    );
  return (
    <section
      className="assistant-panel panel-stack"
      aria-label="EveryHint assistant"
    >
      <details className="assistant-connection" open={!selected.ready}>
        <summary>
          {snapshot.selected === "codex" ? "ChatGPT plan" : "Claude API"} ·{" "}
          {selected.ready ? "Ready" : "Connection settings"}
        </summary>
        <div className="provider-row">
          <label htmlFor="ai-provider">AI provider</label>
          <select
            id="ai-provider"
            aria-label="AI provider"
            value={snapshot.selected}
            disabled={busy}
            onChange={(event) => {
              setAcknowledged(false);
              setQuestion("");
              setOptions({ ...DEFAULT_CONTEXT });
              void run(async () =>
                unwrap(
                  await window.everyhint.selectProvider(
                    event.target.value as ProviderId,
                  ),
                ),
              );
            }}
          >
            <option value="codex">ChatGPT · plan usage</option>
            <option value="claude">Claude · API billing</option>
          </select>
        </div>
        <p className="provider-status" role="status">
          <strong>{selected.ready ? "Ready" : "Not connected"}</strong> ·{" "}
          {selected.message}
        </p>
        <AccountPanel provider={snapshot.selected} />
        {snapshot.selected === "codex" && (
          <div className="context-review">
            <button
              className="secondary"
              disabled={busy || active || selected.auth !== "chatgpt"}
              onClick={() =>
                void run(async () =>
                  unwrap(await window.everyhint.discoverModels()),
                )
              }
            >
              Refresh ChatGPT models
            </button>
            <small>
              Refresh sends an authorised model-list request to OpenAI. It does
              not submit a question. Model access can still be denied when
              asking.
            </small>
            <label>
              ChatGPT model
              <select
                aria-label="ChatGPT model"
                value={selected.selectedModel ?? ""}
                disabled={busy || active || !selected.modelDetails?.length}
                onChange={(event) => {
                  const id = event.target.value;
                  void run(async () =>
                    unwrap(await window.everyhint.selectModel(id)),
                  );
                }}
              >
                <option value="" disabled>
                  Choose a model
                </option>
                {selected.modelDetails?.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.images
                      ? " · images supported"
                      : " · image support unconfirmed"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button
          className="secondary"
          disabled={busy || active}
          onClick={() =>
            void run(async () =>
              unwrap(await window.everyhint.inspectProviders()),
            )
          }
        >
          Check connection
        </button>
        {snapshot.selected === "claude" && (
          <label className="ai-choice billing-choice">
            <input
              type="checkbox"
              checked={snapshot.claudeApiBilling}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                void run(async () =>
                  unwrap(await window.everyhint.setClaudeApiBilling(enabled)),
                );
              }}
            />
            <span>
              Enable separately billed Claude API requests for this app session.
              My Claude subscription is not used.
            </span>
          </label>
        )}
      </details>
      <label>
        Assist preset
        <select
          aria-label="Assist preset"
          value={preset}
          disabled={active || busy}
          onChange={(event) => {
            invalidate();
            setPreset(event.target.value as AssistPreset);
          }}
        >
          {Object.entries(ASSIST_PRESETS).map(([id, item]) => (
            <option key={id} value={id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ai-question">
        {latest
          ? "Question or follow-up (optional)"
          : "Your question (optional)"}
        <textarea
          aria-label="Your question"
          value={question}
          rows={3}
          maxLength={6000}
          disabled={active || busy}
          placeholder="Ask a question, or leave blank for help with selected context…"
          onChange={(event) => {
            invalidate();
            setQuestion(event.target.value);
          }}
        />
      </label>
      <fieldset className="ai-context" disabled={active || busy}>
        <legend>Include in this request</legend>
        <div className="ai-choices">
          <span>{sourceName}</span>
          {(
            [
              ["microphone", "Recent microphone transcript"],
              ["systemAudio", "Recent system-audio transcript"],
              ["screenshot", "Fresh authorised screenshot"],
              ["history", "Previous question and answer text"],
            ] as const
          ).map(([key, label]) => (
            <label className="ai-choice" key={key}>
              <input
                type="checkbox"
                checked={options[key]}
                disabled={key === "screenshot" && !selected.capabilities.images}
                onChange={(event) => changeOption(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <label>
          Transcript time window
          <select
            aria-label="Transcript time window"
            value={options.recentSeconds}
            onChange={(event) =>
              changeOption("recentSeconds", Number(event.target.value))
            }
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={180}>3 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </label>
        {!selected.capabilities.images && (
          <small>
            Screenshots require explicit image-input support in the selected
            model’s current metadata.
          </small>
        )}
        <details className="ai-limits">
          <summary>Context limits</summary>
          {(
            [
              ["transcriptChars", "Transcript characters", 100, 12000],
              ["totalChars", "Total text characters", 1000, 40000],
              ["imageBytes", "Maximum image bytes", 50000, 4000000],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step={1}
                value={options[key]}
                onChange={(event) =>
                  changeOption(key, Number(event.target.value))
                }
              />
            </label>
          ))}
        </details>
      </fieldset>
      <p className="muted">
        Whisper stays local. Ask sends your reviewed text and optional image to
        the selected provider. Raw audio is never included. Nothing is sent
        automatically.
      </p>
      <div className="ai-actions">
        <button
          className="secondary"
          disabled={busy || active}
          onClick={() => void prepareReview()}
        >
          Get Answer · review context
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setQuestion("");
            setOptions({ ...DEFAULT_CONTEXT });
            setAcknowledged(false);
            void run(async () =>
              unwrap(await window.everyhint.assistant("clear")),
            );
          }}
        >
          Clear conversation
        </button>
        {active && (
          <button
            className="danger"
            onClick={() =>
              void run(async () =>
                unwrap(await window.everyhint.assistant("cancel")),
              )
            }
          >
            Cancel request
          </button>
        )}
      </div>
      {review && (
        <div className="context-review" aria-label="Context review">
          <strong>
            Frozen request to{" "}
            {review.provider === "codex" ? "ChatGPT" : "Claude"}
            {review.model ? ` · ${review.model}` : ""}
          </strong>
          <small>
            {ASSIST_PRESETS[review.preset ?? "general"].name}
            {review.action ? ` · ${ACTION_LABELS[review.action]}` : ""}
            {review.sourceName ? ` · ${review.sourceName}` : ""}
          </small>
          <small>
            {review.textChars.toLocaleString()} text characters ·{" "}
            {review.imageBytes.toLocaleString()} image bytes · Expires{" "}
            {new Date(review.expiresAt).toLocaleTimeString()}
          </small>
          {review.notices.map((notice) => (
            <p className="muted" key={notice}>
              {notice}
            </p>
          ))}
          {review.meetingContext && (
            <div className="panel-stack">
              <strong>
                Selected meeting text · {review.meetingContext.purpose}
              </strong>
              {review.meetingContext.excerpts.map((excerpt) => (
                <div className="review-item" key={excerpt.ref}>
                  <small>
                    {excerpt.kind === "notes" ? "User notes" : excerpt.source} ·{" "}
                    {excerpt.ref}
                  </small>
                  <p>{excerpt.text}</p>
                </div>
              ))}
              <button className="secondary" onClick={openMeetings}>
                Review meeting notes and drafts
              </button>
            </div>
          )}
          {review.transcripts.map((excerpt, index) => (
            <div
              className="review-item"
              key={`${review.requestId}-transcript-${index}`}
            >
              <small>
                {excerpt.source === "microphone"
                  ? "Microphone"
                  : "System audio · participant unknown"}{" "}
                · {new Date(excerpt.startMs).toLocaleTimeString()}–
                {new Date(excerpt.endMs).toLocaleTimeString()}
              </small>
              <p>{excerpt.text}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  removeContext(review.requestId, "transcripts", index)
                }
              >
                Remove excerpt {index + 1}
              </button>
            </div>
          ))}
          {review.history.map((turn, index) => (
            <div
              className="review-item"
              key={`${review.requestId}-history-${index}`}
            >
              <small>Previous exchange {index + 1}</small>
              <p>{turn.question || "Contextual assistance"}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  removeContext(review.requestId, "history", index)
                }
              >
                Remove exchange {index + 1}
              </button>
            </div>
          ))}
          {review.screenshot && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setOptions((previous) => ({ ...previous, screenshot: false }));
                removeContext(review.requestId, "screenshot", 0);
              }}
            >
              Remove screenshot
            </button>
          )}
          <details open>
            <summary>Exact question, transcripts and conversation text</summary>
            <pre className="review-text">{review.prompt}</pre>
          </details>
          {review.screenshot &&
            (hideImage ? (
              <p className="muted">
                Screenshot frozen at{" "}
                {new Date(review.screenshot.capturedAt).toLocaleTimeString()}.
                Pause screen capture to inspect this image without creating
                recursive screenshots.
              </p>
            ) : (
              <figure>
                <img
                  src={review.screenshot.dataUrl}
                  alt="Frozen screenshot selected for this request"
                />
                <figcaption>
                  {review.screenshot.width} × {review.screenshot.height} ·{" "}
                  {new Date(review.screenshot.capturedAt).toLocaleTimeString()}
                </figcaption>
              </figure>
            ))}
          <label className="ai-choice">
            <input
              type="checkbox"
              aria-label="Acknowledge remote transfer"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I reviewed this payload and authorise sending it to{" "}
            {review.provider === "codex" ? "ChatGPT" : "Claude"}.{" "}
            {review.provider === "claude"
              ? "Anthropic API charges may apply."
              : "Subscription usage limits may apply."}
          </label>
          <button
            className="primary"
            disabled={busy || active || !acknowledged || !selected.ready}
            onClick={() =>
              void run(async () => {
                setAcknowledged(false);
                unwrap(
                  await window.everyhint.ask({
                    reviewId: review.requestId,
                    acknowledged: true,
                  }),
                );
                setQuestion("");
                setOptions((previous) => ({
                  ...previous,
                  screenshot: false,
                  microphone: false,
                  systemAudio: false,
                }));
                requestAnimationFrame(() =>
                  document
                    .querySelector(".ai-responses")
                    ?.scrollIntoView({ block: "start" }),
                );
              })
            }
          >
            Ask {review.provider === "codex" ? "ChatGPT" : "Claude"}
          </button>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div
        className="ai-responses"
        aria-label="Assistant responses"
        aria-live="polite"
      >
        {!snapshot.responses.length && (
          <p className="muted">
            Answers appear here after an authorised request.
          </p>
        )}
        {snapshot.responses.map((response) => (
          <article className="ai-response" key={response.requestId}>
            <strong>{response.question || "Help with selected context"}</strong>
            <small>
              {response.provider === "codex" ? "ChatGPT" : "Claude"} ·{" "}
              {labels[response.status]}
              {response.model ? ` · ${response.model}` : ""}
            </small>
            {response.automatic && !response.meetingPurpose && (
              <small>
                Live Assist · automatically requested within your authorised
                session
              </small>
            )}
            {response.contextNotices?.map((notice) => (
              <small className="warning-message" key={notice}>
                {notice}
              </small>
            ))}
            {response.action === "fact-check" && (
              <p className="warning-message">
                Unverified · context-only assessment. No external independent
                verification.
              </p>
            )}
            {response.action === "recap" && (
              <small>Recap of selected retained context only</small>
            )}
            {response.meetingPurpose === "summary" ? (
              <>
                <p className="muted">
                  {response.status === "sending" ||
                  response.status === "generating"
                    ? "Generating a structured meeting draft…"
                    : "Meeting summary request finished. Review its draft and supporting transcript in Meetings before saving."}
                </p>
                <button className="secondary" onClick={openMeetings}>
                  Open meeting draft
                </button>
              </>
            ) : (
              <ResponseText text={response.text} />
            )}
            {response.error && (
              <p className="error-message" role="alert">
                {response.error.message}
              </p>
            )}
            <small>
              {response.firstTextAt !== null
                ? `First text ${((response.firstTextAt - response.startedAt) / 1000).toFixed(2)}s · `
                : ""}
              {response.endedAt !== null
                ? `Total ${((response.endedAt - response.startedAt) / 1000).toFixed(2)}s`
                : "Waiting for provider…"}
              {response.usage
                ? ` · Input ${response.usage.inputTokens ?? "unavailable"} / output ${response.usage.outputTokens ?? "unavailable"} tokens${response.usage.estimatedUsd !== undefined ? ` · Estimated $${response.usage.estimatedUsd.toFixed(4)}` : ""}`
                : ""}
            </small>
            <button
              className="text-button"
              disabled={!response.text}
              onClick={() =>
                void run(async () => {
                  unwrap(await window.everyhint.copyResponse(response.text));
                  setCopied(true);
                })
              }
            >
              Copy response
            </button>
            {response === latest && !active && (
              <>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setQuestion("");
                    document
                      .querySelector<HTMLTextAreaElement>(
                        '[aria-label="Your question"]',
                      )
                      ?.focus();
                  }}
                >
                  Ask follow-up
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const nextOptions = { ...DEFAULT_CONTEXT };
                      setQuestion(response.question);
                      setPreset(response.preset ?? "general");
                      setOptions(nextOptions);
                      setAcknowledged(false);
                      unwrap(
                        await window.everyhint.reviewContext({
                          question: response.question,
                          options: nextOptions,
                          preset: response.preset ?? "general",
                          action: response.action,
                          regenerateId: response.requestId,
                        }),
                      );
                      requestAnimationFrame(() =>
                        document
                          .querySelector('[aria-label="Context review"]')
                          ?.scrollIntoView({ block: "start" }),
                      );
                    })
                  }
                >
                  Regenerate · review first
                </button>
              </>
            )}
          </article>
        ))}
      </div>
      {copied && <p role="status">Response copied.</p>}
      <small>
        Follow-ups include only selected previous question/answer text; images
        and audio excerpts must be selected again. Regenerate reviews the
        question and earlier exchanges without reattaching an image or
        transcripts. Removed excerpts stay excluded until Clear conversation.
        History expires after 15 minutes and keeps at most four completed pairs
        / 12,000 characters. Clear cancels execution and clears local
        conversation memory. It does not delete provider records or recall sent
        data.
      </small>
    </section>
  );
}
