import { useState } from "react";
import type {
  MemoryRecord,
  Person,
  WorkspaceState,
} from "../../shared/workspace";
import { personName } from "../../shared/workspace";
import {
  SavedMeetingPicker,
  workspaceCommand,
  workspaceQuery,
} from "./WorkspacePages";
import { usePersonal } from "./PersonalPages";

export function MemoryPanel({
  state,
  openMeeting,
}: {
  state: WorkspaceState;
  openMeeting: (id: string) => void;
}) {
  const personal = usePersonal(),
    [meetingIds, setMeetingIds] = useState<string[]>([]),
    [documentIds, setDocumentIds] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [query, setQuery] = useState(""),
    [records, setRecords] = useState<MemoryRecord[]>([]),
    [next, setNext] = useState<number | null>(null),
    [editing, setEditing] = useState<MemoryRecord | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [peopleQuery, setPeopleQuery] = useState(""),
    [peopleNext, setPeopleNext] = useState<number | null>(null),
    [error, setError] = useState(""),
    [personFilter, setPersonFilter] = useState(""),
    [meetingFilter, setMeetingFilter] = useState<string[]>([]),
    [result, setResult] = useState("");
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function load(offset = 0) {
    await workspaceCommand(state, "reconcile-sources");
    const page = await workspaceQuery<MemoryRecord>(state, {
      kind: "memory",
      query,
      offset,
      ...(personFilter ? { personId: personFilter } : {}),
      ...(meetingFilter[0] ? { meetingId: meetingFilter[0] } : {}),
    });
    setRecords((old) => (offset ? [...old, ...page.items] : page.items));
    setNext(page.nextOffset);
  }
  async function loadPeople(offset = 0) {
    const page = await workspaceQuery<Person>(state, {
      kind: "person",
      query: peopleQuery,
      offset,
    });
    setPeople((old) => (offset ? [...old, ...page.items] : page.items));
    setPeopleNext(page.nextOffset);
  }
  const save = (m: MemoryRecord) =>
    workspaceCommand(state, "save-memory", {
      id: m.id,
      updatedAt: m.updatedAt,
      type: m.type,
      description: m.description,
      personIds: m.personIds,
      topics: m.topics,
      status: m.status,
      review: m.review,
    });
  return (
    <section className="card panel-stack" aria-label="Long-term memory">
      <h2>Long-term memory</h2>
      <p>
        {state.config.memoryEnabled ? "Enabled locally" : "Disabled"} ·{" "}
        {state.memoryCount} encrypted record(s). Enable and choose retention in
        Settings. Extraction never reads temporary sessions or sends a model
        request. New extracted records need review before AI use.
      </p>
      <SavedMeetingPicker
        selected={meetingIds}
        change={(ids) => {
          setMeetingIds(ids);
          setAck(false);
        }}
      />
      <fieldset>
        <legend>
          Explicitly authorised enabled Knowledge documents (maximum five)
        </legend>
        {!personal?.unlocked && (
          <p>Unlock Knowledge to choose saved documents.</p>
        )}
        {personal?.unlocked &&
          personal.documents
            .filter((d) => d.enabled)
            .map((d) => (
              <label className="check" key={d.id}>
                <input
                  type="checkbox"
                  checked={documentIds.includes(d.id)}
                  onChange={(e) => {
                    setDocumentIds((old) =>
                      e.target.checked
                        ? [...old, d.id]
                        : old.filter((id) => id !== d.id),
                    );
                    setAck(false);
                  }}
                />
                {d.name}
              </label>
            ))}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        Rebuild memories from only these selected saved sources. Existing
        memories for those sources will be replaced and need review again.
        Dependent saved briefs will be cleared.
      </label>
      <button
        disabled={
          !ack ||
          !state.config.memoryEnabled ||
          state.busy ||
          (!meetingIds.length && !documentIds.length)
        }
        onClick={() =>
          void run(async () => {
            const r = await workspaceCommand<{ extracted: number }>(
              state,
              "rebuild-memory",
              { meetingIds, documentIds, acknowledged: true },
            );
            setAck(false);
            setResult(
              `${r.extracted} memory records extracted, pending review.`,
            );
            await load();
          })
        }
      >
        Rebuild memory from chosen sources
      </button>
      <form
        className="panel-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => load());
        }}
      >
        <label>
          Search memory (keywords and topics)
          <input
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Find person for memory filters / exclusions
          <input
            maxLength={200}
            value={peopleQuery}
            onChange={(e) => setPeopleQuery(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => void run(() => loadPeople())}>
          Load local people for filters / exclusions
        </button>
        {peopleNext !== null && (
          <button
            type="button"
            onClick={() => void run(() => loadPeople(peopleNext))}
          >
            More people for memory filters / exclusions
          </button>
        )}
        <label>
          Person filter
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
          >
            <option value="">All people</option>
            {people.map((p) => (
              <option value={p.id} key={p.id}>
                {personName(p)}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Filter by a selected saved meeting</summary>
          <SavedMeetingPicker
            selected={meetingFilter}
            change={(v) => setMeetingFilter(v.slice(-1))}
          />
        </details>
        <button type="submit">Review / search local memory</button>
        <button
          type="button"
          disabled={!state.config.memoryEnabled}
          onClick={() =>
            setEditing({
              id: "new",
              type: "note",
              description: "",
              quote: "",
              ref: "",
              source: {
                kind: "user",
                id: "new",
                revision: 1,
                title: "User-authored memory",
              },
              createdAt: 0,
              updatedAt: 0,
              lastVerifiedAt: 0,
              personIds: [],
              topics: [],
              status: "open",
              review: "pending",
              authorship: "user",
            })
          }
        >
          Add user-authored memory
        </button>
      </form>
      <details>
        <summary>Memory exclusions</summary>
        <p>
          Excluded meetings and people cannot be included in cross-meeting
          context. Saving an exclusion removes affected memories and saved
          briefs. Rebuild explicitly after removing an exclusion.
        </p>
        <SavedMeetingPicker
          selected={state.config.excludedMeetingIds}
          change={(excludedMeetingIds) =>
            void run(() =>
              workspaceCommand(state, "configure", {
                settings: { ...state.config, excludedMeetingIds },
                acknowledged: true,
              }),
            )
          }
        />
        {people.map((p) => (
          <label className="check" key={p.id}>
            <input
              type="checkbox"
              checked={state.config.excludedPersonIds.includes(p.id)}
              onChange={(e) =>
                void run(() =>
                  workspaceCommand(state, "configure", {
                    settings: {
                      ...state.config,
                      excludedPersonIds: e.target.checked
                        ? [...state.config.excludedPersonIds, p.id]
                        : state.config.excludedPersonIds.filter(
                            (id) => id !== p.id,
                          ),
                    },
                    acknowledged: true,
                  }),
                )
              }
            />
            Exclude {personName(p)} from cross-meeting memory / AI context
          </label>
        ))}
      </details>
      {records.length === 0 && (
        <p>
          No memories loaded in this view. Search, or choose authorised saved
          sources and rebuild.
        </p>
      )}
      {records.map((m) => (
        <article className="card panel-stack" key={m.id}>
          <h3>
            {m.type} · {m.review} · {m.status}
          </h3>
          <p>{m.description}</p>
          <blockquote>{m.quote}</blockquote>
          <small>
            {m.source.title} · {m.ref} · {m.authorship} · Verified{" "}
            {new Date(m.lastVerifiedAt).toLocaleString()}
          </small>
          <div className="button-row">
            <button onClick={() => setEditing(structuredClone(m))}>
              Review / edit memory
            </button>
            {m.source.kind === "meeting" && (
              <button onClick={() => openMeeting(m.source.id)}>
                Open source meeting
              </button>
            )}
            <button
              onClick={() =>
                void run(async () => {
                  await workspaceCommand(state, "delete-memory", {
                    id: m.id,
                    acknowledged: true,
                  });
                  await load();
                })
              }
            >
              Delete this local memory
            </button>
          </div>
        </article>
      ))}
      {next !== null && (
        <button onClick={() => void run(() => load(next))}>
          Continue memory search
        </button>
      )}
      {editing && (
        <form
          className="card panel-stack"
          aria-label="Memory editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await save(editing);
              setEditing(null);
              await load();
            });
          }}
        >
          <h3>Review memory</h3>
          <label>
            Type
            <select
              value={editing.type}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  type: e.target.value as MemoryRecord["type"],
                })
              }
            >
              {[
                "decision",
                "commitment",
                "action",
                "topic",
                "project",
                "follow-up",
                "note",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              maxLength={800}
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </label>
          <p>
            Source evidence remains:{" "}
            {editing.quote || "Your new user-authored text"}
          </p>
          <label>
            Topics (comma separated)
            <input
              maxLength={1000}
              value={editing.topics.join(", ")}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  topics: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {people.map((p) => (
            <label className="check" key={p.id}>
              <input
                type="checkbox"
                checked={editing.personIds.includes(p.id)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    personIds: e.target.checked
                      ? [...editing.personIds, p.id]
                      : editing.personIds.filter((id) => id !== p.id),
                  })
                }
              />
              {personName(p)}
            </label>
          ))}
          <label>
            Status
            <select
              value={editing.status}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  status: e.target.value as MemoryRecord["status"],
                })
              }
            >
              <option>open</option>
              <option>done</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={editing.review === "approved"}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  review: e.target.checked ? "approved" : "pending",
                })
              }
            />
            I reviewed this memory and its evidence. Allow it to be explicitly
            selected for later remote review.
          </label>
          <button className="primary" type="submit">
            Save reviewed memory
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancel memory edit
          </button>
        </form>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={result === "confirm-delete-all"}
          onChange={(e) =>
            setResult(e.target.checked ? "confirm-delete-all" : "")
          }
        />
        Confirm deleting all local memories and saved briefs. Source meetings /
        documents remain independent.
      </label>
      <button
        disabled={result !== "confirm-delete-all" || state.busy}
        onClick={() =>
          void run(async () => {
            await workspaceCommand(state, "delete-all-memory", {
              acknowledged: true,
            });
            setResult("All local memories deleted.");
            await load();
          })
        }
      >
        Delete all local memories
      </button>
      {result && result !== "confirm-delete-all" && (
        <p role="status">{result}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
