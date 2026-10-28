import { useState } from "react";
import type {
  CalendarEvent,
  MemoryRecord,
  Person,
  WorkspaceSelection,
  WorkspaceState,
} from "../../shared/workspace";
import { personName } from "../../shared/workspace";
import { SavedMeetingPicker, workspaceQuery } from "./WorkspacePages";

export const emptyWorkspaceSelection = (
  purpose: WorkspaceSelection["purpose"] = "answer",
): WorkspaceSelection => ({
  purpose,
  eventId: null,
  description: false,
  personIds: [],
  memoryIds: [],
  meetingIds: [],
});
export function WorkspaceChoices({
  state,
  value,
  change,
  eventFixed = false,
}: {
  state: WorkspaceState;
  value: WorkspaceSelection;
  change: (v: WorkspaceSelection) => void;
  eventFixed?: boolean;
}) {
  const [people, setPeople] = useState<Person[]>([]),
    [memories, setMemories] = useState<MemoryRecord[]>([]),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [next, setNext] = useState<{
      person: number | null;
      memory: number | null;
    }>({ person: null, memory: null });
  async function load(offset = 0, kind: "person" | "memory" | "both" = "both") {
    try {
      if (kind !== "memory") {
        const r = await workspaceQuery<Person>(state, {
          kind: "person",
          query,
          offset,
        });
        setPeople((old) => (offset ? [...old, ...r.items] : r.items));
        setNext((old) => ({ ...old, person: r.nextOffset }));
      }
      if (kind !== "person") {
        const r = await workspaceQuery<MemoryRecord>(state, {
          kind: "memory",
          query,
          offset,
        });
        setMemories((old) => (offset ? [...old, ...r.items] : r.items));
        setNext((old) => ({ ...old, memory: r.nextOffset }));
      }
      if (!eventFixed) {
        const r = await workspaceQuery<CalendarEvent>(state, {
          kind: "event",
          query,
          offset: 0,
        });
        setEvents(r.items);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const toggle = (
    key: "personIds" | "memoryIds",
    id: string,
    checked: boolean,
  ) =>
    change({
      ...value,
      [key]: checked ? [...value[key], id] : value[key].filter((i) => i !== id),
    });
  return (
    <fieldset className="panel-stack">
      <legend>Optional workspace sources · nothing selected by default</legend>
      <p>
        Only chosen sources enter the exact payload review. Contacts,
        cross-meeting memory and Google access each remain separate permissions.
        Maximum 5 people, 8 reviewed memories, 3 saved meetings.
      </p>
      <label>
        Search authorised local context
        <input
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={!state.unlocked}
        onClick={() => void load()}
      >
        Find local people, memories and events
      </button>
      {!eventFixed && (
        <label>
          Optional calendar agenda
          <select
            value={value.eventId ?? ""}
            onChange={(e) =>
              change({ ...value, eventId: e.target.value || null })
            }
          >
            <option value="">No calendar event</option>
            {events.map((e) => (
              <option value={e.id} key={e.id}>
                {e.title} · {new Date(e.startAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={value.description}
          onChange={(e) => change({ ...value, description: e.target.checked })}
        />
        Include selected event description (may contain sensitive text)
      </label>
      {people.map((p) => (
        <label className="check" key={p.id}>
          <input
            type="checkbox"
            checked={value.personIds.includes(p.id)}
            disabled={
              (!value.personIds.includes(p.id) &&
                value.personIds.length >= 5) ||
              state.config.excludedPersonIds.includes(p.id)
            }
            onChange={(e) => toggle("personIds", p.id, e.target.checked)}
          />
          {personName(p)} · user facts / authorised snapshot and notes
        </label>
      ))}
      {next.person !== null && (
        <button type="button" onClick={() => void load(next.person!, "person")}>
          Continue People context search
        </button>
      )}
      {memories
        .filter((m) => m.review === "approved")
        .map((m) => (
          <label className="check" key={m.id}>
            <input
              type="checkbox"
              checked={value.memoryIds.includes(m.id)}
              disabled={
                !state.config.memoryEnabled ||
                (!value.memoryIds.includes(m.id) && value.memoryIds.length >= 8)
              }
              onChange={(e) => toggle("memoryIds", m.id, e.target.checked)}
            />
            {m.type} · {m.description} · {m.source.title}
          </label>
        ))}
      {next.memory !== null && (
        <button type="button" onClick={() => void load(next.memory!, "memory")}>
          Continue memory context search
        </button>
      )}
      <SavedMeetingPicker
        selected={value.meetingIds}
        change={(meetingIds) =>
          change({ ...value, meetingIds: meetingIds.slice(0, 3) })
        }
      />
      <button
        type="button"
        onClick={() =>
          change({
            ...emptyWorkspaceSelection(value.purpose),
            eventId: eventFixed ? value.eventId : null,
          })
        }
      >
        Clear optional workspace selections
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
