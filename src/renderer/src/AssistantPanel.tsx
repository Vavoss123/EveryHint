import { useEffect, useRef, useState } from "react";
import type { AssistantSnapshot, ContextOptions } from "../../shared/ai";
import { ASSIST_PRESETS, DEFAULT_CONTEXT } from "../../shared/ai";
import type { Result } from "../../shared/contracts";
import { ModeSelector } from "./PersonalPages";
import type { SessionSnapshot } from "../../shared/contracts";
import type { TranscriptEvent } from "../../shared/transcription";
import { ListenControls, useListen } from "./ListenControls";
import { DEFAULT_HOTKEYS } from "../../shared/shortcuts";
import { ResponseText } from "./ResponseText";
import { ACTION_LABELS } from "../../shared/intelligence";
import { usePersonal } from "./PersonalPages";
import { useWorkspace, workspaceCommand } from "./WorkspacePages";
import {
  WorkspaceChoices,
  emptyWorkspaceSelection,
} from "./WorkspaceSelection";
import { WorkspaceSources } from "./BriefPanel";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function AssistantPanel({
  hideImage,
  sourceName,
  openMeetings,
  capture,
  limits,
  connect,
}: {
  capture: SessionSnapshot;
  limits?: import("../../shared/contracts").Settings["contextLimits"];
  connect: () => void;
  hideImage: boolean;
  sourceName: string;
  openMeetings?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const personal = usePersonal();
  const listen = useListen();
  const [answerShortcut, setAnswerShortcut] = useState(DEFAULT_HOTKEYS.answer);
  useEffect(() => {
    const accept = (value: import("../../shared/contracts").AppSnapshot) =>
      setAnswerShortcut(
        value.settings.answerShortcut ?? DEFAULT_HOTKEYS.answer,
      );
    const off = window.everyhint.onSnapshot(accept);
    void window.everyhint.getSnapshot().then((r) => {
      if (r.ok) accept(r.value);
    });
    return off;
  }, []);
  const workspace = useWorkspace();
  const [workspaceSelection, setWorkspaceSelection] = useState(
    emptyWorkspaceSelection(),
  );
  const [knowledgeIds, setKnowledgeIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<ContextOptions>({
    ...DEFAULT_CONTEXT,
  });
  useEffect(() => {
    setOptions((previous) => ({ ...previous, ...limits }));
  }, [
    limits?.recentSeconds,
    limits?.transcriptChars,
    limits?.totalChars,
    limits?.imageBytes,
  ]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const operation = useRef(false);
  const reviewPanel = useRef<HTMLDivElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  useEffect(() => {
    const off = window.everyhint.onTranscription((value) =>
      setEvents(value.events),
    );
    void window.everyhint.getTranscription().then((result) => {
      if (result.ok) setEvents(result.value.events);
    });
    return off;
  }, []);
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
    if (snapshot?.review)
      requestAnimationFrame(() => {
        reviewPanel.current?.scrollIntoView({ block: "nearest" });
        reviewPanel.current?.focus();
      });
  }, [snapshot?.review?.requestId]);
  useEffect(() => {
    setQuestion("");
    setOptions({ ...DEFAULT_CONTEXT, ...limits });
    setKnowledgeIds([]);
    setWorkspaceSelection(emptyWorkspaceSelection());
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
  function askConversation(): Promise<void> {
    return run(async () => {
      unwrap(await window.everyhint.listen.ask({ question }));
      setQuestion("");
    });
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
        await window.everyhint.reviewContext({
          question,
          options,
          knowledgeIds,
          ...(workspaceSelection.eventId ||
          workspaceSelection.personIds.length ||
          workspaceSelection.memoryIds.length ||
          workspaceSelection.meetingIds.length
            ? { workspaceSelection }
            : {}),
        }),
      );
    });
  }
  function removeContext(
    reviewId: string,
    kind: "transcripts" | "history" | "screenshot" | "workspace" | "knowledge",
    index: number,
  ): void {
    setAcknowledged(false);
    void run(async () =>
      unwrap(await window.everyhint.removeContext({ reviewId, kind, index })),
    );
  }
  useEffect(() =>
    window.everyhint.onAssist(() => {
      if (
        question.trim() ||
        options.screenshot ||
        options.microphone ||
        options.systemAudio ||
        snapshot?.responses.length
      )
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
  return (
    <section
      className={`assistant-panel panel-stack ${listen?.managed && !attachOpen ? "live-conversation" : ""}`}
      aria-label="EveryHint assistant"
    >
      <p className="listening-status" role="status">
        {listen?.managed
          ? listen.phase === "listening"
            ? "Listening"
            : listen.phase === "paused"
              ? "Paused"
              : listen.phase === "transcription-paused"
                ? "Transcription paused · capture on"
                : listen.phase === "error"
                  ? "Listening error"
                  : "Starting local transcription…"
          : capture.state === "ACTIVE"
            ? "Session active"
            : "Idle"}
        {listen?.managed && (
          <> · {answerShortcut.replaceAll("Control", "Ctrl")} to answer</>
        )}
      </p>
      <div className="chat-toolbar">
        <ModeSelector />
        {listen?.managed && (
          <button
            className="text-button"
            onClick={() => void window.everyhint.window("hide")}
          >
            Hide
          </button>
        )}
        <details>
          <summary aria-label="Conversation menu">•••</summary>
          <div className="menu-popover">
            <button
              className="secondary"
              onClick={() => {
                setQuestion("");
                invalidate();
                void run(async () =>
                  unwrap(await window.everyhint.assistant("clear")),
                );
              }}
            >
              Clear conversation
            </button>
            <details>
              <summary>Conversation privacy</summary>
              <p>
                {listen?.managed
                  ? "Ask uses this session's approved recent conversation and screen. View Context shows the last request. Extra attachments use their own review."
                  : "Follow-ups use selected previous text. Select screen and transcript context again for a new request."}
              </p>
              <p>
                Conversation memory expires after 15 minutes. Clear cancels the
                request and removes local conversation memory; it cannot delete
                provider records or recall shared text.
              </p>
            </details>
          </div>
        </details>
      </div>
      {selected.id === "codex" && !selected.ready && (
        <button className="text-button chat-connect" onClick={connect}>
          {selected.auth === "chatgpt"
            ? "Finish model setup"
            : "Connect ChatGPT"}
        </button>
      )}
      <div
        className="ai-responses"
        aria-label="Assistant responses"
        aria-live="polite"
      >
        {!snapshot.responses.length && (
          <p className="muted">Your next answer will appear here.</p>
        )}
        {(listen?.managed &&
        !attachOpen &&
        new URLSearchParams(location.search).get("overlay") === "1"
          ? snapshot.responses.slice(-1)
          : snapshot.responses
        ).map((response) => (
          <article className="ai-response" key={response.requestId}>
            <strong>{response.question || "Help with selected context"}</strong>
            <small>
              {response.provider === "codex" ? "ChatGPT" : "Claude"} ·{" "}
              {labels[response.status]}
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
            {response.workspaceContext && (
              <WorkspaceSources context={response.workspaceContext} />
            )}
            {response.knowledge && (
              <KnowledgeSources
                sources={response.knowledge}
                answer={response.text}
              />
            )}
            {response.error && (
              <p className="error-message" role="alert">
                {response.error.message}
              </p>
            )}
            <details className="response-diagnostics">
              <summary>Response details</summary>
              <small>
                {response.model ? `Model ${response.model} · ` : ""}
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
            </details>
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
            {response === latest &&
              !active &&
              (!listen?.managed || attachOpen) && (
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
                        setOptions(nextOptions);
                        setAcknowledged(false);
                        unwrap(
                          await window.everyhint.reviewContext({
                            question: response.question,
                            options: nextOptions,
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
      <label className="ai-question">
        {listen?.managed
          ? "Ask about this conversation"
          : latest
            ? "Question or follow-up (optional)"
            : "Your question (optional)"}
        <div className="composer-row">
          <textarea
            aria-label="Your question"
            value={question}
            rows={2}
            maxLength={6000}
            disabled={active || busy}
            placeholder="Ask EveryHint…"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (listen?.managed && !attachOpen) void askConversation();
                else void prepareReview();
              }
            }}
            onChange={(event) => {
              invalidate();
              setQuestion(event.target.value);
            }}
          />
          {listen?.managed && !attachOpen && (
            <button
              className="primary"
              disabled={busy && !active}
              onClick={() => {
                if (active)
                  void run(async () =>
                    unwrap(await window.everyhint.assistant("cancel")),
                  );
                else void askConversation();
              }}
            >
              {active ? "Cancel request" : "Ask"}
            </button>
          )}
        </div>
      </label>
      <ListenControls capture={capture} listen={listen} />
      <details
        className="attach-context"
        open={attachOpen}
        onToggle={(event) => setAttachOpen(event.currentTarget.open)}
      >
        <summary>Attach Context</summary>
        <fieldset className="ai-context" disabled={active || busy}>
          <legend>Available sources</legend>
          <div className="ai-choices">
            {capture.source && <small>{sourceName}</small>}
            {(
              [
                ["microphone", "Recent microphone transcript"],
                ["systemAudio", "Recent system-audio transcript"],
                ["screenshot", "Fresh authorised screenshot"],
                ["history", "Previous question and answer text"],
              ] as const
            )
              .filter(([key]) =>
                key === "screenshot"
                  ? capture.state === "ACTIVE" &&
                    capture.consent?.screen &&
                    selected.capabilities.images
                  : key === "history"
                    ? snapshot.responses.some((r) => r.status === "completed")
                    : events.some(
                        (event) =>
                          event.state === "final" &&
                          event.sessionId === capture.sessionId &&
                          event.source === key,
                      ),
              )
              .map(([key, label]) => (
                <label className="ai-choice" key={key}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    disabled={
                      key === "screenshot" && !selected.capabilities.images
                    }
                    onChange={(event) =>
                      changeOption(key, event.target.checked)
                    }
                  />
                  {label}
                </label>
              ))}
          </div>
        </fieldset>
        {personal?.unlocked && (
          <fieldset disabled={busy || active}>
            <legend>Knowledge for this request</legend>
            <p>
              Only relevant excerpts from checked, enabled documents associated
              with the active AI mode are retrieved. Review the exact text
              before Ask.
            </p>
            {personal.documents
              .filter(
                (d) =>
                  d.enabled &&
                  personal.config.modes
                    .find((m) => m.id === personal.config.activeModeId)
                    ?.knowledgeIds.includes(d.id),
              )
              .map((doc) => (
                <label className="ai-choice" key={doc.id}>
                  <input
                    type="checkbox"
                    checked={knowledgeIds.includes(doc.id)}
                    onChange={(e) => {
                      invalidate();
                      setKnowledgeIds((old) =>
                        e.target.checked
                          ? [...old, doc.id]
                          : old.filter((id) => id !== doc.id),
                      );
                    }}
                  />
                  {doc.name}
                </label>
              ))}
          </fieldset>
        )}
      </details>
      <div className="ai-actions">
        <button
          className="secondary"
          disabled={busy || active}
          hidden={!!listen?.managed && !attachOpen}
          onClick={() =>
            void (listen?.managed && !attachOpen
              ? askConversation()
              : prepareReview())
          }
        >
          {listen?.managed && !attachOpen ? "Ask" : "Review & send"}
        </button>
        {active && (!listen?.managed || attachOpen) && (
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
      {attachOpen && workspace?.unlocked && (
        <details>
          <summary>Optional Calendar, People and memory context</summary>
          <WorkspaceChoices
            key={workspace.scopeId}
            state={workspace}
            value={workspaceSelection}
            change={(v) => {
              invalidate();
              setWorkspaceSelection(v);
            }}
          />
          <button
            onClick={() =>
              void run(async () => {
                await workspaceCommand(workspace, "stage-live-context", {
                  ...workspaceSelection,
                  purpose: "live",
                });
                invalidate();
              })
            }
          >
            Review chosen sources for optional Live sharing
          </button>
          <button
            onClick={() =>
              void run(() => workspaceCommand(workspace, "clear-live-context"))
            }
          >
            Clear staged Live context
          </button>
          <p>
            Live needs its own session permission after staging these exact
            sources.
          </p>
        </details>
      )}
      {review && (
        <div
          className="context-review review-sheet"
          aria-label="Context review"
          role="region"
          tabIndex={-1}
          ref={reviewPanel}
        >
          <strong>
            Send to {review.provider === "codex" ? "ChatGPT" : "Claude"}
            {review.model ? ` · ${review.model}` : ""}
          </strong>
          <small>
            {review.modeContext?.mode.name ??
              ASSIST_PRESETS[review.preset ?? "general"].name}
            {review.action ? ` · ${ACTION_LABELS[review.action]}` : ""}
            {review.sourceName ? ` · ${review.sourceName}` : ""}
          </small>
          <p className="review-question">
            {review.question || "Help with selected context"}
          </p>
          <small>
            Review expires {new Date(review.expiresAt).toLocaleTimeString()}
          </small>
          {review.notices.map((notice) => (
            <p className="muted" key={notice}>
              {notice}
            </p>
          ))}
          {review.knowledge && <KnowledgeSources sources={review.knowledge} />}
          {review.workspaceContext && (
            <WorkspaceSources
              context={review.workspaceContext}
              remove={(index) =>
                removeContext(review.requestId, "workspace", index)
              }
            />
          )}
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
          <details>
            <summary>Review message and selected context</summary>
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
    </section>
  );
}
export function KnowledgeSources({
  sources,
  answer,
}: {
  sources: import("../../shared/knowledge").KnowledgeExcerpt[];
  answer?: string;
}) {
  const unknown =
    answer
      ?.match(/\[K:[^\]\r\n]{1,180}\]/g)
      ?.filter((ref) => !sources.some((s) => `[${s.ref}]` === ref)) ?? [];
  return (
    <details className="card" open={answer === undefined}>
      <summary>
        {answer === undefined
          ? "Knowledge excerpts to be sent"
          : "Knowledge excerpts sent · verify generated claims"}{" "}
        ({sources.length})
      </summary>
      <p className="muted">
        A citation identifies a supplied excerpt. It does not establish that
        every generated claim is supported. Compare claims with the exact text.
      </p>
      {unknown.length > 0 && (
        <p className="warning-message">
          The response contains an unavailable knowledge reference. Treat that
          citation as unsupported.
        </p>
      )}
      {sources.map((source) => (
        <article key={source.ref}>
          <strong>
            {source.documentName} · {source.heading}
            {source.page === null ? "" : ` · Page ${source.page}`}
          </strong>
          <small>
            {" "}
            [{source.ref}]
            {answer?.includes(`[${source.ref}]`) ? " · Cited in response" : ""}
          </small>
          <blockquote>{source.text}</blockquote>
        </article>
      ))}
    </details>
  );
}
