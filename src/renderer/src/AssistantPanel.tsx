import { useEffect, useState } from "react";
import type {
  AssistantSnapshot,
  ContextOptions,
  ProviderId,
} from "../../shared/ai";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import type { Result } from "../../shared/contracts";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function ResponseText({ text }: { text: string }) {
  // React escapes every string. No HTML, links, images or provider-created actions.
  return (
    <div className="answer-text">
      {text
        .split(/(```[\s\S]*?(?:```|$))/g)
        .filter(Boolean)
        .map((part, index) =>
          part.startsWith("```") ? (
            <pre key={index}>
              <code>
                {part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}
              </code>
            </pre>
          ) : (
            <div key={index}>{part}</div>
          ),
        )}
    </div>
  );
}
export function AssistantPanel({
  compact,
  hideImage,
  expand,
}: {
  compact: boolean;
  hideImage: boolean;
  expand: () => void;
}) {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<ContextOptions>({
    ...DEFAULT_CONTEXT,
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    setOptions({ ...DEFAULT_CONTEXT });
  }, [snapshot?.sessionId]);
  async function run(task: () => Promise<unknown>): Promise<void> {
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
      setBusy(false);
    }
  }
  function invalidate(): void {
    setAcknowledged(false);
    if (snapshot?.review)
      void run(async () =>
        unwrap(await window.everyhint.assistant("discard-review")),
      );
  }
  function changeOption<K extends keyof ContextOptions>(
    key: K,
    value: ContextOptions[K],
  ): void {
    invalidate();
    setOptions((previous) => ({ ...previous, [key]: value }));
  }
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
          {latest
            ? `${labels[latest.status]} · ${latest.text.slice(-90) || latest.error?.message || snapshot.selected}`
            : `${snapshot.selected === "codex" ? "Codex" : "Claude"} · ${selected.ready ? "Ready" : "Not connected"} · Expand to ask`}
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
          <option value="codex">Codex · ChatGPT</option>
          <option value="claude">Claude · API billing</option>
        </select>
      </div>
      <p className="provider-status" role="status">
        <strong>{selected.ready ? "Ready" : "Not connected"}</strong> ·{" "}
        {selected.message}
      </p>
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
      <label className="ai-question">
        Your question
        <textarea
          aria-label="Your question"
          value={question}
          rows={3}
          maxLength={6000}
          disabled={active || busy}
          placeholder="Ask about the context you choose…"
          onChange={(event) => {
            invalidate();
            setQuestion(event.target.value);
          }}
        />
      </label>
      <fieldset className="ai-context" disabled={active || busy}>
        <legend>Include in this request</legend>
        <div className="ai-choices">
          <span>Question text is included.</span>
          {(
            [
              ["microphone", "Recent microphone transcript"],
              ["systemAudio", "Recent system-audio transcript"],
              ["screenshot", "Latest authorised screenshot"],
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
        {!selected.capabilities.images && (
          <small>
            Screenshots are unavailable for this restricted provider
            integration.
          </small>
        )}
        <details className="ai-limits">
          <summary>Context limits</summary>
          {(
            [
              ["recentSeconds", "Recent transcript seconds", 10, 600],
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
          disabled={busy || active || !question.trim()}
          onClick={() =>
            void run(async () => {
              setAcknowledged(false);
              unwrap(
                await window.everyhint.reviewContext({ question, options }),
              );
            })
          }
        >
          Review selected context
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
            Frozen request to {review.provider === "codex" ? "Codex" : "Claude"}
          </strong>
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
            {review.provider}.{" "}
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
              })
            }
          >
            Ask {review.provider === "codex" ? "Codex" : "Claude"}
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
            <strong>{response.question}</strong>
            <small>
              {response.provider} · {labels[response.status]}
              {response.model ? ` · ${response.model}` : ""}
            </small>
            <ResponseText text={response.text} />
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
          </article>
        ))}
      </div>
      {copied && <p role="status">Response copied.</p>}
      <small>
        History expires after 15 minutes and keeps at most four completed pairs
        / 12,000 characters. Clear cancels execution and clears local
        conversation memory. It does not delete provider records or recall sent
        data.
      </small>
    </section>
  );
}
