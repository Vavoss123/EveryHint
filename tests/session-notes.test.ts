import { describe, expect, it, vi } from "vitest";
import { SessionNotes } from "../src/main/meetings/session-notes";
import type { MeetingAIController } from "../src/main/meetings/ai";
import type { MeetingController } from "../src/main/meetings/controller";
import { SUMMARY_SECTIONS } from "../src/shared/meeting-ai";

function setup(
  preferences = { enabled: false, autoSave: false, retentionDays: 30 },
) {
  const meetings = {
    value: { preferences },
    configure: vi.fn(async (input: { settings: typeof preferences }) => {
      meetings.value.preferences = input.settings;
    }),
    unlock: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
  };
  const draft = {
    id: "draft-1",
    meetingId: "m1",
    expectedRevision: 4,
    sections: ["overview", "actions"],
  };
  const ai = {
    value: {
      status: "idle",
      draft: null as typeof draft | null,
      error: null as string | null,
    },
    prepare: vi.fn(async () => "review-1"),
    ask: vi.fn(async () => {
      ai.value = { status: "draft", draft, error: null };
    }),
    apply: vi.fn(async () => ({})),
  };
  const changed = vi.fn();
  const notes = new SessionNotes(
    meetings as unknown as MeetingController,
    ai as unknown as MeetingAIController,
    changed,
    async () => {},
  );
  return { meetings, ai, notes, draft, changed };
}

describe("saving a session with notes", () => {
  it("turns on live saving at Start and unlocks history", async () => {
    const s = setup();
    await s.notes.start(true);
    expect(s.meetings.configure).toHaveBeenCalledWith({
      settings: { enabled: true, autoSave: true, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    expect(s.meetings.unlock).toHaveBeenCalled();
  });
  it("turns live saving off when the user unticks it", async () => {
    const s = setup({ enabled: true, autoSave: true, retentionDays: 30 });
    await s.notes.start(false);
    expect(s.meetings.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { enabled: true, autoSave: false, retentionDays: 30 },
      }),
    );
    expect(s.meetings.unlock).not.toHaveBeenCalled();
    await s.notes.finish("m1");
    expect(s.ai.prepare).not.toHaveBeenCalled();
    expect(s.notes.status).toBeNull();
  });
  it("leaves preferences alone when they already match", async () => {
    const s = setup({ enabled: true, autoSave: true, retentionDays: 30 });
    await s.notes.start(true);
    expect(s.meetings.configure).not.toHaveBeenCalled();
  });
  it("writes whole-session notes into the saved meeting at the end", async () => {
    const s = setup();
    await s.notes.start(true);
    await s.notes.finish("m1");
    expect(s.meetings.flush).toHaveBeenCalled();
    expect(s.ai.prepare).toHaveBeenCalledWith(
      {
        purpose: "summary",
        meetingIds: ["m1"],
        temporary: false,
        question: "",
        sources: { microphone: true, systemAudio: true, notes: false },
        segmentIds: [],
        sections: [...SUMMARY_SECTIONS],
      },
      true,
      expect.any(Function),
    );
    expect(s.ai.ask).toHaveBeenCalledWith(
      { reviewId: "review-1", acknowledged: true },
      expect.any(Function),
    );
    expect(s.ai.apply).toHaveBeenCalledWith({
      draftId: "draft-1",
      meetingId: "m1",
      expectedRevision: 4,
      sections: ["overview", "actions"],
      overwriteManual: false,
    });
    expect(s.notes.status).toEqual({
      message: "Session saved with notes.",
      meetingId: "m1",
      working: false,
    });
  });
  it("runs only once per Start", async () => {
    const s = setup();
    await s.notes.start(true);
    await s.notes.finish("m1");
    await s.notes.finish("m1");
    expect(s.ai.prepare).toHaveBeenCalledTimes(1);
  });
  it("explains when no audio was captured", async () => {
    const s = setup();
    await s.notes.start(true);
    await s.notes.finish(null);
    expect(s.ai.prepare).not.toHaveBeenCalled();
    expect(s.notes.status?.message).toContain("Nothing was saved");
  });
  it("keeps the saved session and explains when notes fail", async () => {
    const s = setup();
    s.ai.ask.mockImplementationOnce(async () => {
      s.ai.value = { status: "error", draft: null, error: "Rate limited." };
    });
    await s.notes.start(true);
    await s.notes.finish("m1");
    expect(s.ai.apply).not.toHaveBeenCalled();
    expect(s.notes.status).toEqual({
      message:
        "Session saved, but notes could not be written: Rate limited. Open the meeting to generate them.",
      meetingId: "m1",
      working: false,
    });
  });
  it("gives up on a stalled answer", async () => {
    const s = setup();
    s.ai.ask.mockImplementationOnce(async () => {
      s.ai.value = { status: "sending", draft: null, error: null };
    });
    const now = vi.spyOn(Date, "now");
    let t = 0;
    now.mockImplementation(() => (t += 60_000));
    await s.notes.start(true);
    await s.notes.finish("m1");
    now.mockRestore();
    expect(s.notes.status?.message).toContain("took too long");
  });
  it("drops stale work when a new session starts", async () => {
    const s = setup();
    let release!: () => void;
    s.ai.ask.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          release = () => {
            s.ai.value = { status: "draft", draft: s.draft, error: null };
            done();
          };
        }),
    );
    await s.notes.start(true);
    const finishing = s.notes.finish("m1");
    await vi.waitFor(() => expect(s.ai.ask).toHaveBeenCalled());
    await s.notes.start(true);
    release();
    await finishing;
    expect(s.ai.apply).not.toHaveBeenCalled();
  });
});
