import { useEffect, useState } from "react";
import type { AssistantSnapshot } from "../../shared/ai";
import type {
  CalendarEvent,
  MeetingAssociation,
  SavedBrief,
  WorkspaceAIContext,
  WorkspaceState,
  WorkspaceSelection,
} from "../../shared/workspace";
import { workspaceCommand, SavedMeetingPicker } from "./WorkspacePages";
import {
  WorkspaceChoices,
  emptyWorkspaceSelection,
} from "./WorkspaceSelection";
import { ModeSelector, usePersonal } from "./PersonalPages";
import { ResponseText } from "./ResponseText";

export function WorkspaceSources({
  context,
  remove,
}: {
  context: WorkspaceAIContext;
  remove?: (index: number) => void;
}) {
  return (
    <details open>
      <summary>
        Selected workspace source references · {context.purpose}
      </summary>
      {context.entries.map((e, i) => (
        <article className="review-item" key={e.ref}>
          <strong>
            {e.ref} · {e.title}
          </strong>
          <pre className="review-text">{e.text}</pre>
          {e.sourceRef && <small>Evidence reference: {e.sourceRef}</small>}
          {remove && (
            <button onClick={() => remove(i)}>
              Remove {e.kind} from this payload
            </button>
          )}
        </article>
      ))}
    </details>
  );
}
export function BriefPanel({
  state,
  event,
  openMeeting,
}: {
  state: WorkspaceState;
  event: CalendarEvent;
  openMeeting: (id: string) => void;
}) {
  const personal = usePersonal(),
    [selection, setSelection] = useState<WorkspaceSelection>({
      ...emptyWorkspaceSelection("brief"),
      eventId: event.id,
    }),
    [knowledgeIds, setKnowledgeIds] = useState<string[]>([]),
    [assistant, setAssistant] = useState<AssistantSnapshot | null>(null),
    [ack, setAck] = useState(false),
    [persistAck, setPersistAck] = useState(false),
    [exportAck, setExportAck] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState<SavedBrief | null>(null),
    [meetingIds, setMeetingIds] = useState<string[]>([]),
    [associated, setAssociated] = useState<{
      items: {
        association: MeetingAssociation;
        title: string;
        notes: string;
        actions: { text: string }[];
      }[];
      historyLocked: boolean;
    } | null>(null);
  useEffect(() => {
    const accept = (v: AssistantSnapshot) =>
      setAssistant((old) => (!old || v.revision >= old.revision ? v : old));
    const off = window.everyhint.onAssistant(accept);
    void window.everyhint.getAssistant().then((r) => {
      if (r.ok) accept(r.value);
    });
    return off;
  }, []);
  useEffect(() => {
    setAck(false);
    setPersistAck(false);
    setExportAck(false);
  }, [assistant?.review?.requestId, assistant?.sessionId]);
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const review =
      assistant?.review?.workspaceContext?.purpose === "brief"
        ? assistant.review
        : null,
    response = assistant?.responses.findLast(
      (r) =>
        r.workspaceContext?.purpose === "brief" &&
        r.workspaceContext.entries.some(
          (e) => e.kind === "event" && e.id === event.id,
        ),
    ),
    active = assistant?.responses.some(
      (r) => r.status === "sending" || r.status === "generating",
    ),
    provider = assistant?.providers.find((p) => p.id === "codex");
  function change(v: typeof selection) {
    setSelection(v);
    setAck(false);
    void window.everyhint.assistant("discard-review");
  }
  async function refreshAssociations() {
    setAssociated(
      await workspaceCommand(state, "event-associations", event.id),
    );
  }
  return (
    <section className="panel-stack" aria-label="Pre-call brief">
      <h3>Prepare for this meeting</h3>
      <p>
        Briefs use your selected ChatGPT model and active AI mode. Drafts stay
        ephemeral unless you enable a retention policy and explicitly save one.
        Every generation needs a payload review and remote acknowledgement.
      </p>
      <ModeSelector />
      <WorkspaceChoices
        state={state}
        value={selection}
        change={change}
        eventFixed
      />
      <fieldset>
        <legend>Optional active-mode Knowledge excerpts</legend>
        {personal?.unlocked ? (
          personal.documents
            .filter(
              (d) =>
                d.enabled &&
                personal.config.modes
                  .find((m) => m.id === personal.config.activeModeId)
                  ?.knowledgeIds.includes(d.id),
            )
            .map((d) => (
              <label className="check" key={d.id}>
                <input
                  type="checkbox"
                  checked={knowledgeIds.includes(d.id)}
                  onChange={(e) => {
                    setKnowledgeIds((old) =>
                      e.target.checked
                        ? [...old, d.id]
                        : old.filter((id) => id !== d.id),
                    );
                    setAck(false);
                    void window.everyhint.assistant("discard-review");
                  }}
                />
                {d.name}
              </label>
            ))
        ) : (
          <p>
            Unlock Knowledge and associate documents with the selected mode to
            choose excerpts.
          </p>
        )}
      </fieldset>
      <div className="button-row">
        <button
          className="primary"
          disabled={state.busy || active}
          onClick={() =>
            void run(async () => {
              await workspaceCommand(state, "prepare-brief", {
                selection,
                knowledgeIds,
              });
              setAck(false);
            })
          }
        >
          {response
            ? "Regenerate brief · review first"
            : "Prepare brief · review first"}
        </button>
        <button
          onClick={() =>
            void run(async () => {
              const r = await window.everyhint.inspectProviders();
              if (!r.ok) throw new Error(r.error);
            })
          }
        >
          Inspect ChatGPT connection / model
        </button>
        <button
          onClick={() =>
            void run(async () =>
              setSaved(
                await workspaceCommand<SavedBrief | null>(
                  state,
                  "saved-brief",
                  event.id,
                ),
              ),
            )
          }
        >
          Load saved brief
        </button>
      </div>
      {review && (
        <section
          className="context-review"
          aria-label="Pre-call payload review"
        >
          <h3>Review exact pre-call payload</h3>
          <p>
            ChatGPT · {review.model ?? "Available discovered model"} ·{" "}
            {review.modeContext?.mode.name ?? "General"} · {review.textChars}{" "}
            serialized characters
          </p>
          {review.workspaceContext && (
            <WorkspaceSources
              context={review.workspaceContext}
              remove={(index) =>
                void run(async () => {
                  setAck(false);
                  const r = await window.everyhint.removeContext({
                    reviewId: review.requestId,
                    kind: "workspace",
                    index,
                  });
                  if (!r.ok) throw new Error(r.error);
                })
              }
            />
          )}
          {review.knowledge?.map((k, index) => (
            <article className="review-item" key={k.ref}>
              <strong>
                {k.ref} · {k.documentName} · {k.heading}
              </strong>
              <pre className="review-text">{k.text}</pre>
              <button
                onClick={() =>
                  void run(async () => {
                    setAck(false);
                    const r = await window.everyhint.removeContext({
                      reviewId: review.requestId,
                      kind: "knowledge",
                      index,
                    });
                    if (!r.ok) throw new Error(r.error);
                  })
                }
              >
                Remove knowledge excerpt from this payload
              </button>
            </article>
          ))}
          <details>
            <summary>Exact serialized prompt</summary>
            <pre className="review-text">{review.prompt}</pre>
          </details>
          {review.notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed this exact payload and authorise this ChatGPT-plan
            request. Calendar / contact connection does not grant this
            permission.
          </label>
          <button
            className="primary"
            disabled={!ack || active || !provider?.ready}
            onClick={() =>
              void run(async () => {
                setAck(false);
                const r = await window.everyhint.ask({
                  reviewId: review.requestId,
                  acknowledged: true,
                });
                if (!r.ok) throw new Error(r.error);
              })
            }
          >
            Generate reviewed pre-call brief
          </button>
          <button
            onClick={() =>
              void run(async () => {
                const r = await window.everyhint.assistant("discard-review");
                if (!r.ok) throw new Error(r.error);
              })
            }
          >
            Discard brief review
          </button>
        </section>
      )}
      {response && (
        <article
          className="card panel-stack"
          aria-label="Generated pre-call brief"
        >
          <h3>Pre-call brief · {response.status}</h3>
          <ResponseText text={response.text} />
          {response.error && <p role="alert">{response.error.message}</p>}
          {response.workspaceContext && (
            <WorkspaceSources context={response.workspaceContext} />
          )}
          {response.knowledge?.length ? (
            <details>
              <summary>Supplied knowledge references</summary>
              {response.knowledge.map((k) => (
                <article key={k.ref}>
                  <strong>
                    {k.ref} · {k.documentName} · {k.heading}
                  </strong>
                  <pre className="review-text">{k.text}</pre>
                </article>
              ))}
            </details>
          ) : null}
          <button
            disabled={!response.text}
            onClick={() =>
              void run(async () => {
                const r = await window.everyhint.copyResponse(response.text);
                if (!r.ok) throw new Error(r.error);
                setNotice("Brief copied.");
              })
            }
          >
            Copy brief
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={exportAck}
              onChange={(e) => setExportAck(e.target.checked)}
            />
            Export a plaintext copy outside encrypted storage. I control its
            later deletion.
          </label>
          <button
            disabled={!exportAck || response.status !== "completed"}
            onClick={() =>
              void run(async () => {
                await workspaceCommand(state, "export-brief", {
                  requestId: response.requestId,
                  acknowledged: true,
                });
                setExportAck(false);
              })
            }
          >
            Export plaintext brief
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={persistAck}
              onChange={(e) => setPersistAck(e.target.checked)}
            />
            Save this brief in encrypted local storage under my chosen{" "}
            {state.config.briefRetentionDays}-day policy, replacing the previous
            saved brief for this event.
          </label>
          <button
            disabled={
              !state.config.briefPersistence ||
              !persistAck ||
              response.status !== "completed"
            }
            onClick={() =>
              void run(async () => {
                setSaved(
                  await workspaceCommand(state, "save-brief", {
                    requestId: response.requestId,
                    acknowledged: true,
                  }),
                );
                setPersistAck(false);
              })
            }
          >
            Save brief under chosen retention
          </button>
        </article>
      )}
      {saved && (
        <article className="card panel-stack" aria-label="Saved pre-call brief">
          <h3>Saved brief · {new Date(saved.createdAt).toLocaleString()}</h3>
          <ResponseText text={saved.text} />
          <WorkspaceSources context={saved.context} />
          {saved.knowledge?.length ? (
            <details>
              <summary>Saved knowledge references</summary>
              {saved.knowledge.map((k) => (
                <article key={k.ref}>
                  <strong>
                    {k.ref} · {k.documentName} · {k.heading}
                  </strong>
                  <pre className="review-text">{k.text}</pre>
                </article>
              ))}
            </details>
          ) : null}
          <button
            onClick={() =>
              void run(async () => {
                await workspaceCommand(state, "delete-brief", event.id);
                setSaved(null);
              })
            }
          >
            Delete saved brief
          </button>
        </article>
      )}
      <details>
        <summary>
          Link previous saved meetings and recurring discussions
        </summary>
        <div className="panel-stack">
          <p>
            Associations never overwrite saved titles or notes. Other instances
            of this recurring Google event can show the same linked history.
          </p>
          <SavedMeetingPicker selected={meetingIds} change={setMeetingIds} />
          <button
            disabled={!meetingIds.length || state.busy}
            onClick={() =>
              void run(async () => {
                for (const meetingId of meetingIds)
                  await workspaceCommand(state, "associate-meeting", {
                    eventId: event.id,
                    meetingId,
                    acknowledged: true,
                  });
                await refreshAssociations();
                setMeetingIds([]);
              })
            }
          >
            Associate chosen saved meetings with this event
          </button>
          <button onClick={() => void run(refreshAssociations)}>
            View related notes and commitments
          </button>
          {associated?.historyLocked && (
            <p>Unlock Meeting history to inspect saved notes.</p>
          )}
          {associated?.items.map((a) => (
            <article key={a.association.id}>
              <h4>{a.title}</h4>
              <p>{a.notes || "No user-authored notes."}</p>
              {a.actions.map((action, i) => (
                <p key={i}>{action.text}</p>
              ))}
              <button onClick={() => openMeeting(a.association.meetingId)}>
                Open past notes and sources
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    await workspaceCommand(
                      state,
                      "remove-association",
                      a.association.id,
                    );
                    await refreshAssociations();
                  })
                }
              >
                Remove this association
              </button>
            </article>
          ))}
        </div>
      </details>
      {active && (
        <button onClick={() => void window.everyhint.assistant("cancel")}>
          Cancel AI generation
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
