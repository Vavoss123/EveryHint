import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantController } from "../src/main/ai/controller";
import type {
  AIProvider,
  AIRequest,
  ProviderEvent,
  ProviderId,
  ProviderStatus,
} from "../src/shared/ai";
import { DEFAULT_CONTEXT } from "../src/shared/ai";
import { CaptureSessionController } from "../src/main/session";
import { backend, consent, deferred, frame } from "./helpers";
import type { SessionSnapshot } from "../src/shared/contracts";
import type { TranscriptEvent } from "../src/shared/transcription";

function provider(id: ProviderId) {
  const respond = vi.fn(async function* (
    _request: AIRequest,
    _signal: AbortSignal,
  ): AsyncGenerator<ProviderEvent> {
    void _request;
    void _signal;
    yield { type: "text", text: "Hello" };
    yield {
      type: "complete",
      text: "Hello world",
      usage: { inputTokens: 8, outputTokens: 2 },
    };
  });
  const inspect = vi.fn(
    async (): Promise<ProviderStatus> => ({
      id,
      auth: "api-key",
      ready: true,
      message: "test fixture",
      capabilities: { text: true, images: true, tools: false },
      models: [],
    }),
  );
  return { id, inspect, respond, dispose: vi.fn() };
}
const controllers: AssistantController[] = [];
function setup(timeoutMs = 90000) {
  const codex = provider("codex");
  const claude = provider("claude");
  const changed = vi.fn();
  const sources: { capture: SessionSnapshot; events: TranscriptEvent[] } = {
    capture: {
      ...new CaptureSessionController(
        backend(),
        () => 3000,
        () => {},
      ).value,
      sessionId: "capture",
      consent: { ...consent, microphone: true, systemAudio: true },
      frame: { ...frame },
    },
    events: [],
  };
  const controller = new AssistantController(
    [codex, claude],
    () => sources,
    changed,
    timeoutMs,
  );
  controllers.push(controller);
  const prepare = (question = "Question?", options = {}) =>
    controller.prepare({
      question,
      options: { ...DEFAULT_CONTEXT, ...options },
    });
  const ask = () =>
    controller.ask({
      reviewId: controller.value.review!.requestId,
      acknowledged: true,
    });
  return { controller, codex, claude, sources, changed, prepare, ask };
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}
describe("manual AI request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
  });
  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose();
    vi.useRealTimers();
  });
  it("requires a unique registry and never requests inference during startup, inspect or review", async () => {
    expect(
      () =>
        new AssistantController(
          [provider("codex"), provider("codex")] as AIProvider[],
          () => setup().sources,
          () => {},
        ),
    ).toThrow("Register");
    const s = setup();
    await s.controller.inspect();
    s.prepare();
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
    expect(s.claude.respond).not.toHaveBeenCalled();
    expect(s.controller.value.selected).toBe("codex");
  });
  it("requires review, an exact one-time review id and per-request transfer consent", async () => {
    const s = setup();
    await expect(
      s.controller.ask({ reviewId: "none", acknowledged: true }),
    ).rejects.toThrow("Review");
    s.prepare();
    await expect(
      s.controller.ask({
        reviewId: s.controller.value.review!.requestId,
        acknowledged: false,
      }),
    ).rejects.toThrow("Acknowledge");
    await expect(
      s.controller.ask({ reviewId: "forged", acknowledged: true }),
    ).rejects.toThrow("Review");
    await expect(
      s.controller.ask({
        reviewId: s.controller.value.review!.requestId,
        acknowledged: true,
        apiKey: "x",
      }),
    ).rejects.toThrow("Unexpected");
    expect(s.codex.respond).not.toHaveBeenCalled();
  });
  it("streams text, usage and timing from one explicit request and consumes the review", async () => {
    const s = setup();
    s.prepare();
    await s.ask();
    await flush();
    expect(s.controller.value.review).toBeNull();
    expect(s.controller.value.responses[0]).toMatchObject({
      status: "completed",
      text: "Hello world",
      usage: { inputTokens: 8, outputTokens: 2 },
      firstTextAt: 1000000,
    });
    expect(
      s.changed.mock.calls.some(
        ([value]) => value.responses[0]?.status === "generating",
      ),
    ).toBe(true);
    expect(s.codex.inspect).toHaveBeenCalledOnce();
    expect(s.claude.respond).not.toHaveBeenCalled();
  });
  it("freezes the reviewed payload despite new capture/transcripts and renderer snapshot mutation", async () => {
    const s = setup();
    await s.controller.inspect();
    s.prepare("Frozen?", { screenshot: true });
    const view = s.controller.value;
    view.review!.question = "tampered";
    s.sources.capture.frame = {
      ...frame,
      dataUrl: "data:image/jpeg;base64,YWJj",
    };
    await s.ask();
    await flush();
    expect(s.codex.respond.mock.calls[0]![0].question).toBe("Frozen?");
    expect(s.codex.respond.mock.calls[0]![0].screenshot?.dataUrl).toBe(
      frame.dataUrl,
    );
  });
  it("rejects duplicate clicks before asynchronous authentication completes and never reuses the review", async () => {
    const s = setup();
    const pending = deferred<Awaited<ReturnType<typeof s.codex.inspect>>>();
    s.codex.inspect.mockReturnValueOnce(pending.promise);
    s.prepare();
    const id = s.controller.value.review!.requestId;
    await s.ask();
    await expect(
      s.controller.ask({ reviewId: id, acknowledged: true }),
    ).rejects.toThrow("already active");
    pending.resolve({ ...(await provider("codex").inspect()), ready: true });
    await flush();
    await expect(
      s.controller.ask({ reviewId: id, acknowledged: true }),
    ).rejects.toThrow("Review");
    expect(s.codex.respond).toHaveBeenCalledOnce();
  });
  it("expires reviews and rejects unsupported image capability", async () => {
    const s = setup();
    s.prepare();
    await vi.advanceTimersByTimeAsync(120001);
    expect(s.controller.value.review).toBeNull();
    expect(() => s.prepare("Image?", { screenshot: true })).toThrow(
      "cannot accept screenshots",
    );
  });
  it("rechecks auth before every request and never falls back to another provider", async () => {
    const s = setup();
    s.codex.inspect.mockResolvedValueOnce({
      ...(await provider("codex").inspect()),
      ready: false,
      auth: "missing",
      message: "Missing auth",
    });
    s.prepare();
    await s.ask();
    await flush();
    expect(s.controller.value.responses[0]!.error?.code).toBe("auth");
    expect(s.codex.respond).not.toHaveBeenCalled();
    expect(s.claude.respond).not.toHaveBeenCalled();
  });
  it.each([
    ["401 invalid key", "auth", "error"],
    ["429 rate limited", "rate-limit", "rate-limited"],
    ["ECONNRESET", "network", "error"],
    ["process exited", "process", "error"],
  ])("maps %s safely", async (message, code, status) => {
    const s = setup();
    s.codex.respond.mockImplementationOnce(() => {
      throw new Error(`${message} secret-credential`);
    });
    s.prepare();
    await s.ask();
    await flush();
    expect(s.controller.value.responses[0]).toMatchObject({
      status,
      error: { code },
    });
    expect(JSON.stringify(s.controller.value)).not.toContain(
      "secret-credential",
    );
  });
  it("rejects provider termination without a completed response and limits runaway output", async () => {
    const s = setup();
    s.codex.respond.mockImplementationOnce(async function* () {
      yield { type: "text", text: "partial" };
    });
    s.prepare();
    await s.ask();
    await flush();
    expect(s.controller.value.responses[0]!.error?.code).toBe("process");
    s.codex.respond.mockImplementationOnce(async function* () {
      yield { type: "text", text: "x".repeat(32001) };
    });
    s.prepare("Another");
    await s.ask();
    await flush();
    expect(s.controller.value.responses[1]!.text).toBe("");
  });
  it.each(["cancel", "clear", "switch", "session", "dispose", "timeout"])(
    "aborts execution and ignores late results on %s",
    async (action) => {
      const s = setup(100);
      const gate = deferred<void>();
      let signal: AbortSignal | undefined;
      s.codex.respond.mockImplementationOnce(
        async function* (_request, requestSignal) {
          void _request;
          signal = requestSignal;
          yield { type: "text", text: "partial" };
          await gate.promise;
          yield { type: "complete", text: "STALE" };
        },
      );
      s.prepare();
      await s.ask();
      await flush();
      if (action === "cancel") s.controller.cancel();
      if (action === "clear") s.controller.clear();
      if (action === "switch") s.controller.select("claude");
      if (action === "session")
        s.controller.captureChanged({
          ...s.sources.capture,
          sessionId: "new-capture",
        });
      if (action === "dispose") s.controller.dispose();
      if (action === "timeout") await vi.advanceTimersByTimeAsync(101);
      expect(signal?.aborted).toBe(true);
      gate.resolve();
      await flush();
      expect(JSON.stringify(s.controller.value)).not.toContain("STALE");
      if (action === "timeout")
        expect(s.controller.value.responses[0]!.error?.code).toBe("timeout");
    },
  );
  it("cancels while auth inspection is pending without invoking the provider", async () => {
    const s = setup();
    const pending = deferred<Awaited<ReturnType<typeof s.codex.inspect>>>();
    s.codex.inspect.mockReturnValueOnce(pending.promise);
    s.prepare();
    await s.ask();
    s.controller.cancel();
    pending.resolve(await provider("codex").inspect());
    await flush();
    expect(s.codex.respond).not.toHaveBeenCalled();
    expect(s.controller.value.responses[0]!.status).toBe("cancelled");
  });
  it("does not let a cancelled request overwrite a newer response in the same conversation", async () => {
    const s = setup();
    const late = deferred<void>();
    s.codex.respond.mockImplementationOnce(async function* () {
      await late.promise;
      yield { type: "complete", text: "STALE RESULT" };
    });
    s.prepare("Old");
    await s.ask();
    await flush();
    s.controller.cancel();
    s.prepare("New");
    await s.ask();
    await flush();
    late.resolve();
    await flush();
    expect(s.controller.value.responses.at(-1)).toMatchObject({
      question: "New",
      status: "completed",
      text: "Hello world",
    });
    expect(JSON.stringify(s.controller.value)).not.toContain("STALE RESULT");
  });
  it("continues with bounded question/answer text, and isolates provider and capture sessions", async () => {
    const s = setup();
    s.prepare("First");
    await s.ask();
    await flush();
    s.prepare("Follow-up");
    expect(s.controller.value.review!.history).toEqual([
      { question: "First", answer: "Hello world" },
    ]);
    const previousSession = s.controller.value.sessionId;
    s.controller.select("claude");
    s.prepare("Other provider");
    expect(s.controller.value.sessionId).not.toBe(previousSession);
    expect(s.controller.value.review!.history).toEqual([]);
    expect(s.controller.value.responses).toEqual([]);
    s.controller.select("codex");
    s.prepare("Return");
    expect(s.controller.value.review!.history).toEqual([]);
  });
  it("bounds response history and expires conversation memory", async () => {
    const s = setup();
    for (let index = 0; index < 12; index++) {
      s.prepare(`Question ${index}`);
      await s.ask();
      await flush();
    }
    expect(s.controller.value.responses).toHaveLength(8);
    s.prepare("Follow-up");
    expect(s.controller.value.review!.history).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(15 * 60000 + 1);
    expect(s.controller.value.responses).toEqual([]);
  });
  it("does not resend an unchanged screenshot on follow-up and retains no image in conversation text", async () => {
    const s = setup();
    await s.controller.inspect();
    s.prepare("Image", { screenshot: true });
    await s.ask();
    await flush();
    expect(() => s.prepare("Again", { screenshot: true })).toThrow(
      "unchanged screenshot",
    );
    s.prepare("Follow-up");
    expect(JSON.stringify(s.controller.value.review!.history)).not.toContain(
      "base64",
    );
  });
  it("requires exact provider and billing inputs and revokes readiness", async () => {
    const s = setup();
    expect(() => s.controller.select("automatic")).toThrow();
    await expect(s.controller.billing("true")).rejects.toThrow("boolean");
    await s.controller.billing(true);
    expect(s.claude.inspect).toHaveBeenLastCalledWith(true);
    await s.controller.billing(false);
    expect(s.controller.value.claudeApiBilling).toBe(false);
  });
});
