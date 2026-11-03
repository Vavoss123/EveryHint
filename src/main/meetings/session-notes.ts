import { SUMMARY_SECTIONS } from "../../shared/meeting-ai";
import type { MeetingAIController } from "./ai";
import type { MeetingController } from "./controller";
import type { SessionNotesStatus } from "../../shared/contracts";

const DRAFT_TIMEOUT_MS = 180_000;

/**
 * Saves a session and its AI notes when the user chose that at Start: the
 * transcript is saved live through meeting auto-save, and notes are written
 * into that meeting when the session ends.
 */
export class SessionNotes {
  private enabled = false;
  private run = 0;
  private state: SessionNotesStatus | null = null;
  constructor(
    private readonly meetings: MeetingController,
    private readonly ai: MeetingAIController,
    private readonly changed: () => void,
    private readonly pause = (ms: number) =>
      new Promise<void>((done) => setTimeout(done, ms)),
  ) {}
  get status(): SessionNotesStatus | null {
    return this.state ? { ...this.state } : null;
  }
  private report(status: SessionNotesStatus | null): void {
    this.state = status;
    this.changed();
  }
  /** Called at Start with the user's choice for this session. */
  async start(save: unknown): Promise<void> {
    if (typeof save !== "boolean")
      throw new Error("Choose whether to save this session.");
    this.run++;
    this.enabled = save;
    this.report(null);
    const preferences = this.meetings.value.preferences;
    if (preferences.autoSave !== save || (save && !preferences.enabled))
      // Ticking "Save this session" at Start is the persistence acknowledgement.
      await this.meetings.configure({
        settings: {
          ...preferences,
          enabled: preferences.enabled || save,
          autoSave: save,
        },
        acknowledged: true,
        applyRetention: true,
      });
    if (save) await this.meetings.unlock();
  }
  /** Called once when a session ends, with the meeting it was saved into. */
  async finish(meetingId: string | null): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;
    const run = ++this.run;
    const permit = () => run === this.run;
    if (!meetingId) {
      this.report({
        message:
          "Nothing was saved because no microphone or system audio was captured.",
        meetingId: null,
        working: false,
      });
      return;
    }
    this.report({
      message: "Session saved. Writing notes…",
      meetingId,
      working: true,
    });
    try {
      await this.meetings.flush();
      const reviewId = await this.ai.prepare(
        {
          purpose: "summary",
          meetingIds: [meetingId],
          temporary: false,
          question: "",
          sources: { microphone: true, systemAudio: true, notes: false },
          segmentIds: [],
          sections: [...SUMMARY_SECTIONS],
        },
        true,
        permit,
      );
      await this.ai.ask({ reviewId, acknowledged: true }, permit);
      const draft = await this.draft(permit);
      await this.ai.apply({
        draftId: draft.id,
        meetingId,
        expectedRevision: draft.expectedRevision,
        sections: draft.sections,
        overwriteManual: false,
      });
      if (permit())
        this.report({
          message: "Session saved with notes.",
          meetingId,
          working: false,
        });
    } catch (error) {
      if (permit())
        this.report({
          message: `Session saved, but notes could not be written: ${
            error instanceof Error ? error.message : "unknown error"
          } Open the meeting to generate them.`,
          meetingId,
          working: false,
        });
    }
  }
  private async draft(permit: () => boolean) {
    const deadline = Date.now() + DRAFT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!permit()) throw new Error("A new session started.");
      const value = this.ai.value;
      if (value.status === "draft" && value.draft) return value.draft;
      if (value.status === "error")
        throw new Error(value.error ?? "The AI request failed.");
      await this.pause(250);
    }
    throw new Error("The AI took too long to answer.");
  }
  /** Stops any pending notes work, for example when the app quits. */
  cancel(): void {
    this.run++;
    this.enabled = false;
  }
}
