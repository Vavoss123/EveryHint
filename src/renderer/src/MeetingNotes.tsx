import { useEffect, useRef, useState } from "react";
import type {
  EvidenceText,
  MeetingDocument,
  MeetingState,
} from "../../shared/meetings";
import type { AssistantSnapshot } from "../../shared/ai";
import { ResponseText } from "./ResponseText";
import { meetingResult, meetingScope } from "./useMeetings";

type NotesDoc = Pick<MeetingDocument, "summary" | "decisions" | "actions">;
type Item = EvidenceText & { owner?: string | null; deadline?: string | null };
const DEFAULT_SECTIONS = [
  ["Topics", "topics"],
  ["Key points", "points"],
  ["Decisions", "decisions"],
  ["Action items", "actions"],
  ["Open questions", "outstanding"],
  ["Next steps", "nextSteps"],
] as const;
function items(doc: NotesDoc, source: string): Item[] {
  if (source === "actions") return doc.actions;
  if (source === "decisions") return doc.decisions;
  if (source === "overview") return [];
  return (
    (doc.summary?.[
      source as "topics" | "points" | "outstanding" | "nextSteps"
    ] as Item[] | undefined) ?? []
  );
}
function sections(doc: NotesDoc): [string, Item[]][] {
  const layout = doc.summary?.template
    ? doc.summary.template.sections.map((s) => [s.heading, s.source] as const)
    : DEFAULT_SECTIONS;
  return layout
    .filter(([, source]) => source !== "overview")
    .map(([title, source]) => [title, items(doc, source)] as [string, Item[]])
    .filter(([, list]) => list.length > 0);
}
export function hasNotes(doc: NotesDoc): boolean {
  return Boolean(doc.summary?.overview) || sections(doc).length > 0;
}
/** The notes as Markdown, for copying elsewhere. */
export function notesMarkdown(doc: NotesDoc & { title: string }): string {
  const lines = [`# ${doc.title}`];
  if (doc.summary?.overview) lines.push("", doc.summary.overview.text);
  for (const [title, list] of sections(doc))
    lines.push(
      "",
      `## ${title}`,
      ...list.map(
        (item) =>
          `- ${item.text}${[item.owner, item.deadline].some(Boolean) ? ` (${[item.owner, item.deadline].filter(Boolean).join(", ")})` : ""}`,
      ),
    );
  return lines.join("\n");
}
/** AI notes as a readable page: overview, then short bulleted sections. */
export function NotesView({
  doc,
  open,
}: {
  doc: NotesDoc;
  open: (ref: string) => void;
}) {
  if (!hasNotes(doc))
    return (
      <p className="muted">
        No notes yet. They are written when a session saved with notes ends, or
        you can ask for them below.
      </p>
    );
  return (
    <article className="meeting-notes" aria-label="Meeting notes">
      {doc.summary?.overview && (
        <p className="notes-overview">{doc.summary.overview.text}</p>
      )}
      {sections(doc).map(([title, list]) => (
        <section key={title}>
          <h3>{title}</h3>
          <ul>
            {list.map((item, index) => (
              <li key={index}>
                <span>{item.text}</span>
                {(item.owner || item.deadline) && (
                  <span className="note-meta">
                    {[item.owner, item.deadline].filter(Boolean).join(" · ")}
                  </span>
                )}
                {item.uncertainty === "uncertain" && (
                  <span className="note-tag">proposed</span>
                )}
                {item.authorship === "user" && (
                  <span className="note-tag">edited</span>
                )}
                {item.evidence[0] && (
                  <button
                    className="note-source"
                    title={`“${item.evidence[0].quote}”`}
                    aria-label="Show in transcript"
                    onClick={() => open(item.evidence[0]!.ref)}
                  >
                    ↗
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <small className="muted">
        AI notes
        {doc.summary?.model ? ` · ${doc.summary.model}` : ""} · can contain
        mistakes; ↗ shows the moment in the transcript.
      </small>
    </article>
  );
}
const SUGGESTIONS = [
  "What were the key takeaways?",
  "What are the action items and who owns them?",
  "Draft a follow-up email",
  "What questions are still open?",
];
interface Turn {
  question: string;
  answer: string;
  failed?: boolean;
}
/** "Ask about this meeting": instant answers that remember the chat. */
export function MeetingChat({
  state,
  document,
  assistant,
}: {
  state: MeetingState;
  document: MeetingDocument;
  assistant: AssistantSnapshot | null;
}) {
  const [turns, setTurns] = useState<Turn[]>([]),
    [question, setQuestion] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTurns([]);
    setPending(null);
    setQuestion("");
  }, [document.id]);
  const streaming = pending
    ? (assistant?.responses
        .filter(
          (r) =>
            r.meetingPurpose === "ask" &&
            ["sending", "generating"].includes(r.status),
        )
        .at(-1)?.text ?? "")
    : "";
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending, streaming]);
  async function ask(text: string): Promise<void> {
    const asked = text.trim();
    if (!asked || pending) return;
    setQuestion("");
    setPending(asked);
    const history = turns
      .filter((turn) => !turn.failed)
      .map(({ question, answer }) => ({ question, answer }));
    try {
      const answer = meetingResult(
        await window.everyhint.meetings.chat(
          meetingScope(state, { id: document.id, question: asked, history }),
        ),
      );
      setTurns((old) => [...old, { question: asked, answer }]);
    } catch (error) {
      setTurns((old) => [
        ...old,
        {
          question: asked,
          answer:
            error instanceof Error ? error.message : "The AI could not answer.",
          failed: true,
        },
      ]);
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="meeting-chat" aria-label="Ask about this meeting">
      <h2>Ask about this meeting</h2>
      <div className="chat-log">
        {turns.map((turn, index) => (
          <div className="chat-turn" key={index}>
            <p className="chat-question">{turn.question}</p>
            {turn.failed ? (
              <p className="error-message" role="alert">
                {turn.answer}
              </p>
            ) : (
              <div className="chat-answer">
                <ResponseText text={turn.answer} />
                <button
                  className="text-button"
                  onClick={() =>
                    void window.everyhint.copyResponse(turn.answer).then(() => {
                      setCopied(index);
                      setTimeout(() => setCopied(null), 1500);
                    })
                  }
                >
                  {copied === index ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="chat-turn">
            <p className="chat-question">{pending}</p>
            <div className="chat-answer" role="status">
              {streaming ? (
                <ResponseText text={streaming} />
              ) : (
                <p className="muted">Thinking…</p>
              )}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {!turns.length && !pending && (
        <div
          className="chat-suggestions"
          role="group"
          aria-label="Suggested questions"
        >
          {SUGGESTIONS.map((text) => (
            <button key={text} onClick={() => void ask(text)}>
              {text}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          aria-label="Question about this meeting"
          placeholder="Ask anything about this meeting…"
          rows={2}
          maxLength={2000}
          value={question}
          disabled={!!pending}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void ask(question);
            }
          }}
        />
        {pending ? (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void window.everyhint.meetings.cancelChat(
                meetingScope(state, undefined),
              )
            }
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!question.trim()}>
            Ask
          </button>
        )}
      </form>
    </section>
  );
}
