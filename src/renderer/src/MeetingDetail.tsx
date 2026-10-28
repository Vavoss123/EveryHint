import { useEffect, useMemo, useState } from "react";
import type {
  MeetingDocument,
  MeetingSegment,
  MeetingState,
  TranscriptPage,
} from "../../shared/meetings";
import type { MeetingAIState } from "../../shared/meeting-ai";
import type { AssistantSnapshot } from "../../shared/ai";
import type {
  MeetingEdit,
  UserActionEdit,
  UserDecisionEdit,
} from "../../shared/meeting-edits";
import {
  EvidenceItem,
  MeetingAIReview,
  TemplateSummary,
} from "./MeetingAIReview";
import { MeetingSharingPanel } from "./MeetingSharing";
import { meetingResult, meetingScope } from "./useMeetings";

type Tab = "overview" | "transcript" | "notes" | "ai";
interface Editor {
  title: string;
  notes: string;
  tags: string;
  overview: string;
  topics: string;
  points: string;
  outstanding: string;
  nextSteps: string;
  actions: UserActionEdit[];
  decisions: UserDecisionEdit[];
}
function editorFor(doc: MeetingDocument): Editor {
  return {
    title: doc.title,
    notes: doc.notes,
    tags: doc.tags.join(", "),
    overview: doc.summary?.overview?.text ?? "",
    topics: doc.summary?.topics.map((item) => item.text).join("\n") ?? "",
    points: doc.summary?.points.map((item) => item.text).join("\n") ?? "",
    outstanding:
      doc.summary?.outstanding.map((item) => item.text).join("\n") ?? "",
    nextSteps: doc.summary?.nextSteps.map((item) => item.text).join("\n") ?? "",
    actions: doc.actions.map(({ id, text, owner, deadline, status }) => ({
      id,
      text,
      owner,
      deadline,
      status,
    })),
    decisions: doc.decisions.map(({ id, text }) => ({ id, text })),
  };
}
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}
export function MeetingDetail({
  state,
  ai,
  assistant,
  document,
  initialPage,
  initialReference,
  onSaved,
  onBack,
  onOpen,
  prepareCapture,
  connection,
  onDirty,
}: {
  state: MeetingState;
  ai: MeetingAIState | null;
  assistant: AssistantSnapshot | null;
  document: MeetingDocument;
  initialPage: TranscriptPage;
  initialReference?: string;
  onSaved: (doc: MeetingDocument) => void;
  onBack: (deleted?: boolean) => void;
  onOpen: (id: string, ref?: string) => void;
  prepareCapture: () => void;
  connection: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview"),
    [editor, setEditor] = useState(() => editorFor(document)),
    [page, setPage] = useState(initialPage),
    [pageOffset, setPageOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [find, setFind] = useState(""),
    [findMode, setFindMode] = useState(false),
    [focus, setFocus] = useState<MeetingSegment | null>(null),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [deletion, setDeletion] = useState<
      "delete" | "clear-transcript" | "clear-generated"
    >("delete"),
    [deleteAck, setDeleteAck] = useState(false),
    [resumeAck, setResumeAck] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(editor) !== JSON.stringify(editorFor(document)),
    [editor, document],
  );
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    setEditor(editorFor(document));
    setPage(initialPage);
    setPageOffset(0);
    setSelected([]);
    setLabels({});
    setFindMode(false);
    setFocus(null);
    setDeleteAck(false);
    setResumeAck(false);
  }, [document.id, document.revision, initialPage]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Meeting action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openEvidence(ref: string) {
    const id = ref.split("/")[0];
    if (!id) return;
    if (id !== document.id) {
      onOpen(id, ref);
      return;
    }
    await run(async () => {
      setFocus(
        meetingResult(
          await window.everyhint.meetings.reference(
            meetingScope(state, { id, ref }),
          ),
        ),
      );
      setTab("transcript");
    });
  }
  useEffect(() => {
    if (initialReference) void openEvidence(initialReference);
  }, [initialReference, document.id]);
  async function save() {
    const lines = (value: string) =>
      value
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    const input: MeetingEdit = {
      id: document.id,
      expectedRevision: document.revision,
      title: editor.title,
      notes: editor.notes,
      tags: editor.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      overview: editor.overview,
      topics: lines(editor.topics),
      points: lines(editor.points),
      outstanding: lines(editor.outstanding),
      nextSteps: lines(editor.nextSteps),
      actions: editor.actions,
      decisions: editor.decisions,
    };
    await run(async () => {
      onSaved(
        meetingResult(
          await window.everyhint.meetings.edit(meetingScope(state, input)),
        ),
      );
    });
  }
  async function transcript(offset: number, search = false) {
    await run(async () => {
      const next = search
        ? meetingResult(
            await window.everyhint.meetings.findTranscript(
              meetingScope(state, { id: document.id, query: find, offset }),
            ),
          )
        : meetingResult(
            await window.everyhint.meetings.transcript(
              meetingScope(state, { id: document.id, offset }),
            ),
          );
      setPage(next);
      setPageOffset(offset);
      setFindMode(search);
      setFocus(null);
    });
  }
  function patch(value: Partial<Editor>) {
    setEditor((current) => ({ ...current, ...value }));
  }
  const transcriptCard = (segment: MeetingSegment, focused = false) => {
    const ref = `${segment.meetingId}/${segment.sessionId}/${segment.id}`;
    return (
      <article
        className={`review-item meeting-transcript ${focused ? "selected" : ""}`}
        key={ref}
      >
        <div className="section-heading">
          <small>
            {new Date(segment.startMs).toLocaleString()} ·{" "}
            {segment.source === "microphone"
              ? "Microphone"
              : "System audio · identity unknown"}{" "}
            · capture {segment.sessionId.slice(0, 8)}
          </small>
          <label className="ai-choice">
            <input
              type="checkbox"
              aria-label={`Select transcript ${segment.id} for meeting AI`}
              checked={selected.includes(ref)}
              disabled={!selected.includes(ref) && selected.length >= 100}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, ref]
                    : selected.filter((value) => value !== ref),
                )
              }
            />
            Use in AI
          </label>
        </div>
        <p>
          <Highlight text={segment.text} query={find} />
        </p>
        {segment.speakerLabel && (
          <small>User-provided speaker label: {segment.speakerLabel}</small>
        )}
        <details>
          <summary>Correct speaker label</summary>
          <label>
            Your label
            <input
              aria-label={`Speaker label ${segment.id}`}
              maxLength={80}
              value={labels[ref] ?? segment.speakerLabel ?? ""}
              onChange={(event) =>
                setLabels({ ...labels, [ref]: event.target.value })
              }
            />
          </label>
          <small>
            Only your supplied label is saved; no speaker identity is inferred.
          </small>
          <button
            className="secondary"
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                const updated = meetingResult(
                  await window.everyhint.meetings.speakerLabels(
                    meetingScope(state, {
                      id: document.id,
                      expectedRevision: document.revision,
                      labels: [
                        {
                          ref,
                          label: labels[ref] ?? segment.speakerLabel ?? "",
                        },
                      ],
                    }),
                  ),
                );
                onSaved(updated);
              })
            }
          >
            Save speaker label
          </button>
        </details>
      </article>
    );
  };
  return (
    <section
      className="meeting-detail panel-stack"
      aria-label="Saved meeting detail"
    >
      <div className="section-heading">
        <button className="secondary" onClick={() => onBack()}>
          Back to history
        </button>
        <button className="secondary" onClick={() => setTab("notes")}>
          Rename or edit
        </button>
        <button
          className="secondary"
          disabled={dirty || busy}
          onClick={() => onOpen(document.id)}
        >
          Reload saved meeting
        </button>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SAVED LOCALLY · {document.status}</p>
          <h1>{document.title}</h1>
        </div>
      </div>
      <p className="muted">
        Started{" "}
        {new Date(document.startedAt ?? document.createdAt).toLocaleString()} ·{" "}
        {Math.round(document.durationMs / 60000)} min · {document.segmentCount}{" "}
        final segments · updated {new Date(document.updatedAt).toLocaleString()}
      </p>
      <small>
        Saved {new Date(document.createdAt).toLocaleString()} ·{" "}
        {document.runs.length} separate capture segment(s) · tags:{" "}
        {document.tags.join(", ") || "None"}
      </small>
      {dirty && (
        <div className="warning" role="status">
          You have unsaved edits. Save or revert them before
          regenerating/applying AI or deleting content.
        </div>
      )}
      <div
        role="tablist"
        aria-label="Meeting detail sections"
        className="meeting-tabs"
      >
        {(["overview", "transcript", "notes", "ai"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            id={`meeting-tab-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            aria-controls={`meeting-panel-${value}`}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const tabs = ["overview", "transcript", "notes", "ai"] as const,
                index = tabs.indexOf(value),
                next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
              if (next === null) return;
              event.preventDefault();
              setTab(tabs[next]!);
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons?.[next]?.focus();
            }}
          >
            {value === "ai" ? "AI" : value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`meeting-panel-${tab}`}
        aria-labelledby={`meeting-tab-${tab}`}
        className="panel-stack"
      >
        {tab === "overview" && (
          <>
            {document.summary?.template && (
              <TemplateSummary
                doc={document}
                open={(ref) => void openEvidence(ref)}
              />
            )}
            <div hidden={Boolean(document.summary?.template)}>
              <h2>Overview</h2>
              {document.summary?.overview ? (
                <EvidenceItem
                  item={document.summary.overview}
                  open={(ref) => void openEvidence(ref)}
                />
              ) : (
                <p className="muted">
                  No summary has been saved. Generate a reviewed draft in AI, or
                  write your own notes.
                </p>
              )}
              {(["topics", "points", "outstanding", "nextSteps"] as const).map(
                (section) =>
                  document.summary?.[section].length ? (
                    <section key={section}>
                      <h3>
                        {
                          {
                            topics: "Main topics",
                            points: "Important points",
                            outstanding: "Outstanding questions",
                            nextSteps: "Suggested next steps",
                          }[section]
                        }
                      </h3>
                      {document.summary[section].map((item, index) => (
                        <EvidenceItem
                          key={index}
                          item={item}
                          open={(ref) => void openEvidence(ref)}
                        />
                      ))}
                    </section>
                  ) : null,
              )}
              <h2>Decisions</h2>
              {document.decisions.length ? (
                document.decisions.map((item) => (
                  <EvidenceItem
                    key={item.id}
                    item={item}
                    open={(ref) => void openEvidence(ref)}
                  />
                ))
              ) : (
                <p className="muted">No decisions saved.</p>
              )}
              <h2>Action items</h2>
              {document.actions.length ? (
                document.actions.map((item) => (
                  <article className="card panel-stack" key={item.id}>
                    <EvidenceItem
                      item={item}
                      open={(ref) => void openEvidence(ref)}
                    />
                    <small>
                      {item.owner ?? "Unassigned"} ·{" "}
                      {item.deadline ?? "Not specified"} ·{" "}
                      {item.status.replace("-", " ")}
                    </small>
                  </article>
                ))
              ) : (
                <p className="muted">No agreed action items saved.</p>
              )}
            </div>
            {(document.summaryVersions ?? []).map((version, index) => (
              <details key={`${version.savedAt}-${index}`}>
                <summary>
                  Previous saved summary ·{" "}
                  {new Date(version.savedAt).toLocaleString()}
                </summary>
                {version.summary.template ? (
                  <TemplateSummary
                    doc={version}
                    open={(ref) => void openEvidence(ref)}
                  />
                ) : (
                  <pre className="knowledge-text">
                    {JSON.stringify(version, null, 2)}
                  </pre>
                )}
              </details>
            ))}
            <h2>Manual notes</h2>
            <p className="meeting-plain">
              {document.notes || "No manual notes saved."}
            </p>
            <details>
              <summary>Capture segments and source metadata</summary>
              {document.runs.map((run) => (
                <p key={run.sessionId}>
                  {new Date(run.startedAt).toLocaleString()} –{" "}
                  {run.endedAt
                    ? new Date(run.endedAt).toLocaleString()
                    : "In progress"}{" "}
                  ·{" "}
                  {run.sources
                    .map((source) => `${source.kind}: ${source.name}`)
                    .join(" · ")}
                </p>
              ))}
            </details>
          </>
        )}
        {tab === "transcript" && (
          <>
            <h2>Transcript</h2>
            <label>
              Find in full transcript
              <input
                aria-label="Search within meeting transcript"
                maxLength={200}
                value={find}
                onChange={(event) => setFind(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="secondary"
                disabled={!find.trim() || busy}
                onClick={() => void transcript(0, true)}
              >
                Search transcript
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void transcript(0, false)}
              >
                Show first transcript page
              </button>
            </div>
            <small>
              Only final recognition text is stored. Microphone/system sources
              do not identify people. At most 100 segments per page or 30 search
              matches are shown.
            </small>
            {focus && (
              <section
                className="panel-stack"
                aria-label="Supporting transcript reference"
              >
                <h3>Selected supporting segment</h3>
                {transcriptCard(focus, true)}
              </section>
            )}
            {page.segments.map((segment) => transcriptCard(segment))}
            {!page.segments.length && (
              <p className="muted">
                {findMode && page.nextOffset !== null
                  ? "No matches in this scanned portion. Continue searching the remaining transcript."
                  : "No transcript segments match this view."}
              </p>
            )}
            <div className="button-row">
              {!findMode && pageOffset > 0 && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void transcript(Math.max(0, pageOffset - 100))}
                >
                  Previous transcript page
                </button>
              )}
              {page.nextOffset !== null && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void transcript(page.nextOffset!, findMode)}
                >
                  {findMode
                    ? "Continue transcript search"
                    : "Next transcript page"}
                </button>
              )}
            </div>
            {selected.length > 0 && (
              <>
                <p>
                  {selected.length} transcript reference(s) selected for AI.
                </p>
                <button className="secondary" onClick={() => setTab("ai")}>
                  Review AI using selected segments
                </button>
                <button className="text-button" onClick={() => setSelected([])}>
                  Clear transcript selection
                </button>
              </>
            )}
          </>
        )}
        {tab === "notes" && (
          <>
            <h2>Edit notes and meeting intelligence</h2>
            <label>
              Title
              <input
                aria-label="Meeting title"
                maxLength={200}
                value={editor.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <label>
              Tags (comma separated)
              <input
                aria-label="Meeting tags"
                maxLength={1000}
                value={editor.tags}
                onChange={(event) => patch({ tags: event.target.value })}
              />
            </label>
            <label>
              Manual notes
              <textarea
                aria-label="Manual meeting notes"
                rows={8}
                maxLength={40000}
                value={editor.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </label>
            <label>
              Summary overview
              <textarea
                aria-label="Edit meeting summary"
                rows={4}
                maxLength={4000}
                value={editor.overview}
                onChange={(event) => patch({ overview: event.target.value })}
              />
            </label>
            {(["topics", "points", "outstanding", "nextSteps"] as const).map(
              (field) => (
                <label key={field}>
                  {
                    {
                      topics: "Discussion topics",
                      points: "Important points",
                      outstanding: "Outstanding questions",
                      nextSteps: "Suggested next steps",
                    }[field]
                  }{" "}
                  · one item per line
                  <textarea
                    rows={3}
                    aria-label={`Edit meeting ${field}`}
                    value={editor[field]}
                    maxLength={30000}
                    onChange={(event) => patch({ [field]: event.target.value })}
                  />
                </label>
              ),
            )}
            <h3>Action items</h3>
            {editor.actions.map((item, index) => (
              <fieldset key={item.id ?? `new-${index}`}>
                <legend>Action {index + 1}</legend>
                <label>
                  Description
                  <input
                    value={item.text}
                    maxLength={2000}
                    onChange={(event) =>
                      patch({
                        actions: editor.actions.map((value, at) =>
                          at === index
                            ? { ...value, text: event.target.value }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Owner
                  <input
                    aria-label={`Action ${index + 1} owner`}
                    value={item.owner ?? ""}
                    maxLength={200}
                    placeholder="Unassigned"
                    onChange={(event) =>
                      patch({
                        actions: editor.actions.map((value, at) =>
                          at === index
                            ? { ...value, owner: event.target.value || null }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Deadline
                  <input
                    aria-label={`Action ${index + 1} deadline`}
                    value={item.deadline ?? ""}
                    maxLength={200}
                    placeholder="Not specified"
                    onChange={(event) =>
                      patch({
                        actions: editor.actions.map((value, at) =>
                          at === index
                            ? { ...value, deadline: event.target.value || null }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    aria-label={`Action ${index + 1} status`}
                    value={item.status}
                    onChange={(event) =>
                      patch({
                        actions: editor.actions.map((value, at) =>
                          at === index
                            ? {
                                ...value,
                                status: event.target
                                  .value as UserActionEdit["status"],
                              }
                            : value,
                        ),
                      })
                    }
                  >
                    <option value="open">Open</option>
                    <option value="in-progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    patch({
                      actions: editor.actions.filter((_, at) => at !== index),
                    })
                  }
                >
                  Remove action {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              className="secondary"
              disabled={editor.actions.length >= 100}
              onClick={() =>
                patch({
                  actions: [
                    ...editor.actions,
                    {
                      id: null,
                      text: "",
                      owner: null,
                      deadline: null,
                      status: "open",
                    },
                  ],
                })
              }
            >
              Add action item
            </button>
            <h3>Decisions</h3>
            {editor.decisions.map((item, index) => (
              <label key={item.id ?? `new-${index}`}>
                Decision {index + 1}
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={item.text}
                  onChange={(event) =>
                    patch({
                      decisions: editor.decisions.map((value, at) =>
                        at === index
                          ? { ...value, text: event.target.value }
                          : value,
                      ),
                    })
                  }
                />
                <button
                  className="text-button"
                  onClick={() =>
                    patch({
                      decisions: editor.decisions.filter(
                        (_, at) => at !== index,
                      ),
                    })
                  }
                >
                  Remove decision {index + 1}
                </button>
              </label>
            ))}
            <button
              className="secondary"
              disabled={editor.decisions.length >= 100}
              onClick={() =>
                patch({
                  decisions: [...editor.decisions, { id: null, text: "" }],
                })
              }
            >
              Add decision
            </button>
            <div className="button-row">
              <button
                className="primary"
                disabled={!dirty || busy}
                onClick={() => void save()}
              >
                Save meeting edits
              </button>
              <button
                className="secondary"
                disabled={!dirty || busy}
                onClick={() => {
                  setEditor(editorFor(document));
                  setError(null);
                }}
              >
                Revert unsaved edits
              </button>
            </div>
          </>
        )}
        {tab === "ai" && (
          <MeetingAIReview
            state={state}
            ai={ai}
            assistant={assistant}
            meetingIds={[document.id]}
            selectedRefs={selected}
            current={document}
            onSaved={onSaved}
            onEvidence={(ref) => void openEvidence(ref)}
            connection={connection}
            disabledReason={
              dirty
                ? "Save or revert your unsaved edits before generating or applying an AI draft."
                : undefined
            }
          />
        )}
      </div>
      <MeetingSharingPanel state={state} document={document} dirty={dirty} />
      <details className="card panel-stack">
        <summary>Continue this meeting with fresh capture</summary>
        <p>
          Resume reopens this saved context and arms one new capture segment. It
          does not turn on a microphone or screen; fresh source consent is
          required.
        </p>
        <label className="ai-choice">
          <input
            type="checkbox"
            aria-label="Acknowledge appending new capture to saved meeting"
            checked={resumeAck}
            onChange={(event) => setResumeAck(event.target.checked)}
          />
          I want a newly authorised capture segment appended to this meeting.
        </label>
        <button
          className="secondary"
          disabled={!resumeAck || busy || dirty}
          onClick={() =>
            void run(async () => {
              meetingResult(
                await window.everyhint.meetings.resume(
                  meetingScope(state, { id: document.id, acknowledged: true }),
                ),
              );
              setResumeAck(false);
              prepareCapture();
            })
          }
        >
          Prepare fresh capture for this meeting
        </button>
      </details>
      <details className="card panel-stack">
        <summary>Delete local content</summary>
        <p>
          Export first if needed. This affects locally managed data only;
          exported copies and provider retention are separate. Physical SSD
          erasure cannot be guaranteed.
        </p>
        <label>
          Action
          <select
            aria-label="Meeting deletion action"
            value={deletion}
            onChange={(event) => {
              setDeletion(event.target.value as typeof deletion);
              setDeleteAck(false);
            }}
          >
            <option value="delete">
              Delete this meeting and all associated local content
            </option>
            <option value="clear-transcript">
              Clear saved transcript and generated derivatives; keep manual
              notes
            </option>
            <option value="clear-generated">
              Clear AI-generated notes/items; preserve user-authored edits
            </option>
          </select>
        </label>
        <label className="ai-choice">
          <input
            type="checkbox"
            aria-label="Confirm selected meeting data deletion"
            checked={deleteAck}
            onChange={(event) => setDeleteAck(event.target.checked)}
          />
          I confirm this local deletion for {document.title}.
        </label>
        <button
          className="danger"
          disabled={!deleteAck || busy || dirty}
          onClick={() =>
            void run(async () => {
              meetingResult(
                await window.everyhint.meetings.operation(
                  meetingScope(state, {
                    id: document.id,
                    expectedRevision: document.revision,
                    action: deletion,
                    acknowledged: true,
                  }),
                ),
              );
              if (deletion === "delete") onBack(true);
              else onOpen(document.id);
              setDeleteAck(false);
            })
          }
        >
          Delete selected local content
        </button>
      </details>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
