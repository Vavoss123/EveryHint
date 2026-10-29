import { useEffect, useRef, useState } from "react";
import type { AppSnapshot, Result } from "../../shared/contracts";
import type { ContextReview } from "../../shared/ai";
import { useAssistantSnapshot } from "./useAssistantSnapshot";
import { useListen } from "./useListen";
import { usePersonal, personalCommand } from "./PersonalState";
import { ResponseText } from "./ResponseText";
import "./overlay.css";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function FloatingAssistant() {
  const [app, setApp] = useState<AppSnapshot | null>(null);
  const assistant = useAssistantSnapshot(),
    listen = useListen(),
    personal = usePersonal();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false),
    [context, setContext] = useState<ContextReview | null>(null),
    [view, setView] = useState(false);
  const operation = useRef(false),
    composer = useRef<HTMLTextAreaElement>(null),
    menuButton = useRef<HTMLButtonElement>(null),
    menuPanel = useRef<HTMLDivElement>(null),
    answerArea = useRef<HTMLElement>(null);
  const followAnswer = useRef(true);
  const latest = assistant?.responses.at(-1);
  const generating =
    latest?.status === "sending" || latest?.status === "generating";
  useEffect(() => {
    let alive = true;
    const accept = (next: AppSnapshot) => {
      if (alive)
        setApp((old) => (!old || next.revision >= old.revision ? next : old));
    };
    const off = window.everyhint.onSnapshot(accept);
    void window.everyhint.getSnapshot().then((result) => {
      if (result.ok) accept(result.value);
    });
    document.title = "EveryHint Assistant";
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = app?.settings.theme ?? "dark";
  }, [app?.settings.theme]);
  useEffect(() => {
    setQuestion("");
    setError(null);
    setContext(null);
    setView(false);
  }, [assistant?.sessionId]);
  useEffect(() => {
    setView(false);
    followAnswer.current = true;
  }, [latest?.requestId]);
  useEffect(() => {
    if (!listen?.sharing || app?.session.state !== "ACTIVE") {
      setContext(null);
      setView(false);
    }
  }, [listen?.sharing, app?.session.state]);
  useEffect(() => {
    if (!view && followAnswer.current && answerArea.current)
      answerArea.current.scrollTop = answerArea.current.scrollHeight;
  }, [latest?.text, latest?.requestId, view]);
  useEffect(
    () => window.everyhint.onAssist(() => composer.current?.focus()),
    [],
  );
  useEffect(() => {
    const focus = () => {
      if (!generating) composer.current?.focus();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [generating]);
  useEffect(() => {
    if (menu)
      menuPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => {
      if (
        menu &&
        !menuPanel.current?.contains(event.target as Node) &&
        !menuButton.current?.contains(event.target as Node)
      )
        setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  async function run(task: () => Promise<unknown>): Promise<void> {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "EveryHint could not complete that action.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function interrupt(task: () => Promise<unknown>): void {
    // Pause, Stop, cancellation and revocation must bypass a pending Ask or
    // settings operation, including slow model-readiness/preparation work.
    void task().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not stop that work."),
    );
  }
  function hide(): void {
    setMenu(false);
    void window.everyhint.window("hide");
  }
  function ask(): void {
    void run(async () => {
      unwrap(await window.everyhint.listen.ask({ question }));
      setQuestion("");
      setView(false);
    });
  }
  function openDashboard(account = false): void {
    setMenu(false);
    void run(async () =>
      unwrap(await window.everyhint.window(account ? "account" : "dashboard")),
    );
  }
  const state = app?.session.state ?? "IDLE";
  const active = state === "ACTIVE",
    paused = state === "PAUSED";
  const status = paused
    ? "Paused"
    : state === "ERROR" || listen?.phase === "error"
      ? "Capture error"
      : listen?.phase === "transcription-paused"
        ? "Transcription paused"
        : active
          ? listen?.phase === "starting"
            ? "Starting…"
            : listen?.managed
              ? "Listening"
              : "Capture active"
          : "Idle";
  const selected = assistant?.providers.find(
    (p) => p.id === assistant.selected,
  );
  const selectedMode = personal?.config.modes.find(
    (m) => m.id === personal.config.activeModeId,
  );
  const contextAvailable = !!listen?.managed;
  return (
    <main
      className="floating-assistant"
      aria-label="EveryHint assistant"
      onKeyDown={(event) => {
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          event.target instanceof HTMLSelectElement
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (menu) {
          setMenu(false);
          menuButton.current?.focus();
        } else if (view) setView(false);
        else hide();
      }}
    >
      <header className="overlay-header">
        <div className="overlay-topline">
          <span
            className="overlay-logo"
            title="EveryHint"
            aria-label="EveryHint"
          >
            e
          </span>
          <select
            aria-label="Active AI mode"
            title={selectedMode?.name ?? "AI mode"}
            value={personal?.config.activeModeId ?? ""}
            disabled={!personal || busy}
            onChange={(event) => {
              const id = event.target.value;
              void run(async () => {
                if (personal)
                  await personalCommand(personal, { type: "select", id });
              });
            }}
          >
            {personal ? (
              personal.config.modes.map((mode) => (
                <option value={mode.id} key={mode.id}>
                  {mode.name}
                </option>
              ))
            ) : (
              <option value="">EveryHint</option>
            )}
          </select>
          <button className="overlay-hide" onClick={hide}>
            Hide
          </button>
          <button
            className="overlay-menu-toggle"
            ref={menuButton}
            aria-label="Assistant menu"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            •••
          </button>
        </div>
        <div className="overlay-status-row">
          <span
            className={`overlay-listening ${active ? "is-listening" : ""}`}
            role="status"
          >
            <span aria-hidden="true">●</span> {status}
          </span>
          {generating && (
            <span className="overlay-generating">
              {latest?.status === "sending" ? "Sending…" : "Answering…"}
            </span>
          )}
          <div className="overlay-session-actions">
            {(active || paused) && (
              <>
                <button
                  onClick={() =>
                    interrupt(async () =>
                      unwrap(
                        await window.everyhint.session(
                          paused ? "resume" : "pause",
                        ),
                      ),
                    )
                  }
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  className="overlay-stop"
                  onClick={() =>
                    interrupt(async () =>
                      unwrap(await window.everyhint.session("stop")),
                    )
                  }
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
        {menu && (
          <div
            className="overlay-menu"
            ref={menuPanel}
            role="menu"
            aria-label="Assistant actions"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              const i = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              items[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (i +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }}
          >
            <button role="menuitem" onClick={() => openDashboard()}>
              Open EveryHint
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void run(async () => {
                  setContext(unwrap(await window.everyhint.listen.context()));
                  setView(true);
                });
              }}
            >
              View Context
            </button>
            {generating && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  interrupt(async () =>
                    unwrap(await window.everyhint.assistant("cancel")),
                  );
                }}
              >
                Cancel answer
              </button>
            )}
            {latest?.text && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  void run(async () =>
                    unwrap(await window.everyhint.copyResponse(latest.text)),
                  );
                }}
              >
                Copy answer
              </button>
            )}
            {listen?.sharing && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  interrupt(async () =>
                    unwrap(await window.everyhint.listen.revoke()),
                  );
                }}
              >
                Revoke sharing
              </button>
            )}
            <button role="menuitem" onClick={() => openDashboard()}>
              Permissions and session options
            </button>
            <button
              role="menuitemcheckbox"
              aria-checked={app?.settings.alwaysOnTop ?? false}
              onClick={() =>
                void run(async () => {
                  if (app)
                    unwrap(
                      await window.everyhint.saveSettings({
                        ...app.settings,
                        alwaysOnTop: !app.settings.alwaysOnTop,
                      }),
                    );
                })
              }
            >
              {app?.settings.alwaysOnTop
                ? "Unpin assistant"
                : "Pin assistant on top"}
            </button>
            <p
              className="overlay-protection"
              aria-label={`Window protection: ${app?.privacy?.state ?? "off"}`}
            >
              {app?.privacy?.state === "configured"
                ? "Window protection configured"
                : "Window protection off or not confirmed"}
              . Hiding is separate from capture exclusion; receiving-app checks
              remain required.
            </p>
          </div>
        )}
      </header>
      <section
        className="overlay-answer"
        aria-label={view ? "Last request context" : "Assistant responses"}
        tabIndex={0}
        ref={answerArea}
        onScroll={(event) => {
          const area = event.currentTarget;
          followAnswer.current =
            area.scrollHeight - area.scrollTop - area.clientHeight < 48;
        }}
      >
        {error && (
          <p className="overlay-error" role="alert">
            {error}
          </p>
        )}
        {view ? (
          <>
            <button className="overlay-back" onClick={() => setView(false)}>
              Back to answer
            </button>
            <h1>Last request context</h1>
            <p>Exact approved context for the last conversation request.</p>
            {context ? (
              <>
                <p>{context.question || "Conversation guidance"}</p>
                {context.transcripts.map((line, i) => (
                  <p key={i}>
                    <strong>
                      {line.source === "microphone"
                        ? "Microphone"
                        : "System audio"}
                    </strong>{" "}
                    · {new Date(line.startMs).toLocaleTimeString()}
                    <br />
                    {line.text}
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
              </>
            ) : (
              <p>No conversation context has been sent in this session.</p>
            )}
          </>
        ) : (
          <>
            {listen?.message && (
              <p className="overlay-guidance" role="status">
                {listen.message}
              </p>
            )}
            {latest ? (
              <article className="ai-response" aria-label="Latest AI answer">
                <ResponseText text={latest.text} />
                {latest.error && (
                  <p className="overlay-error" role="alert">
                    {latest.error.message}
                  </p>
                )}
                {!latest.text && !latest.error && (
                  <p>
                    {generating
                      ? "Preparing your answer…"
                      : "Your next answer will appear here."}
                  </p>
                )}
              </article>
            ) : (
              <div className="overlay-empty">
                <h1>
                  {active
                    ? "Ready when you need help."
                    : "Your assistant is ready."}
                </h1>
                <p>
                  {active
                    ? "Press Answer from conversation or type a question below."
                    : "Start EveryHint from the dashboard to listen locally."}
                </p>
              </div>
            )}
            {!contextAvailable && (
              <button className="overlay-link" onClick={() => openDashboard()}>
                Open EveryHint to start
              </button>
            )}
            {active && !listen?.sharing && (
              <button className="overlay-link" onClick={() => openDashboard()}>
                Allow context in EveryHint
              </button>
            )}
            {selected && !selected.ready && (
              <button
                className="overlay-link"
                onClick={() => openDashboard(true)}
              >
                {selected.auth === "missing"
                  ? "Connect ChatGPT"
                  : "Open Account & AI"}
              </button>
            )}
          </>
        )}
      </section>
      <form
        className="overlay-composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <label htmlFor="overlay-question">Ask EveryHint</label>
        <div className="overlay-input-row">
          <textarea
            id="overlay-question"
            ref={composer}
            aria-label="Your question"
            placeholder="Type help, or ask a question…"
            value={question}
            maxLength={6000}
            rows={2}
            disabled={busy || generating}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!busy && !generating) ask();
              }
            }}
          />
          {generating ? (
            <button
              type="button"
              className="overlay-send"
              onClick={() =>
                interrupt(async () =>
                  unwrap(await window.everyhint.assistant("cancel")),
                )
              }
            >
              Cancel
            </button>
          ) : (
            <button type="submit" className="overlay-send" disabled={busy}>
              Ask
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
