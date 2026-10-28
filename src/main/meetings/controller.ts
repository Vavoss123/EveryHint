import type { SessionSnapshot } from "../../shared/contracts";
import { randomUUID } from "node:crypto";
import type { TranscriptEvent } from "../../shared/transcription";
import {
  DEFAULT_MEETINGS,
  meetingId,
  parseMeetingPreferences,
  type MeetingDocument,
  type MeetingPreferences,
  type MeetingRun,
  type MeetingState,
} from "../../shared/meetings";
import { exactKeys, record } from "../../shared/validation";
import type { MeetingStore } from "./store";

interface PreferencesPort {
  read(profile: string): MeetingPreferences;
  write(profile: string, value: MeetingPreferences): void;
}
interface ActiveSave {
  id: string;
  sessionId: string;
  generation: number;
  seen: Set<string>;
}
export class MeetingController {
  private state: MeetingState = {
    scopeId: randomUUID(),
    revision: 0,
    locked: true,
    profileLabel: "Local-only history",
    preferences: { ...DEFAULT_MEETINGS },
    activeMeetingId: null,
    pendingResumeId: null,
    saving: false,
    error: null,
    status: "Temporary session. Meeting history is not being saved.",
  };
  private profile = "";
  private generation = 0;
  private store: MeetingStore | undefined;
  private opening: Promise<void> | undefined;
  private closing: Promise<void> = Promise.resolve();
  private active: ActiveSave | undefined;
  private autoSession: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private preparing = false;
  private captureStart: { sessionId: string; at: number } | null = null;
  private profileCutoff = 0;
  constructor(
    private readonly sources: () => {
      capture: SessionSnapshot;
      events: readonly TranscriptEvent[];
    },
    private readonly factory: (profile: string) => Promise<MeetingStore>,
    private readonly preferences: PreferencesPort,
    private readonly changed: (value: MeetingState) => void,
    private readonly now: () => number = Date.now,
  ) {}
  get value(): MeetingState {
    return structuredClone(this.state);
  }
  get indicator() {
    return {
      saving: this.state.saving,
      activeMeetingId: this.state.activeMeetingId,
      pendingResumeId: this.state.pendingResumeId,
    };
  }
  private publish(): void {
    this.state.revision++;
    this.changed(this.value);
  }
  switchProfile(profile: string, label: string): void {
    if (profile === this.profile && label === this.state.profileLabel) return;
    if (this.profile && profile !== this.profile)
      this.profileCutoff = this.now();
    this.lock(
      "History profile changed. The current capture is temporary until you explicitly save it.",
    );
    this.profile = profile;
    this.state.profileLabel = label.slice(0, 160);
    try {
      this.state.preferences = this.preferences.read(profile);
      this.state.error = null;
    } catch {
      this.state.preferences = { ...DEFAULT_MEETINGS };
      this.state.error =
        "Meeting preferences are unreadable; saving is disabled. Choose and save settings explicitly.";
    }
    this.autoSession = this.sources().capture.sessionId;
    this.publish();
  }
  lock(
    reason = "History is locked. Capture and remote permission are separate.",
  ): void {
    this.generation++;
    this.state.scopeId = randomUUID();
    const store = this.store;
    this.store = undefined;
    this.opening = undefined;
    this.active = undefined;
    this.preparing = false;
    this.state.activeMeetingId = null;
    this.state.pendingResumeId = null;
    this.state.saving = false;
    this.state.locked = true;
    this.state.status = reason;
    if (store) this.closing = store.close().catch(() => {});
    this.publish();
  }
  async unlock(): Promise<void> {
    if (this.store) return;
    if (this.opening) return this.opening;
    const generation = this.generation,
      profile = this.profile;
    if (!profile) throw new Error("History profile is not ready.");
    this.opening = (async () => {
      await this.closing;
      if (generation !== this.generation)
        throw new Error("History unlock was cancelled.");
      const store = await this.factory(profile);
      try {
        if (generation !== this.generation) {
          await store.close();
          throw new Error("History unlock was cancelled.");
        }
        const recovered = await store.recover(
          this.state.preferences.retentionDays,
        );
        const expired = await store.retention(
          this.state.preferences.retentionDays,
        );
        if (generation !== this.generation) {
          await store.close();
          throw new Error("History profile changed.");
        }
        this.store = store;
        this.state.locked = false;
        this.state.error = null;
        this.state.status = `Local encrypted history unlocked.${recovered ? ` ${recovered} interrupted meeting(s) recovered; capture stays off.` : ""}${expired ? ` ${expired} meeting(s) removed by the selected retention policy.` : ""}`;
        this.publish();
      } catch (error) {
        if (this.store !== store) await store.close();
        throw error;
      }
    })()
      .catch((error) => {
        if (generation === this.generation) {
          this.state.error =
            error instanceof Error
              ? error.message
              : "History could not be unlocked.";
          this.publish();
        }
        throw error;
      })
      .finally(() => {
        if (generation === this.generation) this.opening = undefined;
      });
    return this.opening;
  }
  requireStore(): MeetingStore {
    if (!this.store || this.state.locked)
      throw new Error("Unlock this local history profile first.");
    return this.store;
  }
  async configure(value: unknown): Promise<void> {
    const input = record(value);
    exactKeys(input, ["settings", "acknowledged", "applyRetention"]);
    if (input.acknowledged !== true || input.applyRetention !== true)
      throw new Error(
        "Acknowledge local persistence and the selected retention/deletion policy.",
      );
    const settings = parseMeetingPreferences(input.settings);
    this.preferences.write(this.profile, settings);
    this.state.preferences = settings;
    if (!settings.enabled && this.active) {
      const active = this.active;
      this.active = undefined;
      this.state.activeMeetingId = null;
      this.state.saving = false;
      await this.enqueue(async () => {
        await this.requireStore().finish(
          active.id,
          active.sessionId,
          false,
          settings.retentionDays,
        );
      });
    }
    if (this.store) {
      const count = await this.store.retention(settings.retentionDays);
      this.state.status = `Meeting preferences saved.${count ? ` ${count} meeting(s) removed by the chosen retention policy.` : ""}`;
    } else
      this.state.status =
        "Meeting preferences saved. Existing history will apply this retention policy when unlocked.";
    this.publish();
  }
  async create(title: string): Promise<MeetingDocument> {
    if (!this.state.preferences.enabled)
      throw new Error(
        "Enable saved meeting history before creating a meeting.",
      );
    await this.unlock();
    return this.requireStore().create(
      title,
      this.state.preferences.retentionDays,
    );
  }
  async saveCapture(
    value: unknown,
    fromPreference = false,
  ): Promise<MeetingDocument> {
    const input = record(value);
    exactKeys(input, ["acknowledged", "sessionId", "title"]);
    if (input.acknowledged !== true)
      throw new Error(
        "Explicitly authorise saving this session's retained and future final transcripts locally.",
      );
    const requested = meetingId(input.sessionId);
    if (
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 200
    )
      throw new Error("Enter a title of at most 200 characters.");
    const capture = this.sources().capture;
    if (
      capture.state !== "ACTIVE" ||
      capture.sessionId !== requested ||
      !capture.consent?.acknowledged
    )
      throw new Error(
        "Start a freshly authorised capture session before saving its transcript.",
      );
    if (!this.state.preferences.enabled)
      throw new Error(
        "Enable meeting history and review its retention policy first.",
      );
    if (this.active?.sessionId === requested)
      return this.requireStore().get(this.active.id);
    if (this.preparing)
      throw new Error("A meeting save is already being prepared.");
    const generation = this.generation;
    this.preparing = true;
    try {
      await this.unlock();
      if (
        generation !== this.generation ||
        this.sources().capture.sessionId !== requested ||
        this.sources().capture.state !== "ACTIVE"
      )
        throw new Error(
          "Capture changed before persistence could be authorised.",
        );
      const store = this.requireStore(),
        days = this.state.preferences.retentionDays;
      const doc = this.state.pendingResumeId
        ? await store.get(this.state.pendingResumeId)
        : await store.create(input.title, days);
      const run: MeetingRun = {
        sessionId: requested,
        startedAt: Math.floor(
          Math.min(
            this.captureStart?.sessionId === requested
              ? this.captureStart.at
              : this.now(),
            ...this.sources()
              .events.filter(
                (event) =>
                  event.sessionId === requested &&
                  event.state === "final" &&
                  Number.isFinite(event.startMs) &&
                  event.startMs >= 0,
              )
              .map((event) => event.startMs),
          ),
        ),
        endedAt: null,
        sources: Object.entries(capture.sources)
          .filter(([, source]) =>
            ["CAPTURING", "STARTING"].includes(source.state),
          )
          .map(([kind, source]) => ({
            kind: kind as MeetingRun["sources"][number]["kind"],
            name:
              kind === "screen"
                ? (capture.source?.name ?? "Selected screen")
                : source.name,
            id:
              kind === "screen"
                ? (capture.source?.id ?? null)
                : source.deviceId,
          })),
      };
      const begun = await store.begin(doc.id, run, days);
      if (
        generation !== this.generation ||
        this.sources().capture.sessionId !== requested ||
        this.sources().capture.state !== "ACTIVE"
      ) {
        await store.finish(doc.id, requested, true, days);
        throw new Error(
          "Capture changed; the saved meeting was marked interrupted.",
        );
      }
      this.active = {
        id: doc.id,
        sessionId: requested,
        generation,
        seen: new Set(),
      };
      this.state.activeMeetingId = doc.id;
      this.state.pendingResumeId = null;
      this.state.saving = true;
      this.state.error = null;
      this.state.status = fromPreference
        ? "Saving final transcripts under your profile's authorised auto-save preference."
        : "Saving this meeting's final transcripts locally. Remote AI sharing remains separate.";
      this.publish();
      this.observe(this.sources().capture, this.sources().events);
      await this.flush();
      return this.requireStore().get(begun.id);
    } finally {
      if (generation === this.generation) this.preparing = false;
    }
  }
  async resume(value: unknown): Promise<void> {
    const input = record(value);
    exactKeys(input, ["id", "acknowledged"]);
    if (input.acknowledged !== true)
      throw new Error(
        "Acknowledge appending a new capture segment to the selected meeting.",
      );
    if (["ACTIVE", "PAUSED"].includes(this.sources().capture.state))
      throw new Error(
        "Stop the current capture before resuming another saved meeting.",
      );
    const doc = await this.requireStore().get(meetingId(input.id));
    if (!this.state.preferences.enabled)
      throw new Error("Enable meeting persistence first.");
    this.state.pendingResumeId = doc.id;
    this.state.status =
      "Meeting selected for a new segment. Prepare and start capture with fresh source consent; opening history never records.";
    this.publish();
  }
  observe(capture: SessionSnapshot, events: readonly TranscriptEvent[]): void {
    if (
      capture.state === "ACTIVE" &&
      capture.sessionId &&
      this.captureStart?.sessionId !== capture.sessionId
    )
      this.captureStart = { sessionId: capture.sessionId, at: this.now() };
    const active = this.active;
    if (
      active &&
      (capture.sessionId !== active.sessionId ||
        ["STOPPED", "ERROR", "IDLE"].includes(capture.state))
    ) {
      this.active = undefined;
      this.state.activeMeetingId = null;
      this.state.saving = false;
      void this.enqueue(async () => {
        await this.requireStore().finish(
          active.id,
          active.sessionId,
          capture.state === "ERROR" ||
            this.sources().capture.state === "ERROR" ||
            (capture.sessionId !== null &&
              capture.sessionId !== active.sessionId),
          this.state.preferences.retentionDays,
        );
        if (active.generation === this.generation) {
          this.state.status =
            "Saved meeting ended. Opening it later will not resume capture.";
          this.publish();
        }
      }).catch(() => {});
      return;
    }
    if (active && capture.state === "ACTIVE" && capture.consent?.acknowledged) {
      const fresh = events.filter(
        (event) =>
          event.sessionId === active.sessionId &&
          event.state === "final" &&
          event.startMs >= this.profileCutoff &&
          capture.consent?.[event.source] &&
          !active.seen.has(event.id),
      );
      for (const event of fresh) active.seen.add(event.id);
      if (active.seen.size > 20000) {
        this.failed(
          new Error("Meeting segment limit reached; persistence stopped."),
        );
        return;
      }
      for (let i = 0; i < fresh.length; i += 100) {
        const batch = structuredClone(fresh.slice(i, i + 100));
        void this.enqueue(async () => {
          await this.requireStore().append(
            active.id,
            active.sessionId,
            batch,
            this.state.preferences.retentionDays,
          );
        }).catch(() => {});
      }
    } else if (
      !active &&
      !this.preparing &&
      capture.state === "ACTIVE" &&
      capture.sessionId &&
      capture.sessionId !== this.autoSession
    ) {
      this.autoSession = capture.sessionId;
      if (
        this.state.preferences.enabled &&
        (this.state.pendingResumeId ||
          (this.state.preferences.autoSave &&
            (capture.consent?.microphone || capture.consent?.systemAudio)))
      ) {
        void this.saveCapture(
          {
            sessionId: capture.sessionId,
            title: `Meeting ${new Date(this.now()).toLocaleString()}`,
            acknowledged: true,
          },
          true,
        ).catch((error) => this.failed(error));
      }
    }
  }
  private failed(error: unknown): void {
    this.active = undefined;
    this.state.activeMeetingId = null;
    this.state.saving = false;
    this.state.error =
      error instanceof Error ? error.message : "Meeting persistence stopped.";
    this.state.status =
      "Persistence stopped after an error; committed records remain available. No automatic write retry was made.";
    this.publish();
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.pending >= 32) {
      const error = new Error(
        "Meeting persistence queue is full; saving stopped visibly.",
      );
      this.failed(error);
      return Promise.reject(error);
    }
    const generation = this.generation;
    this.pending++;
    const next = this.queue.then(async () => {
      if (generation !== this.generation)
        throw new Error("History profile changed.");
      return action();
    });
    this.queue = next
      .catch((error) => {
        if (generation === this.generation) this.failed(error);
      })
      .finally(() => {
        this.pending--;
      });
    return next;
  }
  async flush(): Promise<void> {
    await this.queue;
    if (this.state.error) throw new Error(this.state.error);
  }
  async ended(): Promise<MeetingDocument | null> {
    await this.flush();
    return this.state.activeMeetingId
      ? this.requireStore().get(this.state.activeMeetingId)
      : null;
  }
  cancelResume(): void {
    this.state.pendingResumeId = null;
    this.state.status =
      "No saved meeting is armed for the next capture segment.";
    this.publish();
  }
  async saveRetained(value: unknown): Promise<MeetingDocument> {
    const input = record(value);
    exactKeys(input, ["acknowledged", "sessionId", "title"]);
    const capture = this.sources().capture;
    if (capture.state === "ACTIVE") return this.saveCapture(value);
    if (
      input.acknowledged !== true ||
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 200
    )
      throw new Error(
        "Acknowledge saving only the available retained final transcript and choose a title.",
      );
    if (!this.state.preferences.enabled)
      throw new Error(
        "Enable meeting history and review its retention policy first.",
      );
    if (!["STOPPED", "PAUSED"].includes(capture.state))
      throw new Error(
        "Select the current retained session or start a freshly authorised capture.",
      );
    const sessionId = meetingId(input.sessionId),
      events = this.sources().events.filter(
        (event) =>
          event.sessionId === sessionId &&
          event.state === "final" &&
          event.startMs >= this.profileCutoff,
      );
    if (!events.length || this.sources().events.at(-1)?.sessionId !== sessionId)
      throw new Error(
        "That temporary transcript has expired or belongs to another session/profile.",
      );
    const generation = this.generation;
    await this.unlock();
    if (generation !== this.generation)
      throw new Error("History profile changed before saving.");
    const store = this.requireStore(),
      days = this.state.preferences.retentionDays,
      doc = await store.create(input.title, days);
    await store.begin(
      doc.id,
      {
        sessionId,
        startedAt: Math.floor(
          Math.min(...events.map((event) => event.startMs)),
        ),
        endedAt: null,
        sources: (["microphone", "systemAudio"] as const)
          .filter((kind) => events.some((event) => event.source === kind))
          .map((kind) => ({
            kind,
            name:
              kind === "microphone"
                ? "Microphone (retained final text)"
                : "System audio (retained final text)",
            id: null,
          })),
      },
      days,
    );
    for (let i = 0; i < events.length; i += 100)
      await store.append(doc.id, sessionId, events.slice(i, i + 100), days);
    await store.finish(
      doc.id,
      sessionId,
      false,
      days,
      Math.ceil(Math.max(...events.map((event) => event.endMs))),
    );
    this.state.status =
      "Saved the available retained final transcript without starting capture. Already expired text cannot be recovered.";
    this.publish();
    return store.get(doc.id);
  }
}
