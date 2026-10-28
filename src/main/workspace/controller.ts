import { randomUUID } from "node:crypto";
import type { PersonalStore } from "../personal/store";
import type { AssistantController } from "../ai/controller";
import type { MeetingController } from "../meetings/controller";
import type { PersonalController } from "../personal/controller";
import { GoogleAccount } from "../google/accounts";
import {
  CalendarAPI,
  dateInZone,
  validTimeZone,
  meetingURL,
  opaqueId,
} from "../google/calendar";
import { GoogleError } from "../google/http";
import {
  ContactsAPI,
  contactResource,
  type ContactSync,
} from "../google/contacts";
import {
  EMPTY_FACTS,
  parsePerson,
  personName,
  verifiedPersonEmail,
  type Person,
  type ImportedContact,
  type MemoryRecord,
} from "../../shared/workspace";
import { MeetingReminders } from "./reminders";
import { WorkspaceResume } from "./resume";
import {
  defaultWorkspaceConfig,
  parseWorkspaceConfig,
  type WorkspaceState,
  type CalendarEvent,
  type GoogleService,
  type WorkspaceKind,
  type WorkspaceRow,
  type WorkspaceQuery,
} from "../../shared/workspace";
import { localId, text } from "../../shared/modes";
import { exactKeys, record } from "../../shared/validation";
import type { MeetingDocument } from "../../shared/meetings";
import type { MeetingStore } from "../meetings/store";
import { ids } from "../../shared/modes";
import {
  parseWorkspaceSelection,
  personEmail,
  type WorkspaceSelection,
  type WorkspaceAIContext,
  type WorkspaceExcerpt,
  type MeetingAssociation,
  type SavedBrief,
} from "../../shared/workspace";
import { meetingMemories, documentMemories } from "./memory";

export interface WorkspacePorts {
  store: (profile: string) => PersonalStore;
  google: (
    profile: string,
    service: GoogleService,
    changed: () => void,
  ) => GoogleAccount;
  changed: (state: WorkspaceState) => void;
  invalidate: () => void;
  notify: (event: CalendarEvent, titles: boolean) => () => void;
  openURL: (url: string) => Promise<void>;
  assistant: AssistantController;
  meetings: MeetingController;
  personal: PersonalController;
  captureIdle: () => boolean;
  exportText: (
    name: string,
    text: string,
    valid: () => boolean,
  ) => Promise<{ cancelled: boolean }>;
}
export class WorkspaceController {
  private state: WorkspaceState = {
    revision: 0,
    scopeId: randomUUID(),
    unlocked: false,
    busy: false,
    status:
      "Calendar, People and memory are locked. No background access is enabled.",
    error: null,
    config: defaultWorkspaceConfig(),
    google: {
      calendar: {
        service: "calendar",
        state: "disconnected",
        subject: null,
        email: null,
        message: "Google Calendar is not connected.",
        configured: false,
      },
      contacts: {
        service: "contacts",
        state: "disconnected",
        subject: null,
        email: null,
        message: "Google Contacts is not connected.",
        configured: false,
      },
    },
    calendars: [],
    eventCount: 0,
    peopleCount: 0,
    memoryCount: 0,
    preparedEventIds: [],
    lastSyncAt: null,
    nextSyncAt: null,
    lastSyncRequests: 0,
    contactsAllSync: false,
    suggestion: null,
  };
  private profile = "";
  private store?: PersonalStore;
  private accounts?: Record<GoogleService, GoogleAccount>;
  private abort?: AbortController;
  private epoch = 0;
  private closing: Promise<unknown> = Promise.resolve();
  private events: CalendarEvent[] = [];
  private reminders?: MeetingReminders;
  private timer: ReturnType<typeof setInterval>;
  private nextAllowedSync = 0;
  private failures = 0;
  private opening?: Promise<void>;
  private interfaceReady = false;
  private contactsAPI?: ContactsAPI;
  private contactCandidates = new Map<string, ImportedContact>();
  private stagedLive?: {
    context: WorkspaceAIContext;
    selection: WorkspaceSelection;
    valid: () => boolean;
  };
  constructor(
    private ports: WorkspacePorts,
    private resume: WorkspaceResume,
    private now: () => number = Date.now,
  ) {
    this.timer = setInterval(() => {
      void this.tick().catch(() => {});
    }, 30000);
    this.timer.unref();
  }
  get value(): WorkspaceState {
    const value = structuredClone(this.state);
    if (this.accounts) {
      value.google.calendar = this.accounts.calendar.value;
      value.google.contacts = this.accounts.contacts.value;
    }
    return value;
  }
  private publish() {
    this.state.revision++;
    this.ports.changed(this.value);
  }
  invalidate(): void {
    this.epoch++;
    this.stagedLive = undefined;
    this.ports.invalidate();
  }
  get liveContext(): import("../../shared/intelligence").LiveContext["workspaceSources"] {
    const staged = this.stagedLive;
    return staged?.valid()
      ? {
          scopeId: this.state.scopeId,
          selection: structuredClone(staged.selection),
          context: structuredClone(staged.context),
        }
      : undefined;
  }
  switchProfile(profile: string) {
    if (profile === this.profile) return;
    this.lock();
    this.profile = profile;
    if (this.interfaceReady) void this.restoreChosen();
  }
  async restoreChosen(): Promise<void> {
    this.interfaceReady = true;
    if (!this.resume.read(this.profile)) return;
    const scope = this.state.scopeId;
    this.state.busy = true;
    this.publish();
    try {
      await this.open();
    } catch (error) {
      if (scope !== this.state.scopeId) return;
      this.state.error =
        error instanceof Error ? error.message : "Workspace restore failed.";
      this.publish();
    } finally {
      if (scope === this.state.scopeId) {
        this.state.busy = false;
        this.publish();
      }
    }
  }
  lock() {
    this.opening = undefined;
    this.contactsAPI = undefined;
    this.contactCandidates.clear();
    this.nextAllowedSync = 0;
    this.failures = 0;
    this.invalidate();
    this.abort?.abort();
    this.accounts?.calendar.cancel();
    this.accounts?.contacts.cancel();
    this.reminders?.close();
    this.reminders = undefined;
    const store = this.store,
      accounts = this.accounts;
    this.store = undefined;
    this.accounts = undefined;
    this.events = [];
    this.closing = Promise.allSettled([
      this.closing,
      store?.close(),
      accounts?.calendar.close(),
      accounts?.contacts.close(),
    ]);
    this.state = {
      ...this.state,
      scopeId: randomUUID(),
      unlocked: false,
      busy: false,
      status: "Local context locked; reminders and Google reads paused.",
      error: null,
      config: defaultWorkspaceConfig(),
      calendars: [],
      eventCount: 0,
      peopleCount: 0,
      memoryCount: 0,
      preparedEventIds: [],
      lastSyncAt: null,
      nextSyncAt: null,
      lastSyncRequests: 0,
      contactsAllSync: false,
      suggestion: null,
      google: {
        calendar: {
          service: "calendar",
          state: "disconnected",
          subject: null,
          email: null,
          message: "Locked",
          configured: false,
        },
        contacts: {
          service: "contacts",
          state: "disconnected",
          subject: null,
          email: null,
          message: "Locked",
          configured: false,
        },
      },
    };
    this.publish();
  }
  private requireStore(): PersonalStore {
    if (!this.store || !this.state.unlocked)
      throw new Error("Unlock local Calendar, People and memory first.");
    return this.store;
  }
  private scope(scope: unknown) {
    if (scope !== this.state.scopeId)
      throw new Error("Workspace profile changed. Reload this view.");
  }
  private async get<T>(kind: WorkspaceKind, id: string): Promise<T | null> {
    const scope = this.state.scopeId;
    const result = await this.requireStore().call<T | null>("workspaceGet", {
      kind,
      id,
    });
    this.scope(scope);
    return result;
  }
  private async list<T>(
    kind: WorkspaceKind,
    limit = 1100,
  ): Promise<{ id: string; value: T }[]> {
    const scope = this.state.scopeId;
    const result = await this.requireStore().call<{ id: string; value: T }[]>(
      "workspaceList",
      { kind, limit },
    );
    this.scope(scope);
    return result;
  }
  private row(
    kind: WorkspaceKind,
    id: string,
    value: unknown,
    expiresAt: number | null = null,
  ): WorkspaceRow {
    return { kind, id, value, updatedAt: this.now(), expiresAt };
  }
  private async batch(
    rows: WorkspaceRow[],
    remove: { kind: WorkspaceKind; id: string }[] = [],
  ) {
    const scope = this.state.scopeId;
    this.abort?.signal.throwIfAborted();
    await this.requireStore().call("workspaceBatch", { rows, remove });
    this.scope(scope);
  }
  private async counts() {
    const scope = this.state.scopeId;
    const counts =
      await this.requireStore().call<Record<string, number>>("workspaceCounts");
    this.scope(scope);
    this.state.eventCount = counts.event ?? 0;
    this.state.peopleCount = counts.person ?? 0;
    this.state.memoryCount = counts.memory ?? 0;
    this.state.preparedEventIds = (
      await this.list<SavedBrief>("brief", 30)
    ).map((r) => r.id);
  }
  private open(): Promise<void> {
    if (this.state.unlocked) return Promise.resolve();
    if (this.opening) return this.opening;
    const work = this.openStore().finally(() => {
      if (this.opening === work) this.opening = undefined;
    });
    this.opening = work;
    return work;
  }
  private async openStore() {
    if (this.state.unlocked) return;
    const scope = this.state.scopeId;
    await this.closing;
    this.scope(scope);
    const store = this.ports.store(this.profile);
    this.store = store;
    try {
      await store.open();
      this.scope(scope);
      this.state.unlocked = true;
      const config = await this.get<unknown>("settings", "preferences");
      this.scope(scope);
      this.state.config = config
        ? parseWorkspaceConfig(config)
        : defaultWorkspaceConfig();
      this.accounts = {
        calendar: this.ports.google(this.profile, "calendar", () =>
          this.publish(),
        ),
        contacts: this.ports.google(this.profile, "contacts", () =>
          this.publish(),
        ),
      };
      await Promise.all([
        this.accounts.calendar.restore(this.state.config.calendarClientId),
        this.accounts.contacts.restore(this.state.config.contactsClientId),
      ]);
      this.scope(scope);
      this.contactsAPI = new ContactsAPI(this.accounts.contacts, this.now);
      this.state.contactsAllSync = Boolean(
        await this.get("sync", "contacts-policy"),
      );
      this.state.calendars = (
        await this.list<import("../../shared/workspace").CalendarInfo>(
          "calendar",
        )
      ).map((row) => row.value);
      this.events = (await this.list<CalendarEvent>("event"))
        .map((row) => row.value)
        .filter(
          (e) =>
            e.subject === this.accounts!.calendar.subject &&
            this.state.config.selectedCalendarIds.includes(e.calendarId),
        );
      const synced = await this.get<{ at: number; requests: number }>(
        "sync",
        "calendar",
      );
      this.scope(scope);
      this.state.lastSyncAt = synced?.at ?? null;
      this.state.lastSyncRequests = synced?.requests ?? 0;
      this.reminders = new MeetingReminders(
        async (key) => Boolean(await this.get("receipt", key)),
        async (key, expiry) => {
          await this.batch([
            this.row("receipt", key, { deliveredAt: this.now() }, expiry),
          ]);
        },
        (event) =>
          this.ports.notify(event, this.state.config.notificationTitles),
        () => this.state.unlocked && this.state.scopeId === scope,
        this.now,
      );
      await this.reconcileSources();
      await this.counts();
      this.scope(scope);
      this.state.status =
        "Encrypted context unlocked. Google sync, local memory and remote AI sharing have separate controls.";
      this.state.nextSyncAt = this.state.config.autoSync
        ? this.now() + 60000
        : null;
      this.publish();
      await this.tick();
    } catch (error) {
      if (scope === this.state.scopeId) {
        this.lock();
        this.state.error =
          error instanceof Error
            ? error.message
            : "Encrypted context could not be opened; existing data was preserved.";
        this.publish();
      }
      await store.close();
      throw error;
    }
  }
  async command(value: unknown): Promise<unknown> {
    const request = record(value);
    exactKeys(request, ["scopeId", "command", "value"]);
    this.scope(request.scopeId);
    if (typeof request.command !== "string")
      throw new Error("Choose a workspace action.");
    const command = request.command,
      scope = this.state.scopeId;
    if (command === "lock") {
      this.lock();
      return this.value;
    }
    if (command === "cancel") {
      this.abort?.abort();
      this.accounts?.calendar.cancel();
      this.accounts?.contacts.cancel();
      this.invalidate();
      return this.value;
    }
    if (this.state.busy)
      throw new Error("Wait for the current context operation, or cancel it.");
    this.state.busy = true;
    this.state.error = null;
    this.publish();
    const abort = new AbortController();
    this.abort = abort;
    try {
      let result: unknown;
      if (command === "unlock") {
        await this.open();
        result = this.value;
      } else if (command === "configure") {
        const input = record(request.value);
        exactKeys(input, ["settings", "acknowledged"]);
        if (input.acknowledged !== true)
          throw new Error(
            "Acknowledge local caching, retention, reminders and Google sync preferences.",
          );
        const config = parseWorkspaceConfig(input.settings);
        this.requireStore();
        for (const service of ["calendar", "contacts"] as const)
          if (
            this.accounts?.[service].subject &&
            config[`${service}ClientId`] !==
              this.state.config[`${service}ClientId`]
          )
            throw new Error(
              "Disconnect that Google permission before changing its OAuth client.",
            );
        if (
          config.selectedCalendarIds.some(
            (id) => !this.state.calendars.some((c) => c.id === id),
          )
        )
          throw new Error("Choose calendars from the current authorised list.");
        this.invalidate();
        const removed = this.events.filter(
          (e) => !config.selectedCalendarIds.includes(e.calendarId),
        );
        await this.batch(
          [this.row("settings", "preferences", config)],
          removed.map((e) => ({ kind: "event", id: e.id })),
        );
        this.scope(scope);
        this.events = this.events.filter((e) =>
          config.selectedCalendarIds.includes(e.calendarId),
        );
        this.state.config = config;
        this.resume.write(this.profile, config.restoreOnStartup);
        this.state.nextSyncAt = config.autoSync
          ? this.now() + 15 * 60000
          : null;
        this.reminders?.close();
        await this.clearBriefs();
        await this.reconcileSources();
        const retained = await this.list<MemoryRecord>("memory");
        if (retained.length)
          await this.batch(
            retained.map((r) =>
              this.row("memory", r.id, r.value, this.memoryExpiry(r.value)),
            ),
          );
        await this.counts();
        result = this.value;
      } else if (
        command === "connect-calendar" ||
        command === "connect-contacts"
      ) {
        const service: GoogleService =
          command === "connect-calendar" ? "calendar" : "contacts";
        this.requireStore();
        const input = record(request.value);
        exactKeys(input, ["acknowledged"]);
        if (input.acknowledged !== true)
          throw new Error(
            "Acknowledge the selected Google read-only connection. It does not authorise OpenAI sharing.",
          );
        this.invalidate();
        const previous = this.accounts![service].subject;
        await this.accounts![service].connect(
          this.state.config[`${service}ClientId`],
        );
        this.scope(scope);
        if (previous !== this.accounts![service].subject)
          await this.clearGoogle(service, previous);
        result = this.value;
      } else if (
        command === "disconnect-calendar" ||
        command === "disconnect-contacts"
      ) {
        const service: GoogleService =
          command === "disconnect-calendar" ? "calendar" : "contacts";
        this.requireStore();
        const input = record(request.value);
        exactKeys(input, ["acknowledged"]);
        if (input.acknowledged !== true)
          throw new Error(
            "Confirm revocation and removal of this connection's cached data.",
          );
        this.invalidate();
        const subject = this.accounts![service].subject;
        let failure: unknown;
        try {
          await this.accounts![service].disconnect();
        } catch (error) {
          failure = error;
        }
        this.scope(scope);
        await this.clearGoogle(service, subject);
        if (failure) throw failure;
        result = this.value;
      } else if (command === "list-calendars") {
        this.requireStore();
        const api = new CalendarAPI(this.accounts!.calendar, this.now);
        const calendars = await api.calendars(abort.signal);
        this.scope(scope);
        abort.signal.throwIfAborted();
        this.state.calendars = calendars;
        await this.batch(
          this.state.calendars.map((c) =>
            this.row("calendar", opaqueId("cal", c.id), c),
          ),
        );
        result = this.state.calendars;
      } else if (command === "refresh-calendar") {
        await this.syncCalendar(abort.signal);
        result = this.value;
      } else if (command === "event") {
        const id = localId(request.value);
        result = this.events.find((e) => e.id === id) ?? null;
      } else if (command === "open-meeting") {
        const event = this.events.find((e) => e.id === localId(request.value));
        const link = meetingURL(event?.url);
        if (!link)
          throw new Error(
            "No supported HTTPS meeting link is available. No application was opened.",
          );
        await this.ports.openURL(link.url);
        result = null;
      } else
        result = await this.extendedCommand(
          command,
          request.value,
          abort.signal,
        );
      this.scope(scope);
      abort.signal.throwIfAborted();
      this.state.error = null;
      this.publish();
      return result;
    } catch (error) {
      if (scope === this.state.scopeId) {
        if (
          command.includes("contacts") &&
          error instanceof GoogleError &&
          (error.status === 401 ||
            error.reason === "invalid_grant" ||
            (error.status === 403 && !error.retryAfterMs))
        ) {
          this.invalidate();
          await this.clearGooglePeople("contacts", null);
          await this.counts();
        }
        this.state.error =
          error instanceof Error ? error.message : "Context operation failed.";
        this.publish();
      }
      throw error;
    } finally {
      if (scope === this.state.scopeId) {
        this.state.busy = false;
        this.abort = undefined;
        this.publish();
      }
    }
  }
  private async syncCalendar(signal: AbortSignal) {
    this.requireStore();
    if (this.now() < this.nextAllowedSync)
      throw new Error(
        "Calendar refresh is waiting for its minimum interval or Google backoff.",
      );
    const scope = this.state.scopeId,
      subject = this.accounts!.calendar.subject;
    if (!subject) throw new Error("Connect Google Calendar first.");
    this.nextAllowedSync = this.now() + 30000;
    const api = new CalendarAPI(this.accounts!.calendar, this.now);
    try {
      const calendars = await api.calendars(signal);
      this.scope(scope);
      signal.throwIfAborted();
      const selected = calendars.filter((c) =>
          this.state.config.selectedCalendarIds.includes(c.id),
        ),
        events = await api.events(selected, signal);
      this.scope(scope);
      signal.throwIfAborted();
      this.invalidate();
      const oldEvents = await this.list<CalendarEvent>("event"),
        oldCalendars = await this.list("calendar");
      this.scope(scope);
      await this.batch(
        [
          ...calendars.map((c) =>
            this.row("calendar", opaqueId("cal", c.id), c),
          ),
          ...events.map((e) =>
            this.row("event", e.id, e, e.endAt + 7 * 86400000),
          ),
          this.row("sync", "calendar", {
            at: this.now(),
            requests: api.requests,
            subject,
          }),
        ],
        [
          ...oldEvents.map((e) => ({ kind: "event" as const, id: e.id })),
          ...oldCalendars.map((c) => ({ kind: "calendar" as const, id: c.id })),
        ],
      );
      this.scope(scope);
      this.events = events;
      const briefs = await this.list<SavedBrief>("brief");
      const obsolete = briefs.filter((r) => {
        const reference = r.value.context.entries.find(
          (e) => e.kind === "event",
        );
        return (
          !reference ||
          !events.some(
            (e) =>
              e.id === reference.id &&
              this.eventRevision(e) === reference.updatedAt &&
              this.eventRef(e) === reference.sourceRef,
          )
        );
      });
      if (obsolete.length)
        await this.batch(
          [],
          obsolete.map((r) => ({ kind: "brief", id: r.id })),
        );
      this.state.calendars = calendars;
      this.state.lastSyncAt = this.now();
      this.state.lastSyncRequests = api.requests;
      this.failures = 0;
      this.state.status = `Refreshed ${events.length} events in the bounded 7-day past / 90-day future window. Calendar incremental sync is not enabled.`;
      this.state.nextSyncAt = this.state.config.autoSync
        ? this.now() + 15 * 60000
        : null;
      await this.counts();
      await this.reminders?.tick(
        this.events,
        this.state.config.reminderMinutes,
      );
    } catch (error) {
      if (scope !== this.state.scopeId) throw error;
      this.failures = Math.min(6, this.failures + 1);
      const backoff = Math.max(
        error instanceof GoogleError ? error.retryAfterMs : 0,
        Math.min(3600000, 30000 * 2 ** this.failures),
      );
      this.nextAllowedSync = this.now() + backoff;
      this.state.nextSyncAt = this.state.config.autoSync
        ? this.nextAllowedSync
        : null;
      this.state.status =
        "Google refresh failed. Previous cache is visibly stale; no partial event window was committed.";
      if (
        error instanceof GoogleError &&
        (error.status === 401 || (error.status === 403 && !error.retryAfterMs))
      )
        await this.clearGoogle("calendar", subject);
      throw error;
    }
  }
  private async clearGoogle(service: GoogleService, subject: string | null) {
    if (service === "calendar") {
      await this.clearBriefs();
      const rows = [
        ...(await this.list("event")),
        ...(await this.list("calendar")),
      ];
      await this.batch(
        [],
        rows.map((r) => ({
          kind: ("startAt" in (r.value as object)
            ? "event"
            : "calendar") as WorkspaceKind,
          id: r.id,
        })),
      );
      this.events = [];
      this.state.calendars = [];
      this.state.lastSyncAt = null;
      this.state.nextSyncAt = null;
      this.state.config.selectedCalendarIds = [];
      await this.batch(
        [this.row("settings", "preferences", this.state.config)],
        [{ kind: "sync", id: "calendar" }],
      );
      this.reminders?.close();
    }
    await this.clearGooglePeople(service, subject);
    await this.counts();
  }
  async query(value: unknown) {
    const input = record(value);
    exactKeys(input, ["scopeId", "query"]);
    this.scope(input.scopeId);
    const scope = this.state.scopeId,
      epoch = this.epoch,
      q = record(input.query);
    exactKeys(q, [
      "kind",
      "query",
      "offset",
      "personId",
      "meetingId",
      "fromDate",
      "toDate",
      "timeZone",
      "calendarId",
    ]);
    if (
      !["event", "person", "memory", "brief"].includes(q.kind as string) ||
      !Number.isSafeInteger(q.offset) ||
      (q.offset as number) < 0 ||
      (q.offset as number) > 10000
    )
      throw new Error("Choose a bounded context search page.");
    text(q.query, 200, "Search");
    if (q.personId !== undefined) localId(q.personId);
    if (q.meetingId !== undefined) localId(q.meetingId);
    if (q.kind === "event") {
      this.requireStore();
      const zone = validTimeZone(q.timeZone);
      for (const field of ["fromDate", "toDate"])
        if (
          q[field] !== undefined &&
          (typeof q[field] !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(q[field] as string))
        )
          throw new Error("Choose a valid day/week range.");
      if (q.calendarId !== undefined && typeof q.calendarId !== "string")
        throw new Error("Choose a calendar filter.");
      const filtered = this.events.filter((e) => {
        const start = e.startDate ?? dateInZone(e.startAt, zone),
          end = e.endDate ?? dateInZone(e.endAt - 1, zone);
        return (
          (!q.calendarId || q.calendarId === e.calendarId) &&
          (!q.fromDate || end >= (q.fromDate as string)) &&
          (!q.toDate || start < (q.toDate as string)) &&
          (!q.query ||
            `${e.title} ${e.description} ${e.location}`
              .toLowerCase()
              .includes((q.query as string).toLowerCase()))
        );
      });
      const offset = q.offset as number;
      return {
        items: filtered.slice(offset, offset + 25),
        nextOffset: offset + 25 < filtered.length ? offset + 25 : null,
        scanned: filtered.length,
      };
    }
    const result = await this.requireStore().call<{
      items: unknown[];
      nextOffset: number | null;
      scanned: number;
    }>("workspaceQuery", input.query as WorkspaceQuery);
    this.scope(scope);
    if (epoch !== this.epoch) throw new Error("Context changed during search.");
    return result;
  }
  private async tick() {
    if (!this.state.unlocked) return;
    await this.reminders?.tick(this.events, this.state.config.reminderMinutes);
    const upcoming = this.ports.captureIdle()
      ? this.events.find(
          (e) =>
            !e.allDay &&
            e.startAt >= this.now() - 10 * 60000 &&
            e.startAt <= this.now() + 15 * 60000 &&
            e.endAt > this.now(),
        )
      : undefined;
    const suggestion = upcoming
      ? {
          eventId: upcoming.id,
          title: upcoming.title,
          startAt: upcoming.startAt,
        }
      : null;
    if (JSON.stringify(suggestion) !== JSON.stringify(this.state.suggestion)) {
      this.state.suggestion = suggestion;
      this.publish();
    }
    if (
      this.state.config.autoSync &&
      this.state.nextSyncAt &&
      this.now() >= this.state.nextSyncAt &&
      !this.state.busy
    ) {
      await this.command({
        scopeId: this.state.scopeId,
        command: "refresh-calendar",
      });
    }
  }
  private async extendedCommand(
    command: string,
    value: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.requireStore();
    const scope = this.state.scopeId;
    if (command === "save-person") {
      const raw = record(value),
        id = raw.id === "new" ? randomUUID() : localId(raw.id),
        old = await this.get<Person>("person", id);
      this.scope(scope);
      if (old && raw.updatedAt !== old.updatedAt)
        throw new Error(
          "This person changed. Reload before replacing user-authored facts or notes.",
        );
      if (!old && this.state.peopleCount >= 1000)
        throw new Error("Maximum 1,000 local people.");
      const person = parsePerson({ ...raw, id });
      person.updatedAt = Math.max(this.now(), (old?.updatedAt ?? 0) + 1);
      person.imported = old?.imported ?? null;
      for (const meetingId of person.meetingIds) {
        await this.ports.meetings.requireStore().get(meetingId);
        this.scope(scope);
      }
      this.invalidate();
      await this.batch([this.row("person", id, person)]);
      await this.updatePersonMemoryLinks(person);
      await this.counts();
      return person;
    }
    if (command === "person") return this.get<Person>("person", localId(value));
    if (command === "delete-person") {
      const input = record(value);
      exactKeys(input, ["id", "acknowledged"]);
      if (input.acknowledged !== true)
        throw new Error("Confirm deleting this local person and associations.");
      const id = localId(input.id);
      this.invalidate();
      await this.batch([], [{ kind: "person", id }]);
      await this.removePersonLinks(id);
      await this.counts();
      return null;
    }
    if (command === "person-related") {
      const person = await this.get<Person>("person", localId(value));
      if (!person) throw new Error("Person no longer exists.");
      this.scope(scope);
      const meetings = [];
      if (!this.ports.meetings.value.locked)
        for (const id of person.meetingIds) {
          try {
            const doc = await this.ports.meetings.requireStore().get(id);
            this.scope(scope);
            meetings.push({
              id: doc.id,
              title: doc.title,
              notes: doc.notes.slice(0, 2000),
              actions: doc.actions
                .filter(
                  (a) => a.status !== "completed" && a.status !== "cancelled",
                )
                .slice(0, 10),
              updatedAt: doc.updatedAt,
            });
          } catch {
            /* Independently removed/unavailable history is not invented. */
          }
        }
      const memories = (await this.list<MemoryRecord>("memory"))
        .map((r) => r.value)
        .filter((m) => m.personIds.includes(person.id));
      return {
        meetings,
        memories,
        historyLocked: this.ports.meetings.value.locked,
      };
    }
    if (command === "match-attendees") {
      const event = this.events.find((e) => e.id === localId(value));
      if (!event) throw new Error("Choose a current cached event.");
      const people = await this.list<Person>("person");
      this.scope(scope);
      return event.attendees.map((attendee) => ({
        attendee,
        matches: people
          .map((r) => r.value)
          .filter(
            (p) =>
              verifiedPersonEmail(p) !== null &&
              verifiedPersonEmail(p) === attendee.email.trim().toLowerCase(),
          )
          .map((p) => ({ id: p.id, name: personName(p) })),
      }));
    }
    if (command === "search-google-contacts") {
      const query = text(value, 200, "Contact search", true);
      const contacts = await this.contactsAPI!.search(query, signal);
      this.scope(scope);
      this.contactCandidates = new Map(
        contacts.map((p) => [p.resourceName, p]),
      );
      return contacts;
    }
    if (command === "import-google-contacts") {
      const input = record(value);
      exactKeys(input, ["resources", "acknowledged"]);
      if (
        input.acknowledged !== true ||
        !Array.isArray(input.resources) ||
        !input.resources.length ||
        input.resources.length > 50
      )
        throw new Error(
          "Acknowledge importing one to fifty selected contacts.",
        );
      const resources = input.resources.map(contactResource);
      if (resources.some((r) => !this.contactCandidates.has(r)))
        throw new Error(
          "Select contacts from your current authorised search results.",
        );
      const data = await this.contactsAPI!.selected(resources, signal);
      this.scope(scope);
      await this.applyContacts(data.contacts, data.deleted, false);
      return { imported: data.contacts.length, deleted: data.deleted.length };
    }
    if (command === "refresh-imported-contacts") {
      const rows = (await this.list<Person>("person"))
        .map((r) => r.value)
        .filter((p) => p.imported?.subject === this.accounts!.contacts.subject);
      this.scope(scope);
      let refreshed = 0;
      for (let start = 0; start < rows.length; start += 50) {
        const result = await this.contactsAPI!.selected(
          rows.slice(start, start + 50).map((p) => p.imported!.resourceName),
          signal,
        );
        this.scope(scope);
        await this.applyContacts(result.contacts, result.deleted, false);
        refreshed += result.contacts.length;
      }
      return { refreshed };
    }
    if (command === "sync-all-contacts") {
      const input = record(value);
      exactKeys(input, ["acknowledged", "allContacts"]);
      if (input.acknowledged !== true || input.allContacts !== true)
        throw new Error(
          "Separately authorise importing/synchronising the entire address book (maximum 1,000 contacts).",
        );
      const previous = await this.get<ContactSync>("sync", "contacts-token");
      this.scope(scope);
      const result = await this.contactsAPI!.all(previous, signal);
      this.scope(scope);
      await this.applyContacts(result.contacts, result.deleted, result.full, [
        this.row("sync", "contacts-token", result.sync),
        this.row("sync", "contacts-policy", { allContacts: true }),
      ]);
      this.state.contactsAllSync = true;
      return {
        imported: result.contacts.length,
        deleted: result.deleted.length,
        full: result.full,
      };
    }
    if (command === "stop-all-contact-sync") {
      this.invalidate();
      await this.batch(
        [],
        [
          { kind: "sync", id: "contacts-policy" },
          { kind: "sync", id: "contacts-token" },
        ],
      );
      this.state.contactsAllSync = false;
      return null;
    }
    return this.memoryCommand(command, value, signal);
  }
  private async applyContacts(
    contacts: ImportedContact[],
    deleted: string[],
    full: boolean,
    extra: WorkspaceRow[] = [],
  ) {
    const scope = this.state.scopeId,
      subject = this.accounts!.contacts.subject;
    if (!subject) throw new Error("Contacts identity is unavailable.");
    const existing = await this.list<Person>("person");
    this.scope(scope);
    const byId = new Map(existing.map((r) => [r.id, r.value])),
      rows: WorkspaceRow[] = [...extra],
      remove: { kind: WorkspaceKind; id: string }[] = [];
    for (const contact of contacts) {
      if (contact.subject !== subject)
        throw new Error("Contact belongs to another Google connection.");
      const id = opaqueId("person", subject, contact.resourceName),
        old = byId.get(id);
      const person: Person = {
        id,
        manual: old?.manual ?? { ...EMPTY_FACTS },
        notes: old?.notes ?? "",
        meetingIds: old?.meetingIds ?? [],
        imported: contact,
        updatedAt: this.now(),
      };
      rows.push(this.row("person", id, person));
      byId.set(id, person);
    }
    for (const row of existing) {
      const person = row.value;
      if (person.imported?.subject !== subject) continue;
      if (
        deleted.includes(person.imported.resourceName) ||
        (full &&
          !contacts.some(
            (c) => c.resourceName === person.imported!.resourceName,
          ))
      ) {
        const retained = this.withoutImported(person);
        if (retained) rows.push(this.row("person", person.id, retained));
        else {
          remove.push({ kind: "person", id: person.id });
          byId.delete(person.id);
        }
      }
    }
    if (byId.size > 1000)
      throw new Error(
        "Local People capacity is 1,000. No partial contact sync was committed.",
      );
    this.invalidate();
    await this.clearBriefs();
    await this.batch(rows, remove);
    for (const row of remove) await this.removePersonLinks(row.id);
    await this.counts();
  }
  private withoutImported(person: Person): Person | null {
    return person.notes ||
      Object.entries(person.manual).some(
        ([key, v]) => key !== "emailVerified" && Boolean(v),
      ) ||
      person.meetingIds.length
      ? { ...person, imported: null, updatedAt: this.now() }
      : null;
  }
  private async updatePersonMemoryLinks(person: Person) {
    await this.clearBriefs();
    const memories = await this.list<MemoryRecord>("memory");
    const changed = memories
      .map((r) => r.value)
      .filter(
        (m) =>
          m.personIds.includes(person.id) &&
          m.source.kind === "meeting" &&
          !person.meetingIds.includes(m.source.id),
      );
    if (changed.length)
      await this.batch(
        changed.map((m) =>
          this.row(
            "memory",
            m.id,
            { ...m, personIds: m.personIds.filter((id) => id !== person.id) },
            this.memoryExpiry(m),
          ),
        ),
      );
  }
  private async removePersonLinks(id: string) {
    await this.clearBriefs();
    const memories = await this.list<MemoryRecord>("memory");
    const changed = memories
      .map((r) => r.value)
      .filter((m) => m.personIds.includes(id));
    if (changed.length)
      await this.batch(
        changed.map((m) =>
          this.row(
            "memory",
            m.id,
            { ...m, personIds: m.personIds.filter((person) => person !== id) },
            this.memoryExpiry(m),
          ),
        ),
      );
  }
  private async clearGooglePeople(
    service: GoogleService,
    subject: string | null,
  ): Promise<void> {
    if (service !== "contacts") return;
    const people = await this.list<Person>("person"),
      rows: WorkspaceRow[] = [],
      remove: { kind: WorkspaceKind; id: string }[] = [];
    for (const row of people) {
      if (
        !row.value.imported ||
        (subject && row.value.imported.subject !== subject)
      )
        continue;
      const person = this.withoutImported(row.value);
      if (person) rows.push(this.row("person", person.id, person));
      else remove.push({ kind: "person", id: row.id });
    }
    this.contactCandidates.clear();
    await this.batch(rows, [
      ...remove,
      { kind: "sync", id: "contacts-token" },
      { kind: "sync", id: "contacts-policy" },
    ]);
    for (const row of remove) await this.removePersonLinks(row.id);
    this.state.contactsAllSync = false;
    this.contactsAPI = this.accounts
      ? new ContactsAPI(this.accounts.contacts, this.now)
      : undefined;
  }
  private memoryExpiry(memory: MemoryRecord): number | null {
    return this.state.config.memoryRetentionDays === null
      ? null
      : memory.updatedAt + this.state.config.memoryRetentionDays * 86400000;
  }
  private meetingCurrent(doc: MeetingDocument, store: MeetingStore): boolean {
    const days = this.ports.meetings.value.preferences?.retentionDays ?? null;
    return (
      !this.ports.meetings.value.locked &&
      store.isCurrent(doc.id, doc.revision) &&
      (days === null || doc.updatedAt + days * 86400000 > this.now())
    );
  }
  private async memoryCommand(
    command: string,
    value: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const scope = this.state.scopeId;
    if (command === "rebuild-memory") {
      const input = record(value);
      exactKeys(input, ["meetingIds", "documentIds", "acknowledged"]);
      if (input.acknowledged !== true || !this.state.config.memoryEnabled)
        throw new Error(
          "Enable memory and acknowledge extraction from explicitly chosen saved sources.",
        );
      const meetingIds = ids(input.meetingIds),
        documentIds = ids(input.documentIds);
      if (
        meetingIds.length > 25 ||
        documentIds.length > 5 ||
        (!meetingIds.length && !documentIds.length)
      )
        throw new Error(
          "Choose 1–25 saved meetings and/or 1–5 enabled documents.",
        );
      const people = (await this.list<Person>("person")).map((r) => r.value),
        memories: MemoryRecord[] = [],
        guards: (() => boolean)[] = [];
      for (const id of meetingIds) {
        if (this.state.config.excludedMeetingIds.includes(id))
          throw new Error("This meeting is excluded from memory.");
        const store = this.ports.meetings.requireStore(),
          doc = await store.get(id);
        this.scope(scope);
        signal.throwIfAborted();
        const evidence = [
          ...doc.decisions,
          ...doc.actions,
          ...(doc.summary?.topics ?? []),
          ...(doc.summary?.outstanding ?? []),
          ...(doc.summary?.nextSteps ?? []),
        ]
          .flatMap((v) => v.evidence.map((e) => e.ref))
          .slice(0, 100);
        const segments = evidence.length
          ? await store.contextSegments(id, evidence)
          : [];
        this.scope(scope);
        guards.push(() => this.meetingCurrent(doc, store));
        memories.push(...meetingMemories(doc, segments, people, this.now()));
      }
      const personal = this.ports.personal.value,
        personalScope = personal?.scopeId,
        personalRevision = personal?.revision;
      for (const id of documentIds) {
        const doc = personal.documents.find((d) => d.id === id && d.enabled);
        if (!personal.unlocked || !doc)
          throw new Error("Unlock Knowledge and choose an enabled document.");
        const sections = await this.ports.personal.inspect({
          scopeId: personalScope,
          id,
        });
        this.scope(scope);
        memories.push(...documentMemories(doc, sections, this.now()));
      }
      if (documentIds.length)
        guards.push(
          () =>
            this.ports.personal.value.unlocked &&
            this.ports.personal.value.scopeId === personalScope &&
            this.ports.personal.value.revision === personalRevision,
        );
      if (guards.some((valid) => !valid()))
        throw new Error("A selected saved source changed. Rebuild again.");
      const existing = await this.list<MemoryRecord>("memory");
      const affected = (m: MemoryRecord) =>
        (m.source.kind === "meeting" && meetingIds.includes(m.source.id)) ||
        (m.source.kind === "document" && documentIds.includes(m.source.id));
      const keep = existing.filter((r) => !affected(r.value)),
        valid = memories.filter(
          (m) =>
            !m.personIds.some((id) =>
              this.state.config.excludedPersonIds.includes(id),
            ),
        );
      if (keep.length + valid.length > 1000)
        throw new Error(
          "Memory capacity is 1,000 records. Delete records or select fewer sources.",
        );
      signal.throwIfAborted();
      if (guards.some((g) => !g()))
        throw new Error("Source changed during memory rebuild.");
      this.invalidate();
      await this.clearBriefs();
      await this.batch(
        valid.map((m) => this.row("memory", m.id, m, this.memoryExpiry(m))),
        existing
          .filter((r) => affected(r.value))
          .map((r) => ({ kind: "memory", id: r.id })),
      );
      await this.counts();
      return { extracted: valid.length, pendingReview: true };
    }
    if (command === "save-memory") {
      const input = record(value);
      exactKeys(input, [
        "id",
        "updatedAt",
        "type",
        "description",
        "personIds",
        "topics",
        "status",
        "review",
      ]);
      if (!this.state.config.memoryEnabled)
        throw new Error("Enable local memory first.");
      const id = input.id === "new" ? randomUUID() : localId(input.id),
        old = await this.get<MemoryRecord>("memory", id);
      if (old && input.updatedAt !== old.updatedAt)
        throw new Error("Memory changed. Reload before editing.");
      if (!old && input.id !== "new") throw new Error("Memory was removed.");
      if (!old && this.state.memoryCount >= 1000)
        throw new Error("Memory capacity is 1,000 records.");
      if (
        ![
          "decision",
          "commitment",
          "action",
          "topic",
          "project",
          "follow-up",
          "note",
        ].includes(input.type as string) ||
        !["open", "done"].includes(input.status as string) ||
        !["pending", "approved"].includes(input.review as string)
      )
        throw new Error("Choose memory type, status and review state.");
      const personIds = ids(input.personIds);
      if (personIds.length > 5)
        throw new Error("Associate at most five local people.");
      for (const person of personIds) {
        if (
          this.state.config.excludedPersonIds.includes(person) ||
          !(await this.get("person", person))
        )
          throw new Error("Choose a current person who is not excluded.");
      }
      if (!Array.isArray(input.topics) || input.topics.length > 10)
        throw new Error("Choose up to ten topics.");
      const topics = input.topics.map((t) => text(t, 100, "Topic", true)),
        description = text(input.description, 800, "Memory description", true),
        now = Math.max(this.now(), (old?.updatedAt ?? 0) + 1);
      const memory: MemoryRecord = {
        id,
        type: input.type as MemoryRecord["type"],
        description,
        quote: old?.quote ?? description,
        ref: old?.ref ?? `user:${id}`,
        source: old?.source ?? {
          kind: "user",
          id,
          revision: 1,
          title: "User-authored memory",
        },
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        lastVerifiedAt: now,
        personIds,
        topics,
        status: input.status as MemoryRecord["status"],
        review: input.review as MemoryRecord["review"],
        authorship:
          old && old.description === description ? old.authorship : "user",
      };
      if (!(await this.sourceAvailable(memory)))
        throw new Error(
          "Memory source was removed, changed or excluded. Rebuild from a current source.",
        );
      this.scope(scope);
      this.invalidate();
      await this.clearBriefs();
      await this.batch([
        this.row("memory", id, memory, this.memoryExpiry(memory)),
      ]);
      await this.counts();
      return memory;
    }
    if (command === "delete-memory" || command === "delete-all-memory") {
      const input = record(value);
      exactKeys(
        input,
        command === "delete-memory" ? ["id", "acknowledged"] : ["acknowledged"],
      );
      if (input.acknowledged !== true)
        throw new Error("Acknowledge local memory deletion.");
      const remove =
        command === "delete-memory"
          ? [{ kind: "memory" as const, id: localId(input.id) }]
          : (await this.list("memory")).map((r) => ({
              kind: "memory" as const,
              id: r.id,
            }));
      this.invalidate();
      await this.clearBriefs();
      await this.batch([], remove);
      await this.counts();
      return null;
    }
    if (command === "memory") {
      const memory = await this.get<MemoryRecord>("memory", localId(value));
      return memory && (await this.sourceAvailable(memory)) ? memory : null;
    }
    if (command === "reconcile-sources") {
      await this.reconcileSources();
      return this.value;
    }
    if (command === "stage-live-context") {
      const selection = parseWorkspaceSelection(value);
      if (selection.purpose !== "live")
        throw new Error("Choose a Live context selection.");
      this.invalidate();
      const built = await this.buildContext("", selection);
      this.stagedLive = { ...built, selection };
      return built.context;
    }
    if (command === "clear-live-context") {
      this.invalidate();
      return null;
    }
    if (command === "event-associations")
      return this.associated(localId(value));
    if (command === "associate-meeting") {
      const input = record(value);
      exactKeys(input, ["eventId", "meetingId", "acknowledged"]);
      if (input.acknowledged !== true)
        throw new Error(
          "Confirm associating these independently saved records.",
        );
      const event = this.events.find((e) => e.id === localId(input.eventId));
      if (!event) throw new Error("Choose a cached event.");
      const meetingId = localId(input.meetingId),
        doc = await this.ports.meetings.requireStore().get(meetingId);
      this.scope(scope);
      const all = await this.list("association");
      if (all.length >= 1000)
        throw new Error("Maximum 1,000 calendar/history associations.");
      const id = opaqueId("association", event.id, meetingId),
        association: MeetingAssociation = {
          id,
          eventId: event.id,
          recurringId: event.recurringId,
          meetingId: doc.id,
          subject: event.subject,
          createdAt: this.now(),
        };
      this.invalidate();
      await this.batch([this.row("association", id, association)]);
      return this.associated(event.id);
    }
    if (command === "remove-association") {
      const id = localId(value);
      this.invalidate();
      await this.clearBriefs();
      await this.batch([], [{ kind: "association", id }]);
      return null;
    }
    if (command === "prepare-brief") {
      const input = record(value);
      exactKeys(input, ["selection", "knowledgeIds"]);
      const selection = parseWorkspaceSelection(input.selection);
      if (selection.purpose !== "brief" || !selection.eventId)
        throw new Error("Choose an event for the brief.");
      if (this.ports.assistant.value.selected !== "codex")
        throw new Error("Select ChatGPT for pre-call briefs.");
      await this.ports.assistant.prepare({
        question:
          "Prepare a pre-call brief for the selected event. Use the supplied references only; identify missing context. Include meeting overview and purpose, participants, previous discussions and decisions, outstanding commitments, related documents, talking points and questions, and a preparation checklist. Cite exact supplied references. Never invent objectives, biographies or relationships.",
        options: {
          microphone: false,
          systemAudio: false,
          screenshot: false,
          history: false,
          recentSeconds: 60,
          transcriptChars: 6000,
          totalChars: 30000,
          imageBytes: 1500000,
        },
        workspaceSelection: selection,
        knowledgeIds: ids(input.knowledgeIds),
      });
      this.scope(scope);
      return this.ports.assistant.value.review;
    }
    if (command === "saved-brief") {
      await this.reconcileSources();
      const brief = await this.get<SavedBrief>("brief", localId(value));
      if (brief && !(await this.briefCurrent(brief)))
        throw new Error(
          "Saved brief sources are locked, removed or changed. Unlock source stores or regenerate from current information.",
        );
      return brief;
    }
    if (command === "delete-brief") {
      this.invalidate();
      await this.batch([], [{ kind: "brief", id: localId(value) }]);
      await this.counts();
      return null;
    }
    if (command === "save-brief" || command === "export-brief") {
      const input = record(value);
      exactKeys(input, ["requestId", "acknowledged"]);
      if (input.acknowledged !== true)
        throw new Error(
          "Acknowledge saving this brief locally / exporting plaintext.",
        );
      const response = this.ports.assistant.value.responses.find(
        (r) =>
          r.requestId === input.requestId &&
          r.status === "completed" &&
          r.workspaceContext?.purpose === "brief",
      );
      const eventEntry = response?.workspaceContext?.entries.find(
        (e) => e.kind === "event",
      );
      if (
        !response ||
        !eventEntry ||
        !this.events.some(
          (e) =>
            e.id === eventEntry.id &&
            this.eventRevision(e) === eventEntry.updatedAt,
        )
      )
        throw new Error(
          "Choose a completed brief for the current event. Removed event context cannot be persisted.",
        );
      const brief: SavedBrief = {
        id: eventEntry.id,
        eventId: eventEntry.id,
        text: response.text,
        context: response.workspaceContext!,
        ...(response.knowledge ? { knowledge: response.knowledge } : {}),
        model: response.model,
        modeName: response.modeName ?? "General",
        createdAt: this.now(),
      };
      if (!(await this.briefCurrent(brief)))
        throw new Error(
          "Brief sources changed or are unavailable. Generate a fresh reviewed draft.",
        );
      this.scope(scope);
      if (command === "export-brief") {
        const epoch = this.epoch;
        return this.ports.exportText(
          "EveryHint pre-call brief.txt",
          `${eventEntry.title}\n${response.text}\n\nSources\n${brief.context.entries.map((e) => `${e.ref}: ${e.title}\n${e.sourceRef ?? ""}\n${e.text}`).join("\n\n")}\n\n${(brief.knowledge ?? []).map((k) => `${k.ref}: ${k.documentName} / ${k.heading}\n${k.text}`).join("\n\n")}`,
          () =>
            this.state.scopeId === scope &&
            this.state.unlocked &&
            epoch === this.epoch,
        );
      }
      if (!this.state.config.briefPersistence)
        throw new Error(
          "Explicitly enable brief persistence and retention in Settings before saving.",
        );
      const existing = await this.list("brief", 30);
      if (existing.length >= 30 && !existing.some((r) => r.id === brief.id))
        throw new Error(
          "Maximum 30 saved briefs. Delete an older brief before saving another.",
        );
      await this.batch([
        this.row(
          "brief",
          brief.id,
          brief,
          this.now() + this.state.config.briefRetentionDays * 86400000,
        ),
      ]);
      await this.counts();
      return brief;
    }
    throw new Error(`Unsupported workspace action: ${command}.`);
  }
  private async clearBriefs() {
    const rows = await this.list("brief");
    if (rows.length)
      await this.batch(
        [],
        rows.map((r) => ({ kind: "brief", id: r.id })),
      );
    this.state.preparedEventIds = [];
  }
  private async briefCurrent(brief: SavedBrief): Promise<boolean> {
    const scope = this.state.scopeId;
    for (const entry of brief.context.entries) {
      if (
        entry.kind === "event" &&
        !this.events.some(
          (e) =>
            e.id === entry.id &&
            this.eventRevision(e) === entry.updatedAt &&
            this.eventRef(e) === entry.sourceRef,
        )
      )
        return false;
      if (entry.kind === "person") {
        const p = await this.get<Person>("person", entry.id);
        if (
          !p ||
          p.updatedAt !== entry.updatedAt ||
          this.state.config.excludedPersonIds.includes(p.id)
        )
          return false;
      }
      if (entry.kind === "memory") {
        const m = await this.get<MemoryRecord>("memory", entry.id);
        if (
          !m ||
          m.updatedAt !== entry.updatedAt ||
          m.review !== "approved" ||
          !(await this.sourceAvailable(m))
        )
          return false;
      }
      if (entry.kind === "meeting") {
        if (
          this.ports.meetings.value.locked ||
          this.state.config.excludedMeetingIds.includes(entry.id)
        )
          return false;
        try {
          const doc = await this.ports.meetings.requireStore().get(entry.id);
          if (
            doc.updatedAt !== entry.updatedAt ||
            entry.sourceRef !== `meeting:${doc.id}@${doc.revision}` ||
            !this.meetingCurrent(doc, this.ports.meetings.requireStore())
          )
            return false;
        } catch {
          return false;
        }
      }
      this.scope(scope);
    }
    if (brief.knowledge?.length) {
      const personal = this.ports.personal.value;
      if (!personal.unlocked) return false;
      for (const excerpt of brief.knowledge) {
        const doc = personal.documents.find(
          (d) => d.id === excerpt.documentId && d.enabled,
        );
        if (!doc || doc.updatedAt > brief.createdAt) return false;
        const sections = await this.ports.personal.inspect({
          scopeId: personal.scopeId,
          id: doc.id,
        });
        if (
          !sections.some(
            (s) => s.id === excerpt.id && s.text.includes(excerpt.text),
          )
        )
          return false;
        this.scope(scope);
      }
    }
    return true;
  }
  private eventRevision(event: CalendarEvent) {
    const time = Date.parse(event.updated);
    return Number.isFinite(time) ? time : event.fetchedAt;
  }
  private eventRef(event: CalendarEvent) {
    return opaqueId(
      "calendar-version",
      JSON.stringify({ ...event, fetchedAt: 0 }),
    );
  }
  private async sourceAvailable(
    memory: MemoryRecord,
    enforceEnabled = true,
  ): Promise<boolean> {
    if (
      (enforceEnabled && !this.state.config.memoryEnabled) ||
      memory.personIds.some((id) =>
        this.state.config.excludedPersonIds.includes(id),
      )
    )
      return false;
    if (memory.source.kind === "user") return true;
    if (memory.source.kind === "document") {
      const p = this.ports.personal.value;
      return (
        p.unlocked &&
        p.documents.some(
          (d) =>
            d.id === memory.source.id &&
            d.enabled &&
            d.updatedAt === memory.source.revision,
        )
      );
    }
    if (
      this.state.config.excludedMeetingIds.includes(memory.source.id) ||
      this.ports.meetings.value.locked
    )
      return false;
    try {
      const doc = await this.ports.meetings
        .requireStore()
        .get(memory.source.id);
      return (
        doc.revision === memory.source.revision &&
        this.meetingCurrent(doc, this.ports.meetings.requireStore())
      );
    } catch {
      return false;
    }
  }
  /** Source mutation/deletion invalidates remote permission even when caches are locked. */
  async sourceChanged(
    kind: "meeting" | "document",
    id?: string,
  ): Promise<void> {
    this.invalidate();
    if (!this.state.unlocked) return;
    const memories = await this.list<MemoryRecord>("memory");
    const remove = id
      ? memories
          .filter(
            (r) => r.value.source.kind === kind && r.value.source.id === id,
          )
          .map((r) => ({ kind: "memory" as const, id: r.id }))
      : [];
    await this.clearBriefs();
    await this.batch([], remove);
    await this.reconcileSources();
    await this.counts();
    this.publish();
  }
  async reconcileSources(): Promise<void> {
    if (!this.state.unlocked) return;
    const scope = this.state.scopeId,
      remove: { kind: WorkspaceKind; id: string }[] = [],
      memories = await this.list<MemoryRecord>("memory");
    for (const { id, value: m } of memories) {
      const expired =
          this.memoryExpiry(m) !== null && this.memoryExpiry(m)! <= this.now(),
        excluded =
          m.personIds.some((p) =>
            this.state.config.excludedPersonIds.includes(p),
          ) ||
          (m.source.kind === "meeting" &&
            this.state.config.excludedMeetingIds.includes(m.source.id));
      if (expired || excluded) {
        remove.push({ kind: "memory", id });
        continue;
      }
      if (
        (m.source.kind === "meeting" && this.ports.meetings.value.locked) ||
        (m.source.kind === "document" && !this.ports.personal.value?.unlocked)
      )
        continue;
      if (!(await this.sourceAvailable(m, false)))
        remove.push({ kind: "memory", id });
      this.scope(scope);
    }
    if (!this.ports.meetings.value.locked) {
      const associations = await this.list<MeetingAssociation>("association"),
        people = await this.list<Person>("person"),
        missing = new Set<string>();
      for (const id of new Set([
        ...associations.map((r) => r.value.meetingId),
        ...people.flatMap((r) => r.value.meetingIds),
      ])) {
        try {
          await this.ports.meetings.requireStore().get(id);
        } catch {
          missing.add(id);
        }
        this.scope(scope);
      }
      for (const a of associations)
        if (missing.has(a.value.meetingId))
          remove.push({ kind: "association", id: a.id });
      const changed = people
        .filter((r) => r.value.meetingIds.some((id) => missing.has(id)))
        .map((r) =>
          this.row("person", r.id, {
            ...r.value,
            meetingIds: r.value.meetingIds.filter((id) => !missing.has(id)),
          }),
        );
      if (changed.length) await this.batch(changed);
    }
    if (remove.length) {
      this.invalidate();
      await this.clearBriefs();
      await this.batch([], remove);
      await this.counts();
    }
  }
  private async associated(eventId: string) {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error("Choose a cached event.");
    const scope = this.state.scopeId,
      rows = (await this.list<MeetingAssociation>("association"))
        .map((r) => r.value)
        .filter(
          (a) =>
            a.subject === event.subject &&
            (a.eventId === eventId ||
              Boolean(
                event.recurringId && a.recurringId === event.recurringId,
              )),
        ),
      items = [];
    if (!this.ports.meetings.value.locked)
      for (const association of rows) {
        try {
          const doc = await this.ports.meetings
            .requireStore()
            .get(association.meetingId);
          this.scope(scope);
          items.push({
            association,
            title: doc.title,
            notes: doc.notes.slice(0, 2000),
            actions: doc.actions
              .filter((a) => a.status === "open" || a.status === "in-progress")
              .slice(0, 10),
          });
        } catch {
          /* Missing independent history is omitted. */
        }
      }
    return { items, historyLocked: this.ports.meetings.value.locked };
  }
  async buildContext(
    _query: string,
    raw: WorkspaceSelection,
  ): Promise<{ context: WorkspaceAIContext; valid: () => boolean }> {
    const selection = parseWorkspaceSelection(raw),
      scope = this.state.scopeId,
      epoch = this.epoch;
    this.requireStore();
    const entries: WorkspaceExcerpt[] = [],
      checks: (() => boolean)[] = [];
    const add = (
      kind: WorkspaceExcerpt["kind"],
      id: string,
      title: string,
      body: string,
      updatedAt: number,
      sourceRef: string | null = null,
    ) =>
      entries.push({
        ref: `workspace:${kind}:${id}`,
        kind,
        id,
        title: title.slice(0, 200),
        text: body.slice(0, 1800),
        sourceRef,
        updatedAt,
      });
    if (selection.eventId) {
      const event = this.events.find((e) => e.id === selection.eventId);
      if (!event)
        throw new Error(
          "Selected event no longer exists in the current cache.",
        );
      add(
        "event",
        event.id,
        event.title,
        JSON.stringify({
          title: event.title,
          start: event.startDate ?? new Date(event.startAt).toISOString(),
          end: event.endDate ?? new Date(event.endAt).toISOString(),
          timeZone: event.timeZone,
          location: event.location,
          ...(selection.description
            ? { description: event.description.slice(0, 1500) }
            : {}),
        }),
        this.eventRevision(event),
        this.eventRef(event),
      );
      checks.push(() => event.endAt + 7 * 86400000 > this.now());
    }
    for (const id of selection.personIds) {
      if (this.state.config.excludedPersonIds.includes(id))
        throw new Error("This person is excluded from cross-meeting context.");
      const person = await this.get<Person>("person", id);
      if (!person) throw new Error("Selected person was removed.");
      add(
        "person",
        id,
        personName(person),
        JSON.stringify({
          userFacts: person.manual,
          importedSnapshot: person.imported
            ? {
                name: person.imported.name,
                email: personEmail(person),
                organisation: person.imported.organisation,
                jobTitle: person.imported.jobTitle,
                retrievedAt: person.imported.retrievedAt,
              }
            : null,
          userNotes: person.notes.slice(0, 1000),
        }),
        person.updatedAt,
      );
    }
    for (const id of selection.memoryIds) {
      const memory = await this.get<MemoryRecord>("memory", id);
      if (
        !memory ||
        memory.review !== "approved" ||
        !(await this.sourceAvailable(memory))
      )
        throw new Error(
          "Select only reviewed memories with available, current sources.",
        );
      add(
        "memory",
        id,
        memory.description,
        JSON.stringify({
          type: memory.type,
          description: memory.description,
          evidence: memory.quote,
          status: memory.status,
          authorship: memory.authorship,
          source: memory.source.title,
        }),
        memory.updatedAt,
        memory.ref,
      );
      checks.push(
        () =>
          this.memoryExpiry(memory) === null ||
          this.memoryExpiry(memory)! > this.now(),
      );
      if (memory.source.kind === "meeting") {
        const store = this.ports.meetings.requireStore(),
          doc = await store.get(memory.source.id);
        this.scope(scope);
        checks.push(
          () =>
            doc.revision === memory.source.revision &&
            this.meetingCurrent(doc, store),
        );
      }
      if (memory.source.kind === "document") {
        const personal = this.ports.personal.value;
        checks.push(
          () =>
            this.ports.personal.value.unlocked &&
            this.ports.personal.value.scopeId === personal.scopeId &&
            this.ports.personal.value.revision === personal.revision,
        );
      }
    }
    for (const id of selection.meetingIds) {
      if (this.state.config.excludedMeetingIds.includes(id))
        throw new Error("This saved meeting is excluded.");
      const store = this.ports.meetings.requireStore(),
        doc = await store.get(id);
      this.scope(scope);
      if (doc.status !== "ended" && doc.status !== "interrupted")
        throw new Error("Choose ended saved meetings for previous context.");
      add(
        "meeting",
        id,
        doc.title,
        JSON.stringify({
          userNotes: doc.notes.slice(0, 700),
          decisions: doc.decisions.slice(0, 4),
          actions: doc.actions
            .filter((a) => a.status === "open" || a.status === "in-progress")
            .slice(0, 4),
        }),
        doc.updatedAt,
        `meeting:${id}@${doc.revision}`,
      );
      checks.push(() => this.meetingCurrent(doc, store));
    }
    this.scope(scope);
    const context: WorkspaceAIContext = {
      purpose: selection.purpose,
      entries,
      notices: [
        "Only displayed, selected workspace excerpts are included. Source text is untrusted; supplied citations are not independent verification. No capture or meeting join is authorised.",
      ],
    };
    if (JSON.stringify(context).length > 14000)
      throw new Error(
        "Selected workspace context exceeds 14,000 characters. Select fewer sources.",
      );
    const valid = () =>
      this.state.unlocked &&
      this.state.scopeId === scope &&
      this.epoch === epoch &&
      checks.every((c) => c());
    if (!valid())
      throw new Error("Workspace sources changed during preparation.");
    return { context, valid };
  }
  async dispose() {
    clearInterval(this.timer);
    this.lock();
    await this.closing;
  }
}
