import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntelligenceController } from "../src/main/intelligence/controller";
import { AssistantController } from "../src/main/ai/controller";
import { CaptureSessionController } from "../src/main/session";
import {
  DEFAULT_CONTEXT,
  type AIProvider,
  type ProviderId,
} from "../src/shared/ai";
import { DEFAULT_INTELLIGENCE } from "../src/shared/intelligence";
import {
  parseIntelligenceSettings,
  parseSettings,
  DEFAULT_SETTINGS,
} from "../src/shared/validation";
import { backend, consent, frame, source } from "./helpers";
import type { SessionSnapshot } from "../src/shared/contracts";
import type { TranscriptEvent } from "../src/shared/transcription";
const instances: {
  assistant: AssistantController;
  intelligence: IntelligenceController;
}[] = [];
function setup() {
  const provider = (id: ProviderId) => ({
    id,
    inspect: vi.fn(async () => ({
      id,
      auth: "chatgpt" as const,
      ready: true,
      message: "synthetic",
      capabilities: { text: true, images: true, tools: false as const },
      models: ["fixture-image"],
      selectedModel: "fixture-image",
    })),
    respond: vi.fn(async function* () {
      yield { type: "complete" as const, text: "Synthetic answer" };
    }),
    dispose: vi.fn(),
  });
  const codex = provider("codex"),
    claude = provider("claude");
  const capture: SessionSnapshot = {
    ...new CaptureSessionController(
      backend(),
      () => 3000,
      () => {},
    ).value,
    state: "ACTIVE",
    sessionId: "capture",
    epoch: 1,
    source,
    frame: { ...frame, capturedAt: Date.now() },
    consent: { ...consent, microphone: true, systemAudio: true },
  };
  const events: TranscriptEvent[] = [];
  const listener: { current?: IntelligenceController } = {};
  const assistant = new AssistantController(
    [codex, claude] as AIProvider[],
    () => ({ capture, events }),
    (value) => listener.current?.assistantChanged(value),
  );
  assistant.captureChanged(capture);
  const intelligence = new IntelligenceController(
    assistant,
    () => {},
    Date.now,
    () => new Uint8Array(576).fill(120),
  );
  listener.current = intelligence;
  intelligence.configure({
    ...DEFAULT_INTELLIGENCE,
    sources: { microphone: true, systemAudio: true, screen: false },
  });
  intelligence.mode("auto-hint");
  const event = (
    text: string,
    id = "speech",
    patch: Partial<TranscriptEvent> = {},
  ): TranscriptEvent => ({
    id,
    sessionId: "capture",
    source: "systemAudio",
    startMs: Date.now() - 1000,
    endMs: Date.now(),
    text,
    state: "final",
    model: "tiny.en",
    ...patch,
  });
  const emit = (
    text: string,
    id = "speech",
    patch: Partial<TranscriptEvent> = {},
  ) => {
    events.push(event(text, id, patch));
    intelligence!.update(capture, events);
  };
  const options = { ...DEFAULT_CONTEXT, microphone: true, systemAudio: true };
  const result = {
    assistant,
    intelligence,
    codex,
    claude,
    capture,
    events,
    event,
    emit,
    options,
  };
  instances.push(result);
  return result;
}
describe("P7 reviewed contextual actions and ranked suggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
  });
  afterEach(async () => {
    for (const instance of instances.splice(0)) {
      instance.intelligence.dispose();
      await instance.assistant.dispose();
    }
    vi.useRealTimers();
  });
  it.each([
    "get-answer",
    "say-next",
    "follow-ups",
    "fact-check",
    "recap",
    "dynamic",
  ] as const)(
    "prepares %s using the shared builder and never infers without approval",
    async (action) => {
      const s = setup();
      s.emit("Why would you use a dictionary instead of a list");
      const outcome = await s.intelligence.action({
        action,
        question: "The dictionary lookup has constant average time",
        options: s.options,
      });
      expect(outcome.type).toBe("review");
      expect(s.assistant.value.review!.transcripts[0]!.source).toBe(
        "systemAudio",
      );
      expect(s.assistant.value.review!.prompt).toContain("untrusted");
      expect(s.codex.respond).not.toHaveBeenCalled();
      expect(s.claude.respond).not.toHaveBeenCalled();
    },
  );
  it("makes participant information a local authorised/unknown result without identity inference", async () => {
    const s = setup();
    const unknown = await s.intelligence.action({
      action: "who",
      options: DEFAULT_CONTEXT,
    });
    expect(unknown).toMatchObject({ type: "local" });
    expect(s.intelligence.value.localResult!.text).toContain("not people");
    await s.intelligence.action({
      action: "who",
      options: DEFAULT_CONTEXT,
      participantInfo: "Alex, project reviewer (provided by me)",
    });
    expect(s.intelligence.value.localResult!.text).toContain("unverified");
    expect(s.assistant.value.review).toBeNull();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("requires a specific claim and labels fact assessment unverified in the review and completed response metadata", async () => {
    const s = setup();
    await expect(
      s.intelligence.action({ action: "fact-check", options: DEFAULT_CONTEXT }),
    ).rejects.toThrow("specific factual claim");
    await s.intelligence.action({
      action: "fact-check",
      question: "Dictionary lookups are always constant time",
      options: DEFAULT_CONTEXT,
    });
    const review = s.assistant.value.review!;
    expect(review.prompt).toContain("UNVERIFIED, CONTEXT-ONLY");
    expect(review.notices.join()).toContain("No external");
    await s.assistant.ask({ reviewId: review.requestId, acknowledged: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.assistant.value.responses[0]!.action).toBe("fact-check");
  });
  it("rejects a recap/spoken response with no retained selected evidence", async () => {
    const s = setup();
    for (const action of ["recap", "say-next", "follow-ups"]) {
      await expect(
        s.intelligence.action({ action, options: DEFAULT_CONTEXT }),
      ).rejects.toThrow("retained");
      expect(s.assistant.value.review).toBeNull();
    }
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("ranks at most three stable candidates, supports dismiss/similar and expires old suggestions", async () => {
    const s = setup();
    for (const [text, index] of [
      ["Why does function alpha fail", 1],
      ["How would you improve the project budget", 2],
      ["Can you compare dictionary lookup with list iteration", 3],
      ["What happens if variable theta is empty", 4],
    ] as const)
      s.emit(text, `q${index}`);
    expect(s.intelligence.value.suggestions).toHaveLength(3);
    const first = s.intelligence.value.suggestions[0]!;
    s.intelligence.dismiss({ id: first.id, similar: true });
    expect(
      s.intelligence.value.suggestions.some((item) => item.id === first.id),
    ).toBe(false);
    expect(
      s.intelligence.value.events.some(
        (event) => event.type === "SuggestionDismissed",
      ),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(121000);
    s.emit(first.text, "repeat");
    expect(
      s.intelligence.value.suggestions.some((item) => item.text === first.text),
    ).toBe(false);
    expect(
      s.intelligence.value.events.some(
        (event) => event.type === "SuggestionExpired",
      ),
    ).toBe(true);
  });
  it("accepts only current selected sources and correlates a detected question with nearby excerpts rather than the whole window", async () => {
    const s = setup();
    s.events.push(
      s.event("Unrelated old retained material", "old", {
        startMs: 900000,
        endMs: 925000,
      }),
    );
    s.emit("Why would you use a dictionary instead of a list");
    const suggestion = s.intelligence.value.suggestions[0]!;
    await expect(
      s.intelligence.action({
        action: "get-answer",
        suggestionId: suggestion.id,
        options: DEFAULT_CONTEXT,
      }),
    ).rejects.toThrow("transcript source");
    await s.intelligence.action({
      action: "get-answer",
      suggestionId: suggestion.id,
      options: { ...s.options, recentSeconds: 300 },
    });
    expect(s.assistant.value.review!.prompt).not.toContain("Unrelated old");
    expect(
      s.assistant.value.review!.transcripts.map((item) => item.id),
    ).toEqual(["speech"]);
  });
  it("does not reintroduce a removed excerpt as a suggested question", async () => {
    const s = setup();
    s.emit("Why would you use a dictionary instead of a list");
    await s.intelligence.action({
      action: "get-answer",
      suggestionId: s.intelligence.value.suggestions[0]!.id,
      options: s.options,
    });
    const review = s.assistant.value.review!;
    s.assistant.removeContext({
      reviewId: review.requestId,
      kind: "transcripts",
      index: 0,
    });
    expect(s.intelligence.value.suggestions).toEqual([]);
    expect(s.intelligence.value.questions[0]!.automaticEligible).toBe(false);
  });
  it("isolates account/provider/conversation changes and never persists local events or authorisation in settings", () => {
    const s = setup();
    s.emit("Why would you use a dictionary instead of a list");
    s.assistant.select("claude");
    expect(s.intelligence.value.questions).toEqual([]);
    expect(s.intelligence.value.suggestions).toEqual([]);
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, intelligence: DEFAULT_INTELLIGENCE })
        .intelligence,
    ).toEqual(DEFAULT_INTELLIGENCE);
    expect(() =>
      parseIntelligenceSettings({
        ...DEFAULT_INTELLIGENCE,
        live: { acknowledged: true },
      }),
    ).toThrow("Unexpected");
  });
  it.each([
    null,
    {},
    { action: "run-shell", options: DEFAULT_CONTEXT },
    { action: "get-answer", options: DEFAULT_CONTEXT, token: "no" },
    { action: "recap", options: { ...DEFAULT_CONTEXT, microphone: "true" } },
    {
      action: "who",
      options: DEFAULT_CONTEXT,
      participantInfo: "x".repeat(1501),
    },
  ])(
    "rejects malformed action IPC %j",
    async (value) =>
      await expect(setup().intelligence.action(value)).rejects.toThrow(),
  );
  it.each([
    { cooldownSeconds: 29 },
    { requestLimit: 0 },
    { confidenceThreshold: NaN },
    { sessionMinutes: 61 },
    { sources: { microphone: true, systemAudio: false, screen: "true" } },
    { excludedSourceIds: ["C:/private"] },
    { mode: "live" },
  ])("rejects invalid automation preferences %j", (patch) =>
    expect(() =>
      parseIntelligenceSettings({ ...DEFAULT_INTELLIGENCE, ...patch }),
    ).toThrow(),
  );
});
