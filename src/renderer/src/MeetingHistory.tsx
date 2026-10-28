import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantSnapshot } from "../../shared/ai";
import {
  DEFAULT_MEETING_QUERY,
  type MeetingDocument,
  type MeetingPage,
  type MeetingQuery,
  type MeetingState,
  type TranscriptPage,
  type MeetingSegment,
} from "../../shared/meetings";
import type { MeetingAIState } from "../../shared/meeting-ai";
import { meetingResult, meetingScope } from "./useMeetings";
import { MeetingPreferencesPanel } from "./MeetingSessionControls";
import { MeetingDetail, Highlight } from "./MeetingDetail";
import { MeetingAIReview } from "./MeetingAIReview";

export function MeetingHistory(props: {
  state: MeetingState;
  ai: MeetingAIState | null;
  assistant: AssistantSnapshot | null;
  visible: boolean;
  requestedId: string | null;
  prepareCapture: () => void;
  connection: () => void;
}) {
  // Remounting on the main-issued scope prevents old account content flashing on navigation.
  return <ScopedHistory key={props.state.scopeId} {...props} />;
}
function ScopedHistory({
  state,
  ai,
  assistant,
  visible,
  requestedId,
  prepareCapture,
  connection,
}: {
  state: MeetingState;
  ai: MeetingAIState | null;
  assistant: AssistantSnapshot | null;
  visible: boolean;
  requestedId: string | null;
  prepareCapture: () => void;
  connection: () => void;
}) {
  const [query, setQuery] = useState<MeetingQuery>({
      ...DEFAULT_MEETING_QUERY,
    }),
    [applied, setApplied] = useState<MeetingQuery>({
      ...DEFAULT_MEETING_QUERY,
    }),
    [page, setPage] = useState<MeetingPage | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<{
      document: MeetingDocument;
      page: TranscriptPage;
      ref?: string;
    } | null>(null),
    [showDetail, setShowDetail] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [createAck, setCreateAck] = useState(false),
    [deleteAck, setDeleteAck] = useState(false),
    [temporary, setTemporary] = useState<{
      document: MeetingDocument | null;
      segments: MeetingSegment[];
    } | null>(null),
    [showTemporary, setShowTemporary] = useState(false),
    [saveTemporaryAck, setSaveTemporaryAck] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true),
    dirtyRef = useRef(dirty),
    detailRef = useRef(detail);
  dirtyRef.current = dirty;
  detailRef.current = detail;
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "Meeting history could not be loaded.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function load(next: MeetingQuery) {
    const request = ++generation.current;
    const value = meetingResult(
      await window.everyhint.meetings.list(meetingScope(state, next)),
    );
    if (mounted.current && request === generation.current) {
      setPage(value);
      setApplied(next);
    }
  }
  async function open(id: string, ref?: string) {
    if (dirtyRef.current && detailRef.current?.document.id !== id) {
      setError(
        "Save or revert the open meeting's unsaved edits before opening another meeting.",
      );
      setShowDetail(true);
      return;
    }
    if (dirtyRef.current && detailRef.current?.document.id === id) {
      setShowDetail(true);
      return;
    }
    await run(async () => {
      const [docResult, pageResult] = await Promise.all([
        window.everyhint.meetings.get(meetingScope(state, { id })),
        window.everyhint.meetings.transcript(
          meetingScope(state, { id, offset: 0 }),
        ),
      ]);
      const document = meetingResult(docResult),
        transcript = meetingResult(pageResult);
      if (mounted.current) {
        setDetail({ document, page: transcript, ref });
        setShowDetail(true);
        setShowTemporary(false);
      }
    });
  }
  async function refreshTemporary() {
    await run(async () => {
      const value = meetingResult(
        await window.everyhint.meetings.temporary(
          meetingScope(state, undefined),
        ),
      );
      if (mounted.current) setTemporary(value);
    });
  }
  useEffect(() => {
    if (!visible) return;
    if (!state.locked) void run(() => load({ ...DEFAULT_MEETING_QUERY }));
  }, [visible, state.locked]);
  useEffect(() => {
    if (visible && requestedId && !state.locked) void open(requestedId);
  }, [requestedId, visible, state.locked]);
  useEffect(() => {
    if (state.locked) {
      setPage(null);
      setDetail(null);
      setSelected([]);
      setShowDetail(false);
      setDirty(false);
    }
  }, [state.locked]);
  function saved(document: MeetingDocument) {
    if (!mounted.current) return;
    setDetail((current) =>
      current && current.document.id === document.id
        ? { ...current, document }
        : current,
    );
    setDirty(false);
  }
  function back(deleted = false) {
    if (deleted) {
      setDetail(null);
      setDirty(false);
    }
    setShowDetail(false);
    void run(() => load({ ...applied, offset: 0 }));
  }
  function source(ref: string) {
    const id = ref.split("/")[0];
    if (id?.startsWith("temporary-")) {
      setShowTemporary(true);
      return;
    }
    if (id) void open(id, ref);
  }
  return (
    <div
      hidden={!visible}
      className="meetings-page panel-stack"
      aria-label="Meeting history workspace"
    >
      <div hidden={showDetail} className="panel-stack">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR LOCAL WORKSPACE</p>
            <h1>Meetings</h1>
            <p className="muted">
              Saved conversations, notes and decisions, under your control.
            </p>
          </div>
          <button className="primary" onClick={prepareCapture}>
            Prepare new capture
          </button>
        </div>
        <p className="muted">
          {state.profileLabel} · {state.status}
        </p>
        {state.locked ? (
          <section
            className="empty-state card"
            aria-label="Locked meeting history"
          >
            <h2>History is locked</h2>
            <p>
              Unlock this profile's encrypted local history to browse saved
              meetings. Opening history never starts recording.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  meetingResult(
                    await window.everyhint.meetings.unlock(
                      meetingScope(state, undefined),
                    ),
                  );
                })
              }
            >
              Unlock meeting history
            </button>
          </section>
        ) : (
          <>
            <form
              className="meeting-filters card"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => load({ ...query, offset: 0 }));
              }}
              aria-label="History search filters"
            >
              <label>
                Search saved content
                <input
                  aria-label="Search meeting history"
                  value={query.query}
                  maxLength={200}
                  onChange={(event) =>
                    setQuery({ ...query, query: event.target.value })
                  }
                />
              </label>
              <label>
                Tag
                <input
                  aria-label="Filter meetings by tag"
                  maxLength={50}
                  value={query.tag}
                  onChange={(event) =>
                    setQuery({ ...query, tag: event.target.value })
                  }
                />
              </label>
              <label>
                From
                <input
                  aria-label="Meeting date from"
                  type="date"
                  onChange={(event) =>
                    setQuery({
                      ...query,
                      from: event.target.value
                        ? new Date(`${event.target.value}T00:00:00`).getTime()
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Through
                <input
                  aria-label="Meeting date through"
                  type="date"
                  onChange={(event) =>
                    setQuery({
                      ...query,
                      to: event.target.value
                        ? new Date(
                            `${event.target.value}T23:59:59.999`,
                          ).getTime()
                        : null,
                    })
                  }
                />
              </label>
              <label>
                Status
                <select
                  aria-label="Filter meeting status"
                  value={query.status}
                  onChange={(event) =>
                    setQuery({
                      ...query,
                      status: event.target.value as MeetingQuery["status"],
                    })
                  }
                >
                  {["all", "draft", "active", "ended", "interrupted"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Order
                <select
                  aria-label="Sort meeting history"
                  value={query.sort}
                  onChange={(event) =>
                    setQuery({
                      ...query,
                      sort: event.target.value as MeetingQuery["sort"],
                    })
                  }
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
              <button className="secondary" type="submit" disabled={busy}>
                Search history
              </button>
            </form>
            {page && !page.items.length && (
              <section className="empty-state card">
                <h2>
                  {applied.query ||
                  applied.tag ||
                  applied.status !== "all" ||
                  applied.from ||
                  applied.to
                    ? "No matching meetings in this page"
                    : "Your meeting history starts here"}
                </h2>
                <p>
                  {page.partial
                    ? "Search is deliberately bounded. Continue to scan the remaining encrypted history."
                    : "Explicitly save an authorised session, or create a meeting for your own notes. Temporary conversations stay out of history."}
                </p>
              </section>
            )}
            <div className="meeting-list" aria-label="Saved meetings">
              {page?.items.map((item) => (
                <article className="card meeting-list-item" key={item.id}>
                  <label className="ai-choice">
                    <input
                      type="checkbox"
                      aria-label={`Include ${item.title} in meeting AI`}
                      checked={selected.includes(item.id)}
                      disabled={
                        !selected.includes(item.id) && selected.length >= 3
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                    Include in AI
                  </label>
                  <button
                    className="meeting-open"
                    onClick={() => void open(item.id)}
                  >
                    <h2>
                      <Highlight text={item.title} query={applied.query} />
                    </h2>
                  </button>
                  <p>
                    {new Date(
                      item.startedAt ?? item.createdAt,
                    ).toLocaleString()}{" "}
                    · {Math.round(item.durationMs / 60000)} min · {item.status}
                  </p>
                  <small>
                    {item.noteStatus === "generated"
                      ? "AI notes saved"
                      : item.noteStatus === "manual"
                        ? "Manual notes saved"
                        : "No notes yet"}{" "}
                    · {item.actionCount} action items ·{" "}
                    {item.segmentCount
                      ? `${item.segmentCount} final transcript segments`
                      : "No transcript"}
                  </small>
                  <small>
                    Updated {new Date(item.updatedAt).toLocaleString()} ·{" "}
                    {item.tags.join(", ") || "No tags"}
                  </small>
                  {item.snippet && (
                    <p className="meeting-snippet">
                      <Highlight text={item.snippet} query={applied.query} />
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => void open(item.id)}
                  >
                    Open, edit or export meeting
                  </button>
                </article>
              ))}
            </div>
            <div className="button-row">
              {applied.offset > 0 && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => load({ ...applied, offset: 0 }))
                  }
                >
                  First history page
                </button>
              )}
              {page?.nextOffset !== null && page?.nextOffset !== undefined && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      load({ ...applied, offset: page.nextOffset! }),
                    )
                  }
                >
                  {page.partial
                    ? "Continue bounded history search"
                    : "Next history page"}
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run(() => load({ ...applied, offset: 0 }))}
              >
                Refresh history
              </button>
              <button
                className="secondary"
                disabled={busy || dirty}
                onClick={() =>
                  void run(async () => {
                    meetingResult(
                      await window.everyhint.meetings.lock(
                        meetingScope(state, undefined),
                      ),
                    );
                  })
                }
              >
                Lock history
              </button>
            </div>
            {page?.partial && (
              <small>
                More history remains. Each search step examines at most 25
                meetings / 1,000 transcript segments / 4 million characters;
                plaintext search results exist only while unlocked.
              </small>
            )}
            {selected.length > 0 && (
              <>
                <p>
                  {selected.length} saved meeting(s) selected; at most three per
                  request.
                </p>
                <button className="text-button" onClick={() => setSelected([])}>
                  Clear selected meetings
                </button>
                <MeetingAIReview
                  state={state}
                  ai={ai}
                  assistant={assistant}
                  meetingIds={selected}
                  onSaved={saved}
                  onEvidence={source}
                  connection={connection}
                  disabledReason={
                    dirty
                      ? "Save or revert the open meeting's edits first."
                      : undefined
                  }
                />
              </>
            )}
            <details className="card panel-stack">
              <summary>Create a meeting for manual notes</summary>
              <label>
                New title
                <input
                  aria-label="New saved meeting title"
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="ai-choice">
                <input
                  type="checkbox"
                  aria-label="Authorise creating saved meeting"
                  checked={createAck}
                  onChange={(event) => setCreateAck(event.target.checked)}
                />
                Create a local record under my selected retention policy. No
                capture or remote request starts.
              </label>
              <button
                className="primary"
                disabled={
                  !createAck ||
                  !title.trim() ||
                  busy ||
                  !state.preferences.enabled ||
                  dirty
                }
                onClick={() =>
                  void run(async () => {
                    const doc = meetingResult(
                      await window.everyhint.meetings.create(
                        meetingScope(state, { title, acknowledged: true }),
                      ),
                    );
                    setCreateAck(false);
                    setDetail({
                      document: doc,
                      page: { segments: [], nextOffset: null },
                    });
                    setShowDetail(true);
                  })
                }
              >
                Create saved meeting
              </button>
              {!state.preferences.enabled && (
                <small>
                  Enable local history below before creating records.
                </small>
              )}
            </details>
            <details className="card panel-stack">
              <summary>Delete all locally saved meetings</summary>
              <p>
                Export first if needed. This removes this profile's local
                transcript, notes, decisions, actions and in-memory search
                state. It cannot remove exports or provider-retained text.
              </p>
              <label className="ai-choice">
                <input
                  type="checkbox"
                  aria-label="Confirm deleting all saved meetings"
                  checked={deleteAck}
                  onChange={(event) => setDeleteAck(event.target.checked)}
                />
                Delete every saved meeting in {state.profileLabel}.
              </label>
              <button
                className="danger"
                disabled={!deleteAck || busy || dirty || state.saving}
                onClick={() =>
                  void run(async () => {
                    meetingResult(
                      await window.everyhint.meetings.deleteAll(
                        meetingScope(state, { acknowledged: true }),
                      ),
                    );
                    setDeleteAck(false);
                    setSelected([]);
                    setDetail(null);
                    await load({ ...DEFAULT_MEETING_QUERY });
                  })
                }
              >
                Delete all saved meetings
              </button>
            </details>
          </>
        )}
        <details
          className="card panel-stack"
          open={showTemporary}
          onToggle={(event) => setShowTemporary(event.currentTarget.open)}
        >
          <summary>
            Temporary session · review retained text or generate an unsaved
            draft
          </summary>
          <p>
            Only retained final transcripts from the current profile/session are
            available. Refresh shows a snapshot; nothing is saved by opening
            this panel.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void refreshTemporary()}
          >
            Refresh temporary session
          </button>
          {temporary?.document ? (
            <>
              <p>
                {temporary.document.segmentCount} final segments ·{" "}
                {temporary.document.title}
              </p>
              <details>
                <summary>Retained final transcript snapshot</summary>
                {temporary.segments.map((segment) => (
                  <p key={`${segment.sessionId}/${segment.id}`}>
                    <small>
                      {new Date(segment.startMs).toLocaleTimeString()} ·{" "}
                      {segment.source}
                    </small>{" "}
                    {segment.text}
                  </p>
                ))}
              </details>
              <MeetingAIReview
                state={state}
                ai={ai}
                assistant={assistant}
                meetingIds={[]}
                temporary
                onSaved={saved}
                onEvidence={source}
                connection={connection}
              />
              <label>
                Save retained session as
                <input
                  aria-label="Temporary meeting title"
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="ai-choice">
                <input
                  type="checkbox"
                  aria-label="Authorise saving retained temporary transcript"
                  checked={saveTemporaryAck}
                  onChange={(event) =>
                    setSaveTemporaryAck(event.target.checked)
                  }
                />
                Persist this available final text and metadata under my
                retention policy. Any AI draft remains unsaved until separately
                applied.
              </label>
              <button
                className="primary"
                disabled={
                  !saveTemporaryAck ||
                  !state.preferences.enabled ||
                  busy ||
                  dirty
                }
                onClick={() =>
                  void run(async () => {
                    const sessionId = temporary.document!.id.slice(
                      "temporary-".length,
                    );
                    const doc = meetingResult(
                      await window.everyhint.meetings.saveSession(
                        meetingScope(state, {
                          title: title.trim() || temporary.document!.title,
                          sessionId,
                          acknowledged: true,
                        }),
                      ),
                    );
                    setSaveTemporaryAck(false);
                    await open(doc.id);
                  })
                }
              >
                Save retained temporary session
              </button>
            </>
          ) : (
            temporary && (
              <p className="muted">
                No meaningful retained final text is available. Capture and
                local transcription require their own explicit consent.
              </p>
            )
          )}
        </details>
        <MeetingPreferencesPanel state={state} />
      </div>
      {detail && (
        <div hidden={!showDetail}>
          <MeetingDetail
            state={state}
            ai={ai}
            assistant={assistant}
            document={detail.document}
            initialPage={detail.page}
            initialReference={detail.ref}
            onSaved={saved}
            onBack={back}
            onOpen={(id, ref) => void open(id, ref)}
            prepareCapture={prepareCapture}
            connection={connection}
            onDirty={onDirty}
          />
        </div>
      )}
      {(error || state.error) && (
        <p role="alert" className="error-message">
          {error ?? state.error}
        </p>
      )}
      {busy && <p role="status">Working with local meeting data…</p>}
    </div>
  );
}
