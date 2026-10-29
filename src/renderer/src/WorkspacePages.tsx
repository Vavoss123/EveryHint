import { useEffect, useState } from "react";
import { MemoryPanel } from "./MemoryPanel";
import { BriefPanel } from "./BriefPanel";
import {
  type CalendarEvent,
  type WorkspaceConfig,
  type WorkspaceState,
  type WorkspaceQuery,
  personName,
  EMPTY_FACTS,
  type Person,
  type MemoryRecord,
  type ImportedContact,
} from "../../shared/workspace";
import {
  DEFAULT_MEETING_QUERY,
  type MeetingListItem,
} from "../../shared/meetings";
export function SavedMeetingPicker({
  selected,
  change,
}: {
  selected: string[];
  change: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<MeetingListItem[]>([]),
    [next, setNext] = useState<number | null>(0),
    [error, setError] = useState("");
  async function load(offset = 0) {
    try {
      const state = await window.everyhint.meetings.getState();
      if (!state.ok) throw new Error(state.error);
      if (state.value.locked)
        throw new Error(
          "Unlock Meeting history before choosing saved meetings.",
        );
      const result = await window.everyhint.meetings.list({
        scopeId: state.value.scopeId,
        input: { ...DEFAULT_MEETING_QUERY, offset },
      });
      if (!result.ok) throw new Error(result.error);
      setItems((old) =>
        offset ? [...old, ...result.value.items] : result.value.items,
      );
      setNext(result.value.nextOffset);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <fieldset>
      <legend>Choose authorised saved meetings</legend>
      <p>{selected.length} selected · temporary conversations are excluded.</p>
      <div className="button-row">
        <button type="button" onClick={() => void load(0)}>
          Load saved meeting choices
        </button>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => change([])}
        >
          Remove meeting associations / selections
        </button>
      </div>
      {items.map((m) => (
        <label className="check" key={m.id}>
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={(e) =>
              change(
                e.target.checked
                  ? [...selected, m.id]
                  : selected.filter((id) => id !== m.id),
              )
            }
          />
          {m.title} · {new Date(m.startedAt ?? m.createdAt).toLocaleString()} ·{" "}
          {m.status}
        </label>
      ))}
      {next !== null && items.length > 0 && (
        <button type="button" onClick={() => void load(next)}>
          More saved meeting choices
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  useEffect(() => {
    const accept = (value: WorkspaceState) =>
      setState((old) => (!old || value.revision >= old.revision ? value : old));
    const off = window.everyhint.workspace.onState(accept);
    void window.everyhint.workspace.get().then((result) => {
      if (result.ok) accept(result.value);
    });
    return off;
  }, []);
  return state;
}
export async function workspaceCommand<T = unknown>(
  state: WorkspaceState,
  command: string,
  value?: unknown,
): Promise<T> {
  const result = await window.everyhint.workspace.command({
    scopeId: state.scopeId,
    command,
    ...(value === undefined ? {} : { value }),
  });
  if (!result.ok) throw new Error(result.error);
  return result.value as T;
}
export async function workspaceQuery<T>(
  state: WorkspaceState,
  query: WorkspaceQuery,
): Promise<{ items: T[]; nextOffset: number | null; scanned: number }> {
  const result = await window.everyhint.workspace.query({
    scopeId: state.scopeId,
    query,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value as {
    items: T[];
    nextOffset: number | null;
    scanned: number;
  };
}
export function WorkspaceGate({
  state,
  children,
}: {
  state: WorkspaceState | null;
  children: React.ReactNode;
}) {
  const [error, setError] = useState("");
  if (!state) return <p>Reading Calendar, People and memory status…</p>;
  return state.unlocked ? (
    <>{children}</>
  ) : (
    <section
      className="card panel-stack"
      aria-label="Locked contextual workspace"
    >
      <h2>Unlock local context</h2>
      <p>Open your encrypted local calendar, contacts and saved context.</p>
      <button
        className="primary"
        disabled={state.busy}
        onClick={() =>
          void workspaceCommand(state, "unlock").catch((e) =>
            setError(e.message),
          )
        }
      >
        Unlock Calendar, People and memory
      </button>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
    </section>
  );
}
export function WorkspaceSettings() {
  const state = useWorkspace(),
    [draft, setDraft] = useState<WorkspaceConfig | null>(null),
    [ack, setAck] = useState(false),
    [calendarAck, setCalendarAck] = useState(false),
    [contactsAck, setContactsAck] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(state?.config ?? null);
    setAck(false);
    setCalendarAck(false);
    setContactsAck(false);
  }, [state?.scopeId, JSON.stringify(state?.config)]);
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section
      className="personal-page card panel-stack"
      aria-label="Calendar and context preferences"
    >
      <h2>Calendar, People and memory</h2>
      <WorkspaceGate state={state}>
        {state && draft && (
          <>
            <p>
              Google connections and ChatGPT sign-in are independent. Read-only
              Google access never permits OpenAI sharing. Configure a real
              Google Cloud Desktop OAuth client, consent screen, test users and
              enabled APIs; public distribution requires applicable Google
              verification.
            </p>
            {(["calendar", "contacts"] as const).map((service) => (
              <section key={service} className="card panel-stack">
                <h3>
                  Google {service === "calendar" ? "Calendar" : "Contacts"}
                </h3>
                <label>
                  Google {service} Desktop client ID
                  <input
                    aria-label={`Google ${service} Desktop client ID`}
                    maxLength={220}
                    value={draft[`${service}ClientId`]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [`${service}ClientId`]: e.target.value,
                      })
                    }
                  />
                </label>
                <p>
                  {state.google[service].email ?? state.google[service].state} ·{" "}
                  {state.google[service].message}
                </p>
                <p className="muted">
                  {service === "calendar"
                    ? "Calendar list and event read-only scopes; only calendars selected in Calendar will be cached."
                    : "Separate contacts.readonly permission. Search/import selected contacts; full-book sync requires another explicit import acknowledgement."}
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={service === "calendar" ? calendarAck : contactsAck}
                    onChange={(e) =>
                      service === "calendar"
                        ? setCalendarAck(e.target.checked)
                        : setContactsAck(e.target.checked)
                    }
                  />
                  I authorise this read-only Google connection separately.
                </label>
                <div className="button-row">
                  <button
                    disabled={
                      state.busy ||
                      !(service === "calendar" ? calendarAck : contactsAck) ||
                      !state.config[`${service}ClientId`]
                    }
                    onClick={() =>
                      void run(() =>
                        workspaceCommand(state, `connect-${service}`, {
                          acknowledged: true,
                        }),
                      )
                    }
                  >
                    Connect / switch Google {service}
                  </button>
                  <button
                    disabled={
                      state.busy ||
                      !(service === "calendar" ? calendarAck : contactsAck)
                    }
                    onClick={() =>
                      void run(() =>
                        workspaceCommand(state, `disconnect-${service}`, {
                          acknowledged: true,
                        }),
                      )
                    }
                  >
                    Disconnect / revoke {service}
                  </button>
                </div>
              </section>
            ))}
            <p className="muted">
              Google revocation may invalidate all clients/scopes in the same
              Google Cloud project. Imported snapshots/cache are removed on
              disconnect; independent saved meetings and manual facts remain
              local.
            </p>
            <label>
              Meeting reminders
              <select
                aria-label="Meeting reminder lead time"
                value={draft.reminderMinutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reminderMinutes: Number(
                      e.target.value,
                    ) as WorkspaceConfig["reminderMinutes"],
                  })
                }
              >
                {[0, 5, 10, 15, 30].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n} minutes before` : "Disabled"}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.notificationTitles}
                onChange={(e) =>
                  setDraft({ ...draft, notificationTitles: e.target.checked })
                }
              />
              Show event titles in Windows notifications
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.autoSync}
                onChange={(e) =>
                  setDraft({ ...draft, autoSync: e.target.checked })
                }
              />
              Read selected Google calendars in the background about every 15
              minutes, with backoff on failures
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.restoreOnStartup}
                onChange={(e) =>
                  setDraft({ ...draft, restoreOnStartup: e.target.checked })
                }
              />
              Restore encrypted cache, selected reminders and chosen Google sync
              preferences when the app restarts
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.memoryEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, memoryEnabled: e.target.checked })
                }
              />
              Enable local long-term memory from explicitly chosen saved sources
            </label>
            <label>
              Memory retention
              <select
                value={draft.memoryRetentionDays ?? "forever"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    memoryRetentionDays:
                      e.target.value === "forever"
                        ? null
                        : (Number(e.target.value) as 30 | 90 | 365),
                  })
                }
              >
                {[30, 90, 365].map((n) => (
                  <option value={n} key={n}>
                    {n} days
                  </option>
                ))}
                <option value="forever">Until I delete it</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.briefPersistence}
                onChange={(e) =>
                  setDraft({ ...draft, briefPersistence: e.target.checked })
                }
              />
              Allow explicitly saved encrypted briefs (generated drafts are
              ephemeral)
            </label>
            <label>
              Saved brief retention
              <select
                value={draft.briefRetentionDays}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    briefRetentionDays: Number(e.target.value) as 7 | 30 | 90,
                  })
                }
              >
                {[7, 30, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I acknowledge these local caching, retention, notification and
              Google access preferences. They do not authorise AI.
            </label>
            <button
              className="primary"
              disabled={!ack || state.busy}
              onClick={() =>
                void run(() =>
                  workspaceCommand(state, "configure", {
                    settings: draft,
                    acknowledged: true,
                  }),
                )
              }
            >
              Save context privacy preferences
            </button>
            <button
              onClick={() => void run(() => workspaceCommand(state, "lock"))}
            >
              Lock contextual workspace
            </button>
            {state.busy && (
              <button
                onClick={() =>
                  void run(() => workspaceCommand(state, "cancel"))
                }
              >
                Cancel context operation
              </button>
            )}
          </>
        )}
      </WorkspaceGate>
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    </section>
  );
}
const plusDays = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function CalendarPage({
  requestedEventId,
  prepareCapture,
  openMeeting,
}: {
  requestedEventId: string | null;
  prepareCapture: () => void;
  openMeeting: (id: string) => void;
}) {
  const state = useWorkspace(),
    [view, setView] = useState("upcoming"),
    [day, setDay] = useState(new Date().toLocaleDateString("en-CA")),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [query, setQuery] = useState(""),
    [calendar, setCalendar] = useState(""),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [next, setNext] = useState<number | null>(null),
    [selected, setSelected] = useState<CalendarEvent | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setEvents([]);
    setSelected(null);
    setError("");
  }, [state?.scopeId]);
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function load(offset = 0) {
    if (!state?.unlocked) return;
    const result = await workspaceQuery<CalendarEvent>(state, {
      kind: "event",
      query,
      offset,
      timeZone: zone,
      ...(view !== "upcoming"
        ? { fromDate: day, toDate: plusDays(day, view === "day" ? 1 : 7) }
        : { fromDate: new Date().toLocaleDateString("en-CA") }),
      ...(calendar ? { calendarId: calendar } : {}),
    });
    setEvents((old) => (offset ? [...old, ...result.items] : result.items));
    setNext(result.nextOffset);
  }
  useEffect(() => {
    if (state?.unlocked) void run(() => load());
  }, [
    state?.scopeId,
    state?.eventCount,
    state?.lastSyncAt,
    state?.unlocked,
    view,
    day,
    zone,
    calendar,
  ]);
  useEffect(() => {
    if (state?.unlocked && requestedEventId)
      void run(async () =>
        setSelected(
          await workspaceCommand<CalendarEvent | null>(
            state,
            "event",
            requestedEventId,
          ),
        ),
      );
  }, [requestedEventId, state?.scopeId, state?.unlocked]);
  const stamp = (at: number) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(at);
  return (
    <section
      className="personal-page panel-stack"
      aria-label="Calendar dashboard"
    >
      <h1>Calendar</h1>
      <p>Your upcoming meetings and preparation.</p>
      <WorkspaceGate state={state}>
        {state && (
          <>
            <details>
              <summary>Connection details</summary>
              <p role="status">{state.status}</p>
              <p>
                Google: {state.google.calendar.email ?? "Not connected"} · Last
                complete refresh:{" "}
                {state.lastSyncAt
                  ? new Date(state.lastSyncAt).toLocaleString()
                  : "Never"}{" "}
                · {state.lastSyncRequests} API request(s) in the last refresh.
              </p>
            </details>
            <div className="button-row">
              <button
                disabled={
                  state.busy || state.google.calendar.state !== "connected"
                }
                onClick={() =>
                  void run(() => workspaceCommand(state, "list-calendars"))
                }
              >
                Load authorised calendar list
              </button>
              <button
                disabled={
                  state.busy || state.google.calendar.state !== "connected"
                }
                onClick={() =>
                  void run(() => workspaceCommand(state, "refresh-calendar"))
                }
              >
                Refresh selected calendars
              </button>
              <button
                disabled={!state.busy}
                onClick={() =>
                  void run(() => workspaceCommand(state, "cancel"))
                }
              >
                Cancel refresh / sign-in
              </button>
            </div>
            <fieldset>
              <legend>Calendars available to cache (maximum five)</legend>
              {!state.calendars.length && (
                <p>
                  No authorised calendars loaded. Configure Google in Settings,
                  connect Calendar, then load the list.
                </p>
              )}
              {state.calendars.map((c) => (
                <label className="check" key={c.id}>
                  <input
                    type="checkbox"
                    checked={state.config.selectedCalendarIds.includes(c.id)}
                    disabled={state.busy}
                    onChange={(e) =>
                      void run(() =>
                        workspaceCommand(state, "configure", {
                          settings: {
                            ...state.config,
                            selectedCalendarIds: e.target.checked
                              ? [...state.config.selectedCalendarIds, c.id]
                              : state.config.selectedCalendarIds.filter(
                                  (id) => id !== c.id,
                                ),
                          },
                          acknowledged: true,
                        }),
                      )
                    }
                  />
                  {c.name} · {c.timeZone}
                </label>
              ))}
            </fieldset>
            <form
              className="button-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => load());
              }}
            >
              <label>
                Calendar view
                <select value={view} onChange={(e) => setView(e.target.value)}>
                  <option value="upcoming">Upcoming list</option>
                  <option value="day">Day</option>
                  <option value="week">Seven days</option>
                </select>
              </label>
              <label>
                Starting day
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
              <label>
                Display time zone
                <select value={zone} onChange={(e) => setZone(e.target.value)}>
                  {[
                    ...new Set([
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                      "UTC",
                      ...state.calendars.map((c) => c.timeZone),
                    ]),
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <label>
                Calendar filter
                <select
                  value={calendar}
                  onChange={(e) => setCalendar(e.target.value)}
                >
                  <option value="">All selected calendars</option>
                  {state.calendars.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search events
                <input
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button type="submit">Search calendar cache</button>
            </form>
            {!events.length && (
              <article className="card">
                <h2>No cached meetings in this view</h2>
                <p>
                  Choose calendars and refresh, or change the day/search.
                  Offline cache can be stale; no sample events are added.
                </p>
              </article>
            )}
            {events.map((event) => (
              <article className="card panel-stack" key={event.id}>
                <h2>{event.title}</h2>
                <p>
                  {event.allDay
                    ? `All day · ${event.startDate}`
                    : stamp(event.startAt)}{" "}
                  ·{" "}
                  {event.allDay
                    ? "All-day interval"
                    : `${Math.round((event.endAt - event.startAt) / 60000)} minutes`}{" "}
                  ·{" "}
                  {state.calendars.find((c) => c.id === event.calendarId)
                    ?.name ?? "Selected calendar"}
                </p>
                <p>
                  {event.platform ?? "No recognised conference link"} ·{" "}
                  {event.attendees.length} supplied attendee(s) ·{" "}
                  {event.recurringId ? "Recurring instance" : "Single event"}
                </p>
                <small>
                  Reminder:{" "}
                  {state.config.reminderMinutes && !event.allDay
                    ? `${state.config.reminderMinutes} minutes before (local app must be running)`
                    : "Disabled / all day"}{" "}
                  · Preparation:{" "}
                  {state.preparedEventIds.includes(event.id)
                    ? "Saved brief available"
                    : "No saved brief"}
                  .
                </small>
                <button onClick={() => setSelected(event)}>
                  View event / prepare
                </button>
              </article>
            ))}
            {next !== null && (
              <button onClick={() => void run(() => load(next))}>
                Next event page
              </button>
            )}
            {selected && (
              <section
                className="card panel-stack"
                aria-label="Calendar event details"
              >
                <h2>{selected.title}</h2>
                <p>
                  {selected.allDay
                    ? selected.startDate
                    : stamp(selected.startAt)}{" "}
                  — {selected.allDay ? selected.endDate : stamp(selected.endAt)}{" "}
                  · Event zone: {selected.timeZone}
                </p>
                <p>{selected.location || "No location supplied"}</p>
                <pre className="knowledge-text">
                  {selected.description ||
                    "No description or objective supplied."}
                </pre>
                <h3>Attendees supplied by Calendar</h3>
                {selected.attendees.length ? (
                  selected.attendees.map((p, i) => (
                    <p key={i}>
                      {p.name || "Name not supplied"} ·{" "}
                      {p.email || "Email not supplied"} · {p.response}
                    </p>
                  ))
                ) : (
                  <p>No attendees supplied.</p>
                )}
                <div className="button-row">
                  <button
                    disabled={!selected.url}
                    onClick={() =>
                      void run(() =>
                        workspaceCommand(state, "open-meeting", selected.id),
                      )
                    }
                  >
                    Open meeting link
                  </button>
                  <button onClick={prepareCapture}>
                    Choose capture sources for this meeting
                  </button>
                  <button onClick={() => setSelected(null)}>
                    Close event details
                  </button>
                </div>
                <BriefPanel
                  key={selected.id}
                  state={state}
                  event={selected}
                  openMeeting={openMeeting}
                />
              </section>
            )}
          </>
        )}
      </WorkspaceGate>
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    </section>
  );
}
export function PeoplePage({
  openMeeting,
}: {
  openMeeting: (id: string) => void;
}) {
  const state = useWorkspace(),
    [query, setQuery] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [next, setNext] = useState<number | null>(null),
    [editing, setEditing] = useState<Person | null>(null),
    [error, setError] = useState(""),
    [googleQuery, setGoogleQuery] = useState(""),
    [candidates, setCandidates] = useState<ImportedContact[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [importAck, setImportAck] = useState(false),
    [allAck, setAllAck] = useState(false),
    [related, setRelated] = useState<{
      meetings: {
        id: string;
        title: string;
        notes: string;
        actions: {
          text: string;
          owner: string | null;
          deadline: string | null;
        }[];
      }[];
      memories: MemoryRecord[];
      historyLocked: boolean;
    } | null>(null);
  useEffect(() => {
    setPeople([]);
    setEditing(null);
    setCandidates([]);
    setSelected([]);
    setRelated(null);
    setError("");
  }, [state?.scopeId]);
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function load(offset = 0) {
    if (!state?.unlocked) return;
    const result = await workspaceQuery<Person>(state, {
      kind: "person",
      query,
      offset,
    });
    setPeople((old) => (offset ? [...old, ...result.items] : result.items));
    setNext(result.nextOffset);
  }
  useEffect(() => {
    if (state?.unlocked) void run(() => load());
  }, [state?.scopeId, state?.peopleCount, state?.unlocked]);
  return (
    <section
      className="personal-page panel-stack"
      aria-label="People dashboard"
    >
      <h1>People</h1>
      <p>People, conversation notes and shared context.</p>
      <WorkspaceGate state={state}>
        {state && (
          <>
            <form
              className="button-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => load());
              }}
            >
              <label>
                Search local people
                <input
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button type="submit">Search people locally</button>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    id: "new",
                    manual: { ...EMPTY_FACTS },
                    imported: null,
                    notes: "",
                    meetingIds: [],
                    updatedAt: 0,
                  })
                }
              >
                Add manual person
              </button>
            </form>
            {!people.length && (
              <article className="card">
                <h2>No local people in this view</h2>
                <p>
                  Add a person yourself or explicitly search/import authorised
                  Google Contacts. Calendar attendees are not imported
                  automatically.
                </p>
              </article>
            )}
            {people.map((person) => (
              <article className="card panel-stack" key={person.id}>
                <h2>{personName(person)}</h2>
                <p>
                  {person.manual.email ||
                    person.imported?.email ||
                    "No email supplied"}{" "}
                  ·{" "}
                  {person.manual.organisation ||
                    person.imported?.organisation ||
                    "Organisation not supplied"}{" "}
                  ·{" "}
                  {person.manual.jobTitle ||
                    person.imported?.jobTitle ||
                    "Job title not supplied"}
                </p>
                <p>Your notes: {person.notes || "None"}</p>
                <small>
                  {person.imported
                    ? `Google Contacts snapshot · fetched ${new Date(person.imported.retrievedAt).toLocaleString()}`
                    : "User-entered local record"}{" "}
                  · Updated {new Date(person.updatedAt).toLocaleString()}
                </small>
                <div className="button-row">
                  <button
                    onClick={() => {
                      setEditing(structuredClone(person));
                      setRelated(null);
                    }}
                  >
                    Edit user facts / notes / associations
                  </button>
                  <button
                    onClick={() =>
                      void run(async () =>
                        setRelated(
                          await workspaceCommand(
                            state,
                            "person-related",
                            person.id,
                          ),
                        ),
                      )
                    }
                  >
                    Previous discussions and commitments
                  </button>
                  <button
                    onClick={() =>
                      void run(async () => {
                        await workspaceCommand(state, "delete-person", {
                          id: person.id,
                          acknowledged: true,
                        });
                        setRelated(null);
                        await load();
                      })
                    }
                  >
                    Delete local person
                  </button>
                </div>
              </article>
            ))}
            {next !== null && (
              <button onClick={() => void run(() => load(next))}>
                Continue local People search
              </button>
            )}
            {editing && (
              <form
                className="card panel-stack"
                aria-label="Person editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await workspaceCommand(state, "save-person", {
                      id: editing.id,
                      manual: editing.manual,
                      notes: editing.notes,
                      meetingIds: editing.meetingIds,
                      updatedAt: editing.updatedAt,
                    });
                    setEditing(null);
                    await load();
                  });
                }}
              >
                <h2>
                  {editing.id === "new"
                    ? "New local person"
                    : "Edit user-authored facts"}
                </h2>
                {(
                  [
                    ["name", "Display name"],
                    ["email", "Email"],
                    ["organisation", "Organisation"],
                    ["jobTitle", "Job title"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      maxLength={key === "email" ? 254 : 200}
                      value={editing.manual[key]}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          manual: { ...editing.manual, [key]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={editing.manual.emailVerified}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        manual: {
                          ...editing.manual,
                          emailVerified: e.target.checked,
                        },
                      })
                    }
                  />
                  I have confirmed this exact email for attendee matching. This
                  does not identify a voice or prove a relationship.
                </label>
                <label>
                  Your contact notes
                  <textarea
                    aria-label="Your contact notes"
                    maxLength={4000}
                    value={editing.notes}
                    onChange={(e) =>
                      setEditing({ ...editing, notes: e.target.value })
                    }
                  />
                </label>
                <SavedMeetingPicker
                  selected={editing.meetingIds}
                  change={(meetingIds) =>
                    setEditing({ ...editing, meetingIds })
                  }
                />
                {editing.imported && (
                  <details>
                    <summary>
                      Imported facts are separate from your overrides
                    </summary>
                    <p>
                      {editing.imported.name} · {editing.imported.email} ·{" "}
                      {editing.imported.organisation} ·{" "}
                      {editing.imported.jobTitle}
                    </p>
                  </details>
                )}
                <button type="submit" className="primary">
                  Save local person
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel person edit
                </button>
              </form>
            )}
            {related && (
              <section
                className="card panel-stack"
                aria-label="Person previous context"
              >
                <h2>Associated previous context</h2>
                {related.historyLocked && (
                  <p>
                    Unlock Meeting history to inspect authorised saved
                    discussions. No transcript or note has been invented.
                  </p>
                )}
                {!related.meetings.length && !related.memories.length && (
                  <p>
                    No associated saved discussions or memories are available.
                  </p>
                )}
                {related.meetings.map((m) => (
                  <article key={m.id}>
                    <h3>{m.title}</h3>
                    <p>{m.notes || "No manual notes saved."}</p>
                    {m.actions.map((a, i) => (
                      <p key={i}>
                        {a.text} · {a.owner ?? "Unassigned"} ·{" "}
                        {a.deadline ?? "Not specified"}
                      </p>
                    ))}
                    <button onClick={() => openMeeting(m.id)}>
                      Open saved meeting and sources
                    </button>
                  </article>
                ))}
                {related.memories.map((m) => (
                  <article key={m.id}>
                    <strong>
                      {m.type} · {m.review}
                    </strong>
                    <p>{m.description}</p>
                    <blockquote>{m.quote}</blockquote>
                    <small>
                      {m.source.title} · {m.ref}
                    </small>
                  </article>
                ))}
              </section>
            )}
            <details>
              <summary>Optional Google Contacts search and import</summary>
              <div className="panel-stack">
                <p>
                  Requires a separately connected Contacts permission in
                  Settings. Search results are temporary; only checked contacts
                  are imported. Your local edits never write to Google.
                </p>
                <form
                  className="button-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      setCandidates(
                        await workspaceCommand<ImportedContact[]>(
                          state,
                          "search-google-contacts",
                          googleQuery,
                        ),
                      );
                      setSelected([]);
                      setImportAck(false);
                    });
                  }}
                >
                  <label>
                    Search authorised Google Contacts
                    <input
                      maxLength={200}
                      value={googleQuery}
                      onChange={(e) => setGoogleQuery(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      state.busy || state.google.contacts.state !== "connected"
                    }
                    type="submit"
                  >
                    Search Google Contacts
                  </button>
                </form>
                {candidates.map((c) => (
                  <label className="check" key={c.resourceName}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.resourceName)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, c.resourceName]
                            : old.filter((id) => id !== c.resourceName),
                        )
                      }
                    />
                    {c.name || "No name supplied"} ·{" "}
                    {c.email || "No email supplied"} · {c.organisation}
                  </label>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={importAck}
                    onChange={(e) => setImportAck(e.target.checked)}
                  />
                  Import only the checked contacts into encrypted local People
                  storage.
                </label>
                <button
                  disabled={!importAck || !selected.length || state.busy}
                  onClick={() =>
                    void run(async () => {
                      await workspaceCommand(state, "import-google-contacts", {
                        resources: selected,
                        acknowledged: true,
                      });
                      setCandidates([]);
                      setSelected([]);
                      setImportAck(false);
                      await load();
                    })
                  }
                >
                  Import selected Google contacts
                </button>
                <button
                  disabled={
                    state.busy || state.google.contacts.state !== "connected"
                  }
                  onClick={() =>
                    void run(async () => {
                      await workspaceCommand(
                        state,
                        "refresh-imported-contacts",
                      );
                      await load();
                    })
                  }
                >
                  Refresh previously imported contacts
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={allAck}
                    onChange={(e) => setAllAck(e.target.checked)}
                  />
                  Separately authorise importing/synchronising my entire Google
                  address book, up to 1,000 contacts. This is optional and does
                  not grant AI sharing.
                </label>
                <button
                  disabled={
                    !allAck ||
                    state.busy ||
                    state.google.contacts.state !== "connected"
                  }
                  onClick={() =>
                    void run(async () => {
                      await workspaceCommand(state, "sync-all-contacts", {
                        acknowledged: true,
                        allContacts: true,
                      });
                      setAllAck(false);
                      await load();
                    })
                  }
                >
                  Read / synchronise all authorised contacts
                </button>
                <button
                  disabled={state.busy || !state.contactsAllSync}
                  onClick={() =>
                    void run(() =>
                      workspaceCommand(state, "stop-all-contact-sync"),
                    )
                  }
                >
                  Clear full-contact sync state
                </button>
                <p className="muted">
                  Local deletion never deletes a Google contact. A later
                  explicit re-import can restore it. Refresh/sync handles
                  provider deletions and preserves separately authored manual
                  facts/notes.
                </p>
              </div>
            </details>
            <MemoryPanel state={state} openMeeting={openMeeting} />
          </>
        )}
      </WorkspaceGate>
      {state?.busy && (
        <button
          onClick={() => void run(() => workspaceCommand(state, "cancel"))}
        >
          Cancel People operation
        </button>
      )}
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    </section>
  );
}
