import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMeetingContext,
  parseMeetingDraft,
} from "../src/main/meetings/ai-context";
import { parseMeetingSelection } from "../src/shared/meeting-ai";
import { DEFAULT_CONTEXT } from "../src/shared/ai";
import { meetingHarness, summaryFixture } from "./meeting-ai-helpers";
import type { AIRequest, ProviderEvent } from "../src/shared/ai";
import { deferred } from "./helpers";
const instances: Awaited<ReturnType<typeof meetingHarness>>[] = [];
async function setup(saved = true) {
  const s = await meetingHarness({ saved });
  instances.push(s);
  return s;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1793196000000);
});
afterEach(async () => {
  for (const s of instances.splice(0)) await s.close();
  vi.useRealTimers();
});
const flush = () => vi.advanceTimersByTimeAsync(0);
describe("P8.2 grounded meeting drafts and frozen sharing", () => {
  it("attaches a temporary generated draft only after exact source text is explicitly persisted, then separately applies", async () => {
    const s = await setup(false);
    s.stop();
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await flush();
    expect(s.ai.value.draft!.meetingId).toBeNull();
    await s.recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    const doc = await s.recorder.saveRetained({
      sessionId: "capture-a",
      title: "Saved retained fixture",
      acknowledged: true,
    });
    await s.ai.attachRetainedDraft(doc);
    const draft = s.ai.value.draft!;
    expect(draft.meetingId).toBe(doc.id);
    expect(
      draft.summary.overview!.evidence.every((item) =>
        item.ref.startsWith(`${doc.id}/`),
      ),
    ).toBe(true);
    expect((await s.recorder.requireStore().get(doc.id)).summary).toBeNull();
    const saved = await s.ai.apply({
      draftId: draft.id,
      meetingId: doc.id,
      expectedRevision: doc.revision,
      sections: ["overview"],
      overwriteManual: false,
    });
    expect(saved.summary!.overview!.text).toBeTruthy();
  });
  it("does not attach an old temporary draft to text changed before persistence", async () => {
    const s = await setup(false);
    s.stop();
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await flush();
    await s.recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    s.events[0]!.text =
      "A different final utterance now occupies this fixture ID.";
    const doc = await s.recorder.saveRetained({
      sessionId: "capture-a",
      title: "Changed retained fixture",
      acknowledged: true,
    });
    await s.ai.attachRetainedDraft(doc);
    expect(s.ai.value.draft!.meetingId).toBeNull();
    expect((await s.recorder.requireStore().get(doc.id)).summary).toBeNull();
  });
  it("cannot resurrect old-profile draft content after async temporary attachment completes", async () => {
    const s = await setup(false);
    s.stop();
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await flush();
    await s.recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    const doc = await s.recorder.saveRetained({
        sessionId: "capture-a",
        title: "Scoped retained fixture",
        acknowledged: true,
      }),
      store = s.recorder.requireStore(),
      segments = await store.contextSegments(doc.id, []),
      gate = deferred<typeof segments>();
    vi.spyOn(store, "contextSegments").mockReturnValueOnce(gate.promise);
    const attachment = s.ai.attachRetainedDraft(doc);
    s.connection.accountId = "account-b";
    s.ai.resetProfile();
    gate.resolve(segments);
    await attachment;
    expect(s.ai.value.draft).toBeNull();
    expect(s.ai.value.textDraft).toBeNull();
    expect(s.ai.value.status).toBe("idle");
  });
  it("does not apply old-account sections after an awaited document read", async () => {
    const s = await setup();
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await flush();
    const draft = s.ai.value.draft!,
      store = s.recorder.requireStore(),
      doc = await store.get(s.saved!.id),
      gate = deferred<typeof doc>();
    vi.spyOn(store, "get").mockReturnValueOnce(gate.promise);
    const update = vi.spyOn(store, "update"),
      apply = s.ai.apply({
        draftId: draft.id,
        meetingId: doc.id,
        expectedRevision: doc.revision,
        sections: ["overview"],
        overwriteManual: false,
      });
    s.connection.accountId = "account-b";
    s.ai.resetProfile();
    gate.resolve(doc);
    await expect(apply).rejects.toThrow(/profile changed/);
    expect(update).not.toHaveBeenCalled();
    expect(s.ai.value.draft).toBeNull();
  });
  it("does not overwrite newer account draft state when an older save finishes", async () => {
    const s = await setup();
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await flush();
    const draft = s.ai.value.draft!,
      store = s.recorder.requireStore(),
      doc = await store.get(s.saved!.id),
      gate = deferred<typeof doc>();
    vi.spyOn(store, "update").mockReturnValueOnce(gate.promise);
    const apply = s.ai.apply({
      draftId: draft.id,
      meetingId: doc.id,
      expectedRevision: doc.revision,
      sections: ["overview"],
      overwriteManual: false,
    });
    await flush();
    s.connection.accountId = "account-b";
    s.ai.resetProfile();
    gate.resolve(doc);
    await expect(apply).rejects.toThrow(/no old-profile result/);
    expect(s.ai.value.draft).toBeNull();
    expect(s.ai.value.textDraft).toBeNull();
  });
  it("excludes retained temporary text after an account/lifecycle cutoff", async () => {
    const s = await setup(false);
    expect(s.ai.temporaryDocument).not.toBeNull();
    s.ai.resetProfile();
    expect(s.ai.temporaryDocument).toBeNull();
    expect(s.ai.temporarySegments).toEqual([]);
    await expect(s.ai.prepare(s.selection)).rejects.toThrow(
      /transcript|meaningful|No /,
    );
  });
  it("prepares only chosen meeting/source text and makes no request before explicit acknowledgement", async () => {
    const s = await setup(),
      selection = {
        ...s.selection,
        sources: { microphone: true, systemAudio: false, notes: false },
      };
    const id = await s.ai.prepare(selection),
      review = s.assistant.value.review!;
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    expect(review.meetingContext!.excerpts).toHaveLength(1);
    expect(review.meetingContext!.excerpts[0]!.source).toBe("microphone");
    expect(review.screenshot).toBeNull();
    expect(review.history).toEqual([]);
    expect(review.transcripts).toEqual([]);
    await expect(
      s.ai.ask({ reviewId: id, acknowledged: false }),
    ).rejects.toThrow(/acknowledge/);
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
  });
  it("streams through the shared provider/controller, creates an unsaved validated draft, then saves only explicitly applied sections", async () => {
    const s = await setup(),
      id = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    expect(s.ai.value.status).toBe("draft");
    const draft = s.ai.value.draft!;
    expect(draft.actions[0]!.owner).toBe("I");
    expect(draft.actions[0]!.deadline).toBe("Wednesday");
    expect(
      (await s.recorder.requireStore().get(s.saved!.id)).summary,
    ).toBeNull();
    const saved = await s.ai.apply({
      draftId: draft.id,
      meetingId: s.saved!.id,
      expectedRevision: draft.expectedRevision,
      sections: ["overview", "actions", "decisions"],
      overwriteManual: false,
    });
    expect(saved.summary!.overview!.evidence[0]!.quote).toContain("release");
    expect(saved.actions).toHaveLength(1);
    expect(saved.decisions[0]!.at).toBe(s.events[0]!.startMs);
    expect(saved.notes).toBe("");
  });
  it("keeps meeting replies out of the ordinary live conversation history", async () => {
    const s = await setup(),
      id = await s.ai.prepare({
        ...s.selection,
        purpose: "ask",
        question: "What did we decide?",
      });
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    s.assistant.prepare({
      question: "An unrelated question",
      options: {
        ...DEFAULT_CONTEXT,
        microphone: false,
        systemAudio: false,
        screenshot: false,
        history: true,
      },
    });
    expect(s.assistant.value.review!.history).toEqual([]);
  });
  it("rejects deleted/edited/stale meeting context before transmission", async () => {
    const s = await setup(),
      id = await s.ai.prepare(s.selection),
      doc = await s.recorder.requireStore().get(s.saved!.id);
    doc.notes = "User edit after review";
    await s.recorder.requireStore().update(doc, doc.revision, 30);
    await expect(
      s.ai.ask({ reviewId: id, acknowledged: true }),
    ).rejects.toThrow(/again/);
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
  });
  it("rechecks permission after asynchronous provider preparation and cancels late streamed results", async () => {
    const s = await setup(),
      gate = deferred<void>();
    let fakePosts = 0;
    s.mockProvider.respond.mockImplementationOnce(async function* (
      request: AIRequest,
      _signal: AbortSignal,
      guard?: () => boolean,
    ): AsyncGenerator<ProviderEvent> {
      void _signal;
      await gate.promise;
      if (guard && !guard())
        throw Error("Scope changed after fixture token renewal");
      fakePosts++;
      yield {
        type: "complete",
        text: JSON.stringify(summaryFixture(request.meetingContext!)),
      };
    });
    const id = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    await s.recorder.requireStore().delete(s.saved!.id);
    gate.resolve();
    await flush();
    expect(fakePosts).toBe(0);
    expect(s.ai.value.draft).toBeNull();
    expect(s.ai.value.status).toBe("error");
  });
  it("never overwrites manual notes/edited sections during regeneration without explicit replacement approval", async () => {
    const s = await setup(),
      doc = await s.recorder.requireStore().get(s.saved!.id);
    doc.notes = "Manual notes must survive";
    doc.editedSections = ["overview"];
    await s.recorder.requireStore().update(doc, doc.revision, 30);
    const id = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    const draft = s.ai.value.draft!;
    const apply = {
      draftId: draft.id,
      meetingId: doc.id,
      expectedRevision: draft.expectedRevision,
      sections: ["overview"],
      overwriteManual: false,
    };
    await expect(s.ai.apply(apply)).rejects.toThrow(/manual edits/);
    expect((await s.recorder.requireStore().get(doc.id)).notes).toBe(doc.notes);
    const saved = await s.ai.apply({ ...apply, overwriteManual: true });
    expect(saved.notes).toBe(doc.notes);
    expect(saved.summary!.overview!.authorship).toBe("ai");
  });
  it("rejects malformed or unsupported evidence and never automatically saves a failed draft", async () => {
    const s = await setup();
    s.mockProvider.respond.mockImplementationOnce(async function* () {
      yield { type: "complete", text: "Malformed fixture summary" };
    });
    const id = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    expect(s.ai.value.status).toBe("error");
    expect(s.ai.value.draft).toBeNull();
    expect(
      (await s.recorder.requireStore().get(s.saved!.id)).summary,
    ).toBeNull();
  });
  it("supports retained temporary context after Stop without creating history or reactivating capture", async () => {
    const s = await setup(false);
    s.stop();
    const id = await s.ai.prepare(s.selection);
    expect(s.capture().state).toBe("STOPPED");
    expect(s.ai.temporaryDocument).not.toBeNull();
    expect(s.recorder.value.locked).toBe(true);
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    expect(s.ai.value.draft!.meetingId).toBeNull();
    expect(s.ai.value.status).toBe("draft");
    expect(s.capture().state).toBe("STOPPED");
  });
  it("rejects invalid selections, cross-meeting refs, empty context and expired temporary excerpts", async () => {
    const s = await setup(false);
    expect(() =>
      parseMeetingSelection({ ...s.selection, meetingIds: ["unrelated"] }),
    ).toThrow();
    await expect(
      s.ai.prepare({ ...s.selection, segmentIds: ["other/capture/segment"] }),
    ).rejects.toThrow(/unavailable/);
    const id = await s.ai.prepare(s.selection);
    s.events.splice(0);
    await expect(
      s.ai.ask({ reviewId: id, acknowledged: true }),
    ).rejects.toThrow(/again/);
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
  });
  it("bounds context text and validates literal owners/deadlines while preserving uncertainty", async () => {
    const s = await setup(),
      doc = s.saved!,
      segments = s.db().contextSegments(doc.id, []),
      context = buildMeetingContext([doc], segments, s.selection),
      fixture = summaryFixture(context);
    fixture.actions[0]!.owner = "Imaginary owner";
    fixture.actions[0]!.deadline = "2099-01-01";
    fixture.actions[0]!.uncertainty = "uncertain";
    const draft = parseMeetingDraft(
      JSON.stringify(fixture),
      context,
      "fixture-plan",
      Date.now(),
    );
    expect(draft.actions[0]!.owner).toBeNull();
    expect(draft.actions[0]!.deadline).toBeNull();
    expect(draft.actions[0]!.uncertainty).toBe("uncertain");
    fixture.actions[0]!.evidence[0]!.quote = "Made up supporting quote";
    expect(() =>
      parseMeetingDraft(JSON.stringify(fixture), context, null, Date.now()),
    ).toThrow(/did not match/);
    const long = Array.from({ length: 200 }, (_, index) => ({
      ...segments[0]!,
      id: `large-${index}`,
      text: "Bounded text ".repeat(600),
    }));
    const bounded = buildMeetingContext([doc], long, s.selection);
    expect(
      bounded.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0),
    ).toBeLessThanOrEqual(12000);
    expect(JSON.stringify(bounded.excerpts).length).toBeLessThanOrEqual(14500);
    expect(bounded.notices.some((notice) => notice.includes("bounded"))).toBe(
      true,
    );
  });
  it("cancels in-flight meeting work without accepting a late fixture completion", async () => {
    const s = await setup(),
      gate = deferred<ProviderEvent>();
    s.mockProvider.respond.mockImplementationOnce(async function* () {
      yield { type: "text", text: "Partial fixture" };
      yield await gate.promise;
    });
    const id = await s.ai.prepare({
      ...s.selection,
      purpose: "ask",
      question: "What happened?",
    });
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    s.ai.cancel();
    gate.resolve({ type: "complete", text: "Late fixture" });
    await flush();
    expect(s.ai.value.textDraft).toBeNull();
    expect(s.assistant.value.responses.at(-1)!.status).toBe("cancelled");
  });
});
