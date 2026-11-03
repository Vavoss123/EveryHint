import { afterEach, describe, expect, it } from "vitest";
import { chatQuestion, MeetingChat } from "../src/main/meetings/chat";
import type { AIRequest, ProviderEvent } from "../src/shared/ai";
import { meetingHarness } from "./meeting-ai-helpers";

const instances: Awaited<ReturnType<typeof meetingHarness>>[] = [];
async function setup() {
  const s = await meetingHarness({ saved: true });
  instances.push(s);
  return s;
}
afterEach(async () => {
  for (const s of instances.splice(0)) await s.close();
});
const quick = () => new Promise<void>((done) => setTimeout(done, 5));
function lastRequest(s: Awaited<ReturnType<typeof setup>>): AIRequest {
  return s.mockProvider.respond.mock.calls.at(-1)![0] as AIRequest;
}
describe("asking about a saved meeting", () => {
  it("answers straight away and leaves no review or draft behind", async () => {
    const s = await setup();
    s.mockProvider.respond.mockImplementationOnce(async function* () {
      yield { type: "complete", text: "They agreed to ship Friday." };
    } as never);
    const chat = new MeetingChat(s.ai, quick);
    const answer = await chat.ask({
      id: s.saved!.id,
      question: "When are we shipping?",
      history: [],
    });
    expect(answer).toBe("They agreed to ship Friday.");
    const request = lastRequest(s);
    expect(request.meetingContext?.purpose).toBe("ask");
    expect(request.prompt).toContain("When are we shipping?");
    expect(
      request.meetingContext?.excerpts.some((e) => e.kind === "transcript"),
    ).toBe(true);
    expect(s.ai.value.status).toBe("idle");
    expect(s.ai.value.textDraft).toBeNull();
    expect(s.assistant.value.review).toBeNull();
  });
  it("uses the saved AI notes as context", async () => {
    const s = await setup();
    // Generate and save notes through the normal pipeline first.
    const review = await s.ai.prepare(s.selection);
    await s.ai.ask({ reviewId: review, acknowledged: true });
    await new Promise((done) => setTimeout(done, 20));
    const draft = s.ai.value.draft!;
    await s.ai.apply({
      draftId: draft.id,
      meetingId: s.saved!.id,
      expectedRevision: draft.expectedRevision,
      sections: draft.sections,
      overwriteManual: false,
    });
    const chat = new MeetingChat(s.ai, quick);
    await chat.ask({ id: s.saved!.id, question: "Summarise it", history: [] });
    const notes = lastRequest(s).meetingContext!.excerpts.find(
      (e) => e.kind === "notes",
    );
    expect(notes?.text).toContain("AI notes:");
  });
  it("remembers earlier turns for follow-up questions", async () => {
    const s = await setup();
    const chat = new MeetingChat(s.ai, quick);
    await chat.ask({
      id: s.saved!.id,
      question: "Make it shorter",
      history: [{ question: "Draft a follow-up email", answer: "Hi team…" }],
    });
    const prompt = lastRequest(s).prompt;
    expect(prompt).toContain("Q: Draft a follow-up email");
    expect(prompt).toContain("New question: Make it shorter");
  });
  it("reports a failed answer and resets", async () => {
    const s = await setup();
    s.mockProvider.respond.mockImplementationOnce(async function* () {
      throw new Error("rate limited");
      yield {} as ProviderEvent;
    } as never);
    const chat = new MeetingChat(s.ai, quick);
    await expect(
      chat.ask({ id: s.saved!.id, question: "Anything?", history: [] }),
    ).rejects.toThrow();
    expect(s.ai.value.status).toBe("idle");
  });
  it("rejects empty questions", async () => {
    const s = await setup();
    const chat = new MeetingChat(s.ai, quick);
    await expect(
      chat.ask({ id: s.saved!.id, question: "  ", history: [] }),
    ).rejects.toThrow(/at most 2,000/);
  });
});
describe("chat question folding", () => {
  it("keeps the newest turns within the question limit", () => {
    const long = "x".repeat(1500);
    const folded = chatQuestion("Latest?", [
      { question: "oldest", answer: long },
      { question: "middle", answer: long },
      { question: "newest", answer: long },
    ]);
    expect(folded.length).toBeLessThanOrEqual(4000);
    expect(folded).toContain("Q: newest");
    expect(folded).not.toContain("Q: oldest");
    expect(folded.endsWith("New question: Latest?")).toBe(true);
  });
  it("passes a first question through unchanged", () => {
    expect(chatQuestion(" Hello ", [])).toBe("Hello");
  });
});
