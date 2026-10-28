import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantController } from "../src/main/ai/controller";
import { IntelligenceController } from "../src/main/intelligence/controller";
import { CaptureSessionController } from "../src/main/session";
import {
  DEFAULT_CONTEXT,
  type AIRequest,
  type ProviderEvent,
  type ProviderId,
  type ProviderStatus,
} from "../src/shared/ai";
import {
  DEFAULT_INTELLIGENCE,
  type LiveSharing,
} from "../src/shared/intelligence";
import { ProviderError } from "../src/main/ai/errors";
import type { TranscriptEvent } from "../src/shared/transcription";
import type { SessionSnapshot } from "../src/shared/contracts";
import { backend, consent, deferred, frame, source } from "./helpers";

const instances: {
  assistant: AssistantController;
  intelligence: IntelligenceController;
}[] = [];
async function setup(
  patch: Partial<typeof DEFAULT_INTELLIGENCE> = {},
  monotonic: () => number = Date.now,
) {
  const provider = (id: ProviderId) => ({
    id,
    inspect: vi.fn(
      async (): Promise<ProviderStatus> => ({
        id,
        auth: "chatgpt",
        ready: true,
        message: "synthetic local fixture",
        capabilities: { text: true, images: true, tools: false },
        models: ["fixture-image"],
        selectedModel: "fixture-image",
      }),
    ),
    respond: vi.fn(async function* (
      _request: AIRequest,
      _signal: AbortSignal,
      canSend?: () => boolean,
    ): AsyncGenerator<ProviderEvent> {
      if (canSend && !canSend())
        throw new ProviderError("cancelled", "Scope changed.");
      yield { type: "complete", text: "Synthetic local test answer" };
    }),
    dispose: vi.fn(),
  });
  const codex = provider("codex"),
    claude = provider("claude"),
    connection = {
      accountId: "account-a" as string | null,
      transcribing: true,
    };
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
  for (const id of ["microphone", "systemAudio", "screen"] as const)
    capture.sources[id].state = "CAPTURING";
  const events: TranscriptEvent[] = [];
  const listener: { current?: IntelligenceController } = {};
  const fresh = vi.fn(
    async (): Promise<SessionSnapshot> => ({
      ...capture,
      frame: { ...frame, capturedAt: Date.now() },
    }),
  );
  const assistant = new AssistantController(
    [codex, claude],
    () => ({ capture, events }),
    (value) => listener.current?.assistantChanged(value),
    90000,
    Date.now,
    () => fresh(),
  );
  assistant.captureChanged(capture);
  await assistant.inspect();
  const changed = vi.fn();
  const intelligence = new IntelligenceController(
    assistant,
    changed,
    Date.now,
    () => new Uint8Array(576).fill(100),
    () => connection,
    monotonic,
  );
  listener.current = intelligence;
  intelligence.configure({
    ...DEFAULT_INTELLIGENCE,
    sessionMinutes: 1,
    sources: { microphone: true, systemAudio: true, screen: true },
    ...patch,
  });
  intelligence.mode("live");
  intelligence.update(capture, events);
  const input = (sharing: Partial<LiveSharing> = {}) => ({
    acknowledged: true,
    expected: intelligence.value.liveContext!,
    sharing: {
      microphone: true,
      systemAudio: false,
      screenshot: false,
      history: false,
      ...sharing,
    },
    limits: {
      sessionMinutes: intelligence.value.settings.sessionMinutes,
      cooldownSeconds: intelligence.value.settings.cooldownSeconds,
      requestLimit: intelligence.value.settings.requestLimit,
    },
  });
  const emit = (
    text = "Why would you use a dictionary instead of a list",
    id = "q1",
    source: TranscriptEvent["source"] = "microphone",
    time = Date.now(),
  ) => {
    events.push({
      id,
      sessionId: capture.sessionId!,
      source,
      startMs: time - 1000,
      endMs: time,
      text,
      state: "final",
      model: "tiny.en",
    });
    intelligence.update(capture, events);
  };
  const result = {
    assistant,
    intelligence,
    codex,
    claude,
    connection,
    capture,
    events,
    fresh,
    input,
    emit,
    changed,
  };
  instances.push(result);
  return result;
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}
describe("P7 separate expiring Live Assist and one central scheduler", () => {
  it("preserves the minimum real cooldown when the wall clock jumps forward", async () => {
    let elapsed = 0;
    const s = await setup({ sessionMinutes: 3 }, () => elapsed);
    await s.intelligence.authorise(s.input());
    s.emit();
    await flush();
    expect(s.codex.respond).toHaveBeenCalledOnce();
    elapsed = 1000;
    vi.setSystemTime(Date.now() + 40000);
    s.emit("How would you improve this compiler error", "next");
    await flush();
    expect(s.codex.respond).toHaveBeenCalledOnce();
    elapsed = 30001;
    s.intelligence.tick();
    await flush();
    expect(s.codex.respond).toHaveBeenCalledTimes(2);
  });
  it("publishes source and Whisper readiness before any speech so the UI can authorise a future question", async () => {
    const s = await setup();
    s.connection.transcribing = false;
    s.capture.sources.microphone.state = "STARTING";
    s.intelligence.update(s.capture, []);
    expect(s.changed.mock.lastCall?.[0].liveContext).toMatchObject({
      transcribing: false,
      available: { microphone: false },
    });
    s.capture.sources.microphone.state = "CAPTURING";
    s.intelligence.update(s.capture, []);
    expect(s.changed.mock.lastCall?.[0].liveContext.available.microphone).toBe(
      true,
    );
    s.connection.transcribing = true;
    s.intelligence.update(s.capture, []);
    const published = s.changed.mock.lastCall?.[0];
    expect(published.liveContext.transcribing).toBe(true);
    expect(published.questions).toEqual([]);
    expect(published.live).toBeNull();
    const count = s.changed.mock.calls.length;
    s.intelligence.update(s.capture, []);
    expect(s.changed).toHaveBeenCalledTimes(count);
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("keeps low-confidence help cues as optional suggestions and never sends them automatically", async () => {
    const s = await setup();
    await s.intelligence.authorise(s.input());
    s.emit("Help me explain this function");
    await flush();
    expect(s.intelligence.value.suggestions.length).toBeGreaterThan(0);
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("keeps one active automatic request while another question waits, without overlapping provider calls", async () => {
    const s = await setup({ sessionMinutes: 3 });
    const pending = deferred<ProviderEvent>();
    s.codex.respond.mockImplementationOnce(async function* () {
      yield { type: "text", text: "Synthetic pending response" };
      yield await pending.promise;
    });
    await s.intelligence.authorise(s.input());
    s.emit();
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    s.emit("How would you improve this compiler error", "q2");
    await vi.advanceTimersByTimeAsync(21000);
    expect(s.codex.respond).toHaveBeenCalledOnce();
    expect(s.intelligence.value.diagnostics.queueDepth).toBe(1);
    pending.resolve({ type: "complete", text: "Synthetic completed response" });
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.codex.respond).toHaveBeenCalledTimes(2);
  });
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
  it.each(["manual", "auto-hint"] as const)(
    "never starts automatic inference in %s mode",
    async (mode) => {
      const s = await setup();
      s.intelligence.mode(mode);
      s.emit();
      await vi.advanceTimersByTimeAsync(60000);
      expect(s.codex.respond).not.toHaveBeenCalled();
      expect(s.intelligence.value.live).toBeNull();
    },
  );
  it("requires explicit fresh scope acknowledgement and never treats local capture as sharing permission", async () => {
    const s = await setup();
    s.emit();
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
    await expect(
      s.intelligence.authorise({ ...s.input(), acknowledged: false }),
    ).rejects.toThrow("acknowledge");
    await expect(
      s.intelligence.authorise({
        ...s.input(),
        sharing: {
          microphone: false,
          systemAudio: false,
          screenshot: true,
          history: false,
        },
      }),
    ).rejects.toThrow("transcript source");
    await expect(
      s.intelligence.authorise({
        ...s.input(),
        limits: { sessionMinutes: 30, cooldownSeconds: 30, requestLimit: 20 },
      }),
    ).rejects.toThrow("limits changed");
    await expect(
      s.intelligence.authorise({
        ...s.input(),
        expected: { ...s.input().expected, accountId: "other" },
      }),
    ).rejects.toThrow("changed");
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("automatically sends only a selected final question, retains the existing response pipeline and closes at the request cap", async () => {
    const s = await setup({ requestLimit: 1 });
    await s.intelligence.authorise(s.input());
    s.emit();
    await flush();
    expect(s.codex.respond).toHaveBeenCalledOnce();
    const request = s.codex.respond.mock.calls[0]![0];
    expect(request.automatic).toBe(true);
    expect(request.screenshot).toBeNull();
    expect(request.history).toEqual([]);
    expect(request.transcripts.map((item) => item.source)).toEqual([
      "microphone",
    ]);
    expect(s.assistant.value.responses[0]).toMatchObject({
      automatic: true,
      status: "completed",
    });
    expect(s.intelligence.value.live).toBeNull();
    expect(s.intelligence.value.diagnostics.automaticAttempts).toBe(1);
    expect(s.intelligence.value.diagnostics.automaticCompletions).toBe(1);
    expect(
      s.intelligence.value.events.some(
        (event) => event.type === "AssistCompleted",
      ),
    ).toBe(true);
    s.emit("How would you improve this compiler error", "q2");
    await flush();
    expect(s.codex.respond).toHaveBeenCalledOnce();
    expect(s.claude.respond).not.toHaveBeenCalled();
  });
  it("excludes unshared transcript categories even from the trigger question and correlated reference text", async () => {
    const s = await setup();
    await s.intelligence.authorise(
      s.input({ microphone: true, systemAudio: false }),
    );
    s.emit(
      "Why would you use a dictionary instead of a list",
      "system-secret",
      "systemAudio",
    );
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
    s.emit("How would you improve this compiler error", "mic-public");
    await flush();
    const request = s.codex.respond.mock.calls[0]![0];
    expect(request.prompt).not.toContain("dictionary");
    expect(
      request.transcripts.every((item) => item.source === "microphone"),
    ).toBe(true);
    expect(s.intelligence.value.diagnostics.suppressedRequests).toBeGreaterThan(
      0,
    );
  });
  it("does not send pre-authorisation questions retrospectively", async () => {
    const s = await setup();
    s.emit();
    await s.intelligence.authorise(s.input());
    s.intelligence.tick();
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("enforces cooldown without an unbounded queue, then suppresses an unchanged question for the grant", async () => {
    const s = await setup({ sessionMinutes: 3 });
    await s.intelligence.authorise(s.input());
    s.emit();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    s.emit("How would you improve this compiler error", "q2");
    await flush();
    expect(s.codex.respond).toHaveBeenCalledTimes(1);
    expect(s.intelligence.value.diagnostics.queueDepth).toBeLessThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(29000);
    expect(s.codex.respond).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(91000);
    s.emit("Why would you use a dictionary instead of a list", "repeat");
    await flush();
    expect(s.codex.respond).toHaveBeenCalledTimes(2);
    expect(s.intelligence.value.diagnostics.suppressedRequests).toBeGreaterThan(
      0,
    );
  });
  it("expires authorisation and never automatically renews on later questions", async () => {
    const s = await setup();
    await s.intelligence.authorise(s.input());
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.intelligence.value.live).toBeNull();
    s.emit();
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("uses a monotonic deadline and fails closed on wall-clock rollback", async () => {
    let monotonic = 100;
    const s = await setup({}, () => monotonic);
    await s.intelligence.authorise(s.input());
    monotonic += 60001;
    s.intelligence.tick();
    expect(s.intelligence.value.live).toBeNull();
    monotonic = 100;
    await s.intelligence.authorise(s.input());
    vi.setSystemTime(900000);
    s.intelligence.tick();
    expect(s.intelligence.value.live).toBeNull();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it.each([
    "pause",
    "stop",
    "epoch",
    "source",
    "transcription",
    "account",
    "provider",
    "clear",
    "mode",
    "settings",
  ])("revokes pending/active automatic sharing on %s", async (change) => {
    const s = await setup();
    const pending = deferred<ProviderEvent>();
    let signal: AbortSignal | undefined;
    s.codex.respond.mockImplementationOnce(async function* (_request, abort) {
      signal = abort;
      yield { type: "text", text: "Synthetic streaming" };
      yield await pending.promise;
    });
    await s.intelligence.authorise(s.input());
    s.emit();
    await flush();
    expect(signal?.aborted).toBe(false);
    if (change === "pause") s.capture.state = "PAUSED";
    if (change === "stop") {
      s.capture.state = "STOPPED";
      s.capture.sessionId = null;
    }
    if (change === "epoch") s.capture.epoch++;
    if (change === "source")
      s.capture.source = { ...source, id: "window:999:0" };
    if (change === "transcription") s.connection.transcribing = false;
    if (change === "account") {
      s.connection.accountId = "account-b";
      s.assistant.clear();
    }
    if (change === "provider") s.assistant.select("claude");
    if (change === "clear") s.assistant.clear();
    if (change === "mode") s.intelligence.mode("manual");
    if (change === "settings")
      s.intelligence.configure({
        ...s.intelligence.value.settings,
        confidenceThreshold: 0.99,
      });
    s.intelligence.update(s.capture, s.events);
    s.intelligence.tick();
    expect(s.intelligence.value.live).toBeNull();
    expect(signal?.aborted).toBe(true);
    pending.resolve({ type: "complete", text: "Late synthetic result" });
    await flush();
    expect(
      s.assistant.value.responses.some(
        (response) => response.status === "completed",
      ),
    ).toBe(false);
  });
  it("cancels a screenshot preparation race before any remote request and does not steal a new manual review", async () => {
    const s = await setup();
    const pending = deferred<SessionSnapshot>();
    s.fresh.mockReturnValueOnce(pending.promise);
    await s.intelligence.authorise(s.input({ screenshot: true }));
    s.emit();
    await flush();
    expect(s.fresh).toHaveBeenCalledOnce();
    s.intelligence.revoke("User selected manual Assist");
    s.assistant.prepare({
      question: "Manual question",
      options: DEFAULT_CONTEXT,
    });
    const manual = s.assistant.value.review!.requestId;
    pending.resolve({
      ...s.capture,
      frame: { ...frame, capturedAt: Date.now() },
    });
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
    expect(s.assistant.value.review!.requestId).toBe(manual);
  });
  it("handles auth/model loss and rate/network errors without automatic retries or a second provider", async () => {
    for (const code of ["rate-limit", "network", "auth"] as const) {
      const s = await setup();
      s.codex.respond.mockImplementationOnce(async function* () {
        throw new ProviderError(code, "Synthetic failure");
        yield { type: "complete", text: "unreachable" };
      });
      await s.intelligence.authorise(s.input());
      s.emit();
      await flush();
      expect(s.intelligence.value.live).toBeNull();
      await vi.advanceTimersByTimeAsync(61000);
      s.emit("How would you improve this compiler error", "next");
      await flush();
      expect(s.codex.respond).toHaveBeenCalledOnce();
      expect(s.claude.respond).not.toHaveBeenCalled();
    }
  });
  it("rejects unavailable image support and transcription, and pauses when model readiness changes", async () => {
    const s = await setup();
    s.connection.transcribing = false;
    await expect(s.intelligence.authorise(s.input())).rejects.toThrow(
      "transcription",
    );
    s.connection.transcribing = true;
    s.codex.inspect.mockResolvedValue({
      ...(await s.codex.inspect()),
      capabilities: { text: true, images: false, tools: false },
    });
    await s.assistant.inspect();
    await expect(
      s.intelligence.authorise(s.input({ screenshot: true })),
    ).rejects.toThrow("screenshots");
    await s.intelligence.authorise(s.input());
    s.codex.inspect.mockResolvedValue({
      ...(await s.codex.inspect()),
      ready: false,
      auth: "missing",
    });
    s.emit();
    await flush();
    expect(s.intelligence.value.live).toBeNull();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("uses at most one active slot and exposes omitted duplicate images on a later text/history answer", async () => {
    const s = await setup();
    await s.intelligence.authorise(
      s.input({ screenshot: true, history: true }),
    );
    s.emit();
    await flush();
    expect(s.codex.respond.mock.calls[0]![0].screenshot).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    s.emit("How would you improve this compiler error", "q2");
    await flush();
    expect(s.codex.respond).toHaveBeenCalledTimes(2);
    expect(s.codex.respond.mock.calls[1]![0].screenshot).toBeNull();
    expect(s.codex.respond.mock.calls[1]![0].history).toHaveLength(1);
    expect(
      s.assistant.value.responses.at(-1)!.contextNotices!.join(),
    ).toContain("image omitted");
  });
  it("will not overwrite a manual review or accept a renderer submission of an automatic review", async () => {
    const s = await setup();
    s.assistant.prepare({
      question: "manual pending",
      options: DEFAULT_CONTEXT,
    });
    await expect(s.intelligence.authorise(s.input())).rejects.toThrow(
      "manual review",
    );
    s.assistant.discardReview();
    s.assistant.prepare(
      { question: "synthetic auto", options: DEFAULT_CONTEXT },
      true,
    );
    await expect(
      s.assistant.ask({
        reviewId: s.assistant.value.review!.requestId,
        acknowledged: true,
      }),
    ).rejects.toThrow("belong to Live Assist");
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("does not use removed transcript content as an automatic trigger", async () => {
    const s = await setup();
    s.emit();
    s.assistant.prepare({
      question: "Remove",
      options: { ...DEFAULT_CONTEXT, microphone: true },
    });
    s.assistant.removeContext({
      reviewId: s.assistant.value.review!.requestId,
      kind: "transcripts",
      index: 0,
    });
    s.assistant.discardReview();
    await s.intelligence.authorise(s.input());
    s.intelligence.tick();
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
});
