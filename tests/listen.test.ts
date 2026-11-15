import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ListenController,
  heardQuestion,
  latestQuestion,
  recentFinals,
} from "../src/main/listen/controller";
import { AssistantController } from "../src/main/ai/controller";
import { ChatGptProvider } from "../src/main/ai/plan/provider";
import { CaptureSessionController } from "../src/main/session";
import { DEFAULT_CONTEXT, type AIProvider } from "../src/shared/ai";
import {
  DEFAULT_TRANSCRIPTION_SETTINGS,
  type TranscriptionSnapshot,
  type TranscriptEvent,
} from "../src/shared/transcription";
import type { SessionSnapshot } from "../src/shared/contracts";
import { defaultConfig } from "../src/shared/modes";
import type { ModeContext } from "../src/shared/personal";
import { backend, deferred, frame, source } from "./helpers";
import { json, registration } from "./plan-fixtures";

const instances: {
  listen: ListenController;
  assistant: AssistantController;
}[] = [];
const sharing = { transcript: true, screen: true, acknowledged: true };
function setup(modeContext?: () => ModeContext) {
  let capture: SessionSnapshot = new CaptureSessionController(
    backend(),
    () => 3000,
    () => {},
  ).value;
  const speech: TranscriptionSnapshot = {
    revision: 0,
    state: "OFF",
    error: null,
    settings: { ...DEFAULT_TRANSCRIPTION_SETTINGS },
    runtimeInstalled: true,
    models: [],
    events: [],
    diagnostics: {
      loadMs: 0,
      averageLatencyMs: 0,
      queueLength: 0,
      droppedJobs: 0,
      gaps: 0,
      completedJobs: 0,
      workerCpuPercent: null,
      workerMemoryBytes: null,
    },
  };
  const account = {
    identity: "test-account",
    registration: registration(),
    token: vi.fn(async (_signal?: AbortSignal) => {
      void _signal;
      return "synthetic-only";
    }),
  };
  const requests: Record<string, unknown>[] = [];
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/models"))
      return json({
        models: [
          {
            slug: "verified-catalog",
            display_name: "Fixture",
            visibility: "list",
            input_modalities: ["text", "image"],
          },
        ],
      });
    requests.push(JSON.parse(init!.body as string) as Record<string, unknown>);
    return new Response(
      [
        "data: " +
          JSON.stringify({
            type: "response.output_text.delta",
            delta: "Grounded fixture answer",
          }) +
          "\n\n",
        "data: " +
          JSON.stringify({
            type: "response.completed",
            response: {
              status: "completed",
              model: "verified-catalog",
              output: [
                {
                  type: "message",
                  content: [
                    { type: "output_text", text: "Grounded fixture answer" },
                  ],
                },
              ],
            },
          }) +
          "\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const provider = new ChatGptProvider(account, transport);
  const claude: AIProvider = {
    id: "claude",
    inspect: async () => ({
      id: "claude",
      auth: "missing",
      ready: false,
      message: "fixture",
      capabilities: { text: false, images: false, tools: false },
      models: [],
    }),
    respond: vi.fn(),
    dispose: () => {},
  };
  const fresh = vi.fn(async (): Promise<SessionSnapshot> => ({
    ...capture,
    frame: { ...frame, capturedAt: Date.now() },
  }));
  // The assistant callback closes over the controller created below.
  const onAssistant = vi.fn();
  // eslint-disable-next-line prefer-const
  let listen: ListenController;
  const assistant = new AssistantController(
    [provider, claude],
    () => ({ capture, events: speech.events }),
    (value) => {
      onAssistant(value);
      listen?.observe();
    },
    90000,
    Date.now,
    () => fresh(),
    modeContext,
  );
  let mode = "general",
    monotonic = 0;
  const stop = vi.fn(() => {
    listen.stop();
    capture = {
      ...capture,
      state: "STOPPED",
      sessionId: null,
      consent: null,
      frame: null,
      epoch: capture.epoch + 1,
    };
    speech.state = "PAUSED";
    assistant.captureChanged(capture);
    listen.observe();
  });
  const ready = vi.fn(async () => {
    if (!(await provider.inspect()).ready) {
      await provider.discoverModels();
      provider.selectModel("verified-catalog");
    }
    await assistant.inspect();
  });
  const enableSpeech = vi.fn(async () => {
    speech.state = "LISTENING";
    listen.observe();
  });
  const ports = {
    capture: () => capture,
    speech: () => speech,
    prepare: vi.fn(
      async (input: import("../src/shared/contracts").PrepareCapture) => {
        capture = {
          ...capture,
          consent: input.consent,
          state: "READY",
          sessionId: "capture",
          epoch: capture.epoch + 1,
          source: input.consent.screen ? source : null,
        };
        assistant.captureChanged(capture);
      },
    ),
    start: vi.fn(async () => {
      capture = { ...capture, state: "ACTIVE", epoch: capture.epoch + 1 };
      for (const key of ["microphone", "systemAudio", "screen"] as const)
        capture.sources[key].state = capture.consent?.[key]
          ? "CAPTURING"
          : "DISABLED";
      listen.observe();
    }),
    stop,
    enableSpeech,
    speechReady: vi.fn(async () => {}),
    settleSpeech: vi.fn(async () => {}),
    binding: (includeModel = true) =>
      JSON.stringify([
        account.identity,
        assistant.routing.sessionId,
        assistant.routing.selected,
        mode,
        ...(includeModel ? [provider.selectedModel] : []),
      ]),
    owner: () =>
      JSON.stringify([
        account.identity,
        assistant.routing.selected,
        mode,
        provider.selectedModel,
      ]),
    ready,
    interruptAutomatic: vi.fn(),
  };
  const changed = vi.fn();
  listen = new ListenController(
    ports,
    assistant,
    changed,
    Date.now,
    () => monotonic,
  );
  instances.push({ listen, assistant });
  const start = (
    share = sharing,
    consent = {
      screen: true,
      microphone: true,
      systemAudio: true,
      acknowledged: true as const,
    },
  ) => listen.start({ capture: { consent }, sharing: share });
  const event = (
    text = "How should we fix this code?",
    source: "microphone" | "systemAudio" = "microphone",
    delta = -1000,
  ): TranscriptEvent => ({
    id: `${source}:${delta}`,
    sessionId: "capture",
    source,
    startMs: Date.now() + delta,
    endMs: Date.now() + delta + 500,
    text,
    state: "final",
    model: "tiny.en",
  });
  const update = (patch: Partial<SessionSnapshot>) => {
    capture = { ...capture, ...patch };
    assistant.captureChanged(capture);
    listen.observe();
  };
  return {
    listen,
    onAssistant,
    assistant,
    ports,
    provider,
    account,
    requests,
    transport,
    speech,
    start,
    event,
    update,
    fresh,
    changed,
    setMode: (value: string) => {
      mode = value;
      listen.observe();
    },
    setMonotonic: (value: number) => {
      monotonic = value;
      listen.observe();
    },
  };
}
async function flush() {
  await vi.advanceTimersByTimeAsync(1);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
});
afterEach(async () => {
  for (const s of instances.splice(0)) {
    s.listen.stop();
    await s.assistant.dispose();
  }
  vi.useRealTimers();
});

describe("deliberate conversation requests reuse the ChatGPT Responses transport", () => {
  it("stops a managed session when the speech worker fails instead of silently capturing", async () => {
    const s = setup();
    await s.start();
    s.speech.state = "ERROR";
    s.speech.error = "Worker exited";
    s.listen.observe();
    expect(s.ports.capture().state).toBe("STOPPED");
    expect(s.listen.value.sharing).toBeNull();
    expect(s.listen.value.message).toBe("Worker exited");
  });
  it("does not resurrect transparency context if sharing is revoked at request reservation", async () => {
    const s = setup();
    await s.start();
    s.onAssistant.mockImplementation(() => {
      if (s.assistant.value.responses.some((r) => r.status === "sending"))
        s.listen.revoke();
    });
    await s.listen.ask({ question: "help" });
    await flush();
    expect(s.listen.context()).toBeNull();
    expect(s.requests).toHaveLength(0);
  });
  it("does not apply a sharing choice to an account changed during local startup", async () => {
    const s = setup(),
      pending = deferred<void>();
    s.ports.speechReady.mockImplementationOnce(() => pending.promise);
    const starting = s.start();
    s.account.identity = "changed-during-start";
    pending.resolve();
    await starting;
    expect(s.listen.value.phase).toBe("listening");
    expect(s.listen.value.sharing).toBeNull();
    expect(s.ports.ready).not.toHaveBeenCalled();
  });
  it("does not start late capture after Stop interrupts local speech setup", async () => {
    const s = setup(),
      pending = deferred<void>();
    s.ports.speechReady.mockImplementationOnce(() => pending.promise);
    const starting = s.start(),
      rejected = expect(starting).rejects.toThrow(/cancelled/);
    s.ports.stop();
    pending.resolve();
    await rejected;
    expect(s.ports.prepare).not.toHaveBeenCalled();
    expect(s.listen.value.sharing).toBeNull();
  });
  it("starts authorised local transcription automatically, with no inference on Start", async () => {
    const s = setup();
    await s.start();
    expect(s.ports.enableSpeech).toHaveBeenCalledTimes(1);
    expect(s.listen.value.phase).toBe("listening");
    expect(s.listen.value.sharing).toMatchObject({
      transcript: true,
      screen: true,
    });
    expect(s.requests).toHaveLength(0);
  });
  it("keeps local capture, remote scope and individual triggers independent", async () => {
    const s = setup();
    await s.start({ transcript: false, screen: false, acknowledged: false });
    expect(s.listen.value.sharing).toBeNull();
    expect(s.speech.state).toBe("LISTENING");
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow(
      /allow ChatGPT/,
    );
    expect(s.transport).not.toHaveBeenCalled();
    await s.listen.authorise(sharing);
    expect(s.requests).toHaveLength(0);
  });
  it("requires a distinct sharing acknowledgement before capture starts", async () => {
    const s = setup();
    await expect(s.start({ ...sharing, acknowledged: false })).rejects.toThrow(
      /Authorise sharing/,
    );
    expect(s.ports.prepare).not.toHaveBeenCalled();
  });
  it("fails before capture when local speech setup is unavailable", async () => {
    const s = setup();
    s.ports.speechReady.mockRejectedValueOnce(new Error("Missing model"));
    await expect(s.start()).rejects.toThrow("Missing model");
    expect(s.ports.start).not.toHaveBeenCalled();
    expect(s.requests).toHaveLength(0);
  });
  it("stops capture if automatic transcription fails", async () => {
    const s = setup();
    s.ports.enableSpeech.mockRejectedValueOnce(new Error("Whisper failed"));
    await expect(s.start()).rejects.toThrow("Whisper failed");
    expect(s.ports.stop).toHaveBeenCalled();
    expect(s.listen.value.managed).toBe(false);
  });
  it("sends the latest detected question, source-labelled finals and a fresh approved image without a review", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [
      s.event("What does this code do?", "microphone", -10000),
      s.event("How should we fix this code?", "systemAudio"),
    ];
    await s.listen.ask({ question: "" });
    await flush();
    expect(s.requests).toHaveLength(1);
    const body = JSON.stringify(s.requests[0]);
    expect(body).toContain("How should we fix this code?");
    expect(body).toContain("You (microphone)");
    expect(body).toContain("Them (system audio)");
    expect(body).toContain("input_image");
    expect(body).toContain('store":false');
    expect(s.fresh).toHaveBeenCalledTimes(1);
    expect(s.assistant.value.review).toBeNull();
    expect(s.assistant.value.responses.at(-1)?.text).toBe(
      "Grounded fixture answer",
    );
    expect(s.assistant.value.responses.at(-1)?.automatic).toBeUndefined();
    expect(s.listen.context()?.transcripts.map((e) => e.source)).toEqual([
      "microphone",
      "systemAudio",
    ]);
  });
  it.each([
    "help",
    "What should I say next?",
    "Explain this code",
    "What did they just ask me?",
    "Summarise what we've discussed",
    "Why is the loop slow?",
  ])("uses approved context for typed '%s'", async (question) => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    await s.listen.ask({ question });
    await flush();
    const body = JSON.stringify(s.requests[0]);
    expect(body).toContain(question);
    expect(body).toContain("How should we fix this code?");
    expect(body).toContain("input_image");
    expect(s.assistant.value.review).toBeNull();
  });
  it("asks for grounded guidance without inventing a detected question", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    s.speech.events = [s.event("We are reviewing the code together.")];
    await s.listen.ask({ question: "" });
    await flush();
    expect(s.listen.context()?.question).toBe("");
    expect(JSON.stringify(s.requests[0])).toContain(
      "without inventing a question",
    );
  });
  it("explains silence locally without provider inference", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow(
      /No recent conversation/,
    );
    expect(s.requests).toHaveLength(0);
    expect(s.listen.value.message).toContain("No recent conversation");
  });
  it("never sends audio, history, knowledge or an unapproved screen", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    s.speech.events = [s.event()];
    await s.listen.ask({ question: "help" });
    await flush();
    const context = s.listen.context()!;
    expect(context.screenshot).toBeNull();
    expect(context.history).toEqual([]);
    expect(context.knowledge).toBeUndefined();
    expect(context.workspaceContext).toBeUndefined();
    expect(s.fresh).not.toHaveBeenCalled();
    expect(JSON.stringify(s.requests)).not.toContain("input_audio");
  });
  it("does not send any transcript when only screen sharing is allowed", async () => {
    const s = setup();
    await s.start({ transcript: false, screen: true, acknowledged: true });
    s.speech.events = [s.event("Secret audio text")];
    await s.listen.ask({ question: "help" });
    await flush();
    expect(s.listen.context()?.transcripts).toEqual([]);
    expect(JSON.stringify(s.requests)).not.toContain("Secret audio text");
  });
  it("allows another deliberate request with an unchanged fresh screenshot", async () => {
    const s = setup();
    await s.start();
    await s.listen.ask({ question: "Explain this code" });
    await flush();
    await s.listen.ask({ question: "help" });
    await flush();
    expect(s.requests).toHaveLength(2);
    expect(
      s.requests.every((body) => JSON.stringify(body).includes("input_image")),
    ).toBe(true);
  });
  it("does not let renderer context fields expand a session scope", async () => {
    const s = setup();
    await s.start();
    await expect(
      s.listen.ask({ question: "help", options: { history: true } }),
    ).rejects.toThrow();
    await expect(
      s.listen.authorise({ ...sharing, knowledgeIds: ["secret"] }),
    ).rejects.toThrow();
    expect(s.requests).toHaveLength(0);
  });
  it("rejects sharing for a source that was never captured", async () => {
    const s = setup();
    await s.start(
      { transcript: false, screen: false, acknowledged: false },
      {
        microphone: true,
        systemAudio: false,
        screen: false,
        acknowledged: true,
      },
    );
    await expect(s.listen.authorise(sharing)).rejects.toThrow(/No screen/);
    expect(s.requests).toHaveLength(0);
  });
  it("bounds rolling context, ignores partials, old sessions, future events and unapproved sources", async () => {
    const s = setup();
    await s.start(
      { transcript: true, screen: false, acknowledged: true },
      {
        microphone: true,
        systemAudio: false,
        screen: false,
        acknowledged: true,
      },
    );
    s.speech.events = [
      s.event("Before the window", "microphone", -1_801_000),
      { ...s.event("Partial"), state: "partial" },
      { ...s.event("Wrong session"), sessionId: "other" },
      s.event("Future", "microphone", 10000),
      s.event("Not authorised", "systemAudio"),
      ...Array.from({ length: 400 }, (_, i) =>
        s.event(
          `How do we fix code ${i}? ${"detail ".repeat(12)}`,
          "microphone",
          -1_000_000 + i * 2500,
        ),
      ),
    ];
    expect(
      recentFinals(s.ports.capture(), s.speech.events, Date.now()),
    ).toHaveLength(48);
    await s.listen.ask({ question: "help" });
    await flush();
    const c = s.listen.context()!;
    expect(c.prompt.length).toBeLessThanOrEqual(40000);
    const sent = c.transcripts.reduce((n, e) => n + e.text.length, 0);
    expect(sent).toBeLessThanOrEqual(24000);
    // The budget is used, and the newest lines are the ones kept.
    expect(sent).toBeGreaterThan(20000);
    expect(c.transcripts.at(-1)?.text).toContain("code 399?");
    expect(JSON.stringify(s.requests)).not.toMatch(
      /Wrong session|Partial|Not authorised|Future|Before the window|code 0\?/,
    );
  });
  it("gives up the oldest speech, not the request or the last answer, in a long session", async () => {
    // A custom mode with long instructions, as a prepared interview mode has.
    const s = setup(() => ({
      mode: {
        ...defaultConfig().modes[0]!,
        instructions: "Prefer concrete examples from my experience. ".repeat(
          90,
        ),
      },
      outputLanguage: "default",
    }));
    await s.start({ transcript: true, screen: false, acknowledged: true });
    s.speech.events = [s.event()];
    await s.listen.ask({ question: "Explain this code" });
    await flush();
    // Half an hour of short lines: the labels alone overrun the text limit.
    s.speech.events = Array.from({ length: 400 }, (_, i) =>
      s.event(
        `Line ${i} ${"word ".repeat(11)}`,
        "systemAudio",
        -1_000_000 + i * 2500,
      ),
    );
    await s.listen.ask({ question: "Make that shorter" });
    await flush();
    expect(s.requests).toHaveLength(2);
    const c = s.listen.context()!;
    expect(c.prompt.length).toBeLessThanOrEqual(40000);
    expect(c.history.map((turn) => turn.question)).toEqual([
      "Explain this code",
    ]);
    expect(c.transcripts.at(-1)?.text).toContain("Line 399 ");
    expect(c.transcripts.length).toBeLessThan(400);
    expect(c.transcripts.length).toBeGreaterThan(200);
    expect(c.notices).toContain(
      "Older context was trimmed to the total text limit.",
    );
  });
  it("draws on what was said earlier in the session, not only the last exchange", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    s.speech.events = [
      s.event("Our budget is forty thousand pounds", "systemAudio", -600_000),
      s.event("Remind me what the budget was", "systemAudio"),
    ];
    await s.listen.ask({ question: "" });
    await flush();
    const body = JSON.stringify(s.requests[0]);
    expect(body).toContain("[-10:00] Them (system audio): Our budget is forty");
    expect(body).toContain("Remind me what the budget was");
  });
  it("respects transcript removals from the existing context review", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [
      s.event("Do we expose this secret code?", "microphone", -10000),
      s.event(),
    ];
    await s.assistant.prepare({
      question: "Review",
      options: { ...DEFAULT_CONTEXT, microphone: true },
    });
    s.assistant.removeContext({
      reviewId: s.assistant.value.review!.requestId,
      kind: "transcripts",
      index: 0,
    });
    s.assistant.discardReview();
    await s.listen.ask({ question: "help" });
    await flush();
    expect(JSON.stringify(s.requests)).not.toContain("secret code");
  });
  it("keeps a pending explicit review separate from session requests", async () => {
    const s = setup();
    await s.start();
    await s.assistant.prepare({
      question: "Explicit selection",
      options: DEFAULT_CONTEXT,
    });
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow(
      /pending context review/,
    );
    expect(s.assistant.value.review?.question).toBe("Explicit selection");
    expect(s.requests).toHaveLength(0);
  });
  it("revokes immediately and suppresses screenshot preparation after revocation", async () => {
    const s = setup();
    await s.start();
    const pending = deferred<SessionSnapshot>();
    s.fresh.mockReturnValueOnce(pending.promise);
    const asking = s.listen.ask({ question: "help" });
    const rejected = expect(asking).rejects.toThrow();
    await flush();
    s.listen.revoke();
    pending.resolve({
      ...s.ports.capture(),
      frame: { ...frame, capturedAt: Date.now() },
    });
    await rejected;
    await flush();
    expect(s.requests).toHaveLength(0);
    expect(s.listen.context()).toBeNull();
  });
  it.each(["pause", "stop", "account", "mode", "provider", "clear"])(
    "cancels pending work on %s",
    async (change) => {
      const s = setup();
      await s.start();
      const pending = deferred<string>();
      s.account.token.mockImplementationOnce(() => pending.promise);
      await s.listen.ask({ question: "help" });
      await flush();
      if (change === "pause")
        s.update({ state: "PAUSED", epoch: s.ports.capture().epoch + 1 });
      if (change === "stop") s.ports.stop();
      if (change === "account") {
        s.account.identity = "other-account";
        s.listen.observe();
      }
      if (change === "mode") s.setMode("coding");
      if (change === "provider") s.assistant.select("claude");
      if (change === "clear") s.assistant.clear();
      pending.resolve("synthetic-late-token");
      await flush();
      expect(s.requests).toHaveLength(0);
      expect(s.listen.context()).toBeNull();
      expect(s.assistant.value.responses.at(-1)?.status).not.toBe("completed");
    },
  );
  it("preserves session sharing on pause, blocks requests and automatically transcribes on resume", async () => {
    const s = setup();
    await s.start();
    s.speech.state = "PAUSED";
    s.update({ state: "PAUSED", epoch: 3 });
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow(/Resume/);
    expect(s.listen.value.sharing).not.toBeNull();
    s.update({ state: "ACTIVE", epoch: 4 });
    await flush();
    expect(s.ports.enableSpeech).toHaveBeenCalledTimes(2);
    s.listen.observe();
    expect(s.ports.enableSpeech).toHaveBeenCalledTimes(2);
  });
  it("does not immediately undo an explicit transcription pause", async () => {
    const s = setup();
    await s.start();
    s.speech.state = "PAUSED";
    s.listen.observe();
    await flush();
    expect(s.ports.enableSpeech).toHaveBeenCalledTimes(1);
  });
  it("expires on elapsed time even after a backward wall-clock change", async () => {
    const s = setup();
    await s.start();
    s.setMonotonic(3600001);
    expect(s.listen.value.sharing).not.toBeNull();
    vi.setSystemTime(Date.now() - 86_400_000);
    s.setMonotonic(86_400_001);
    expect(s.listen.value.sharing).toBeNull();
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow();
    expect(s.requests).toHaveLength(0);
  });
  it("does not restore a scope after revoke races asynchronous readiness", async () => {
    const s = setup();
    await s.start();
    const pending = deferred<void>();
    s.ports.ready.mockImplementationOnce(() => pending.promise);
    const authorising = s.listen.authorise(sharing);
    const rejected = expect(authorising).rejects.toThrow(/changed/);
    s.listen.revoke();
    pending.resolve();
    await rejected;
    expect(s.listen.value.sharing).toBeNull();
  });
  it("coalesces simultaneous Answer triggers and never queues retries", async () => {
    const s = setup();
    await s.start();
    const pending = deferred<SessionSnapshot>();
    s.fresh.mockReturnValueOnce(pending.promise);
    const asking = s.listen.ask({ question: "help" });
    await flush();
    await s.listen.ask({ question: "help" });
    pending.resolve({
      ...s.ports.capture(),
      frame: { ...frame, capturedAt: Date.now() },
    });
    await asking;
    await flush();
    expect(s.requests).toHaveLength(1);
  });
  it("reuses P7's local clear-question detection without enabling Live Assist", () => {
    const s = setup();
    expect(
      latestQuestion([
        s.event("What does this code do?"),
        s.event("Who cares?", "microphone", -500),
      ]),
    ).toBe("What does this code do");
    expect(s.ports.interruptAutomatic).not.toHaveBeenCalled();
  });
  it.each([
    "Tell me about a time you handled a difficult customer",
    "Walk me through your approach to this design",
    "How many requests per second does the service handle",
  ])("detects the interview prompt '%s'", (text) => {
    const s = setup();
    expect(latestQuestion([s.event(text, "systemAudio")])).toBe(text);
  });
  it("includes the previous answer so follow-ups such as 'shorter' work", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    await s.listen.ask({ question: "Explain this code" });
    await flush();
    await s.listen.ask({ question: "Make that shorter" });
    await flush();
    expect(s.requests).toHaveLength(2);
    expect(s.listen.context()?.history).toEqual([
      {
        requestId: expect.any(String),
        question: "Explain this code",
        answer: "Grounded fixture answer",
      },
    ]);
    expect(JSON.stringify(s.requests[1])).toContain("Grounded fixture answer");
  });
  it("finalizes speech in progress so the newest question is sent", async () => {
    const s = setup();
    await s.start();
    const partial = {
      ...s.event("What is your notice period", "systemAudio", -500),
      state: "partial" as const,
    };
    s.speech.events = [
      s.event("Tell me about your last project", "systemAudio", -20000),
      partial,
    ];
    // Finalizing turns the line being spoken into final text.
    s.ports.settleSpeech.mockImplementationOnce(async () => {
      s.speech.events = [
        s.speech.events[0]!,
        { ...partial, text: "What is your notice period?", state: "final" },
      ];
    });
    await s.listen.ask({ question: "" });
    await flush();
    expect(s.ports.settleSpeech).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s.requests[0])).toContain(
      "What is your notice period?",
    );
  });
  it("does not wait for speech when only the screen is shared", async () => {
    const s = setup();
    await s.start({ transcript: false, screen: true, acknowledged: true });
    await s.listen.ask({ question: "help" });
    await flush();
    expect(s.ports.settleSpeech).not.toHaveBeenCalled();
  });
  it("sends a typed question as text only when sharing is off", async () => {
    const s = setup();
    await s.start({ transcript: false, screen: false, acknowledged: false });
    s.speech.events = [s.event("Private conversation text")];
    await s.listen.ask({ question: "What is a binary search tree?" });
    await flush();
    expect(s.requests).toHaveLength(1);
    const body = JSON.stringify(s.requests[0]);
    expect(body).toContain("What is a binary search tree?");
    expect(body).not.toContain("Private conversation text");
    expect(body).not.toContain("input_image");
    expect(s.fresh).not.toHaveBeenCalled();
  });
  it("finalizes speech while the connection is checked, not after it", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    const pending = deferred<void>();
    s.ports.ready.mockImplementationOnce(() => pending.promise);
    const asking = s.listen.ask({ question: "" });
    await flush();
    expect(s.ports.settleSpeech).toHaveBeenCalledTimes(1);
    expect(s.requests).toHaveLength(0);
    pending.resolve();
    await asking;
    await flush();
    expect(s.requests).toHaveLength(1);
  });
});

describe("a newer request replaces the answer in progress", () => {
  /** Leaves the next request waiting on its token, as a slow answer would. */
  function hold(s: ReturnType<typeof setup>) {
    const pending = deferred<string>();
    s.account.token.mockImplementationOnce(() => pending.promise);
    return pending;
  }
  it("cancels the answer being written and answers the new question", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    hold(s);
    await s.listen.ask({ question: "Explain this code" });
    await flush();
    expect(s.assistant.value.responses.at(-1)?.status).toBe("sending");
    await s.listen.ask({ question: "What is a mutex?" });
    await flush();
    expect(
      s.assistant.value.responses.map(({ question, status }) => [
        question,
        status,
      ]),
    ).toEqual([
      ["Explain this code", "cancelled"],
      ["What is a mutex?", "completed"],
    ]);
    expect(s.requests).toHaveLength(1);
    expect(JSON.stringify(s.requests[0])).toContain("What is a mutex?");
    // A cancelled answer is not carried into the conversation history.
    expect(s.listen.context()?.history).toEqual([]);
  });
  it("treats a repeated trigger as one request until the answer is under way", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    const pending = hold(s);
    await s.listen.ask({ question: "" });
    await flush();
    await s.listen.ask({ question: "" });
    await flush();
    expect(s.assistant.value.responses).toHaveLength(1);
    expect(s.assistant.value.responses[0]?.status).toBe("sending");
    // Pressed again later, it means "answer what is happening now".
    await vi.advanceTimersByTimeAsync(1600);
    await s.listen.ask({ question: "" });
    await flush();
    pending.resolve("synthetic-late-token");
    await flush();
    expect(s.assistant.value.responses.map((r) => r.status)).toEqual([
      "cancelled",
      "completed",
    ]);
    expect(s.requests).toHaveLength(1);
  });
  it("runs a different question asked during preparation instead of dropping it", async () => {
    const s = setup();
    await s.start();
    s.speech.events = [s.event()];
    const pending = deferred<SessionSnapshot>();
    s.fresh.mockReturnValueOnce(pending.promise);
    const first = s.listen.ask({ question: "" });
    await flush();
    await s.listen.ask({ question: "What is a mutex?" });
    expect(s.listen.value.busy).toBe(true);
    pending.resolve({
      ...s.ports.capture(),
      frame: { ...frame, capturedAt: Date.now() },
    });
    await first;
    await flush();
    await flush();
    const last = s.assistant.value.responses.at(-1);
    expect(last?.question).toBe("What is a mutex?");
    expect(last?.status).toBe("completed");
    expect(JSON.stringify(s.requests.at(-1))).toContain("What is a mutex?");
    expect(s.listen.value.busy).toBe(false);
  });
  it("does not cancel an answer that another feature started", async () => {
    const s = setup();
    await s.start();
    hold(s);
    await s.assistant.prepare({
      question: "Explicit selection",
      options: DEFAULT_CONTEXT,
    });
    await s.assistant.ask({
      reviewId: s.assistant.value.review!.requestId,
      acknowledged: true,
    });
    await expect(s.listen.ask({ question: "help" })).rejects.toThrow(
      /already in progress/,
    );
    expect(s.assistant.value.responses.at(-1)?.status).toBe("sending");
  });
});

describe("questions heard in the conversation", () => {
  it.each([
    "What experience do you have with distributed systems",
    "What kind of teams have you managed",
    "Who was your manager at that company",
    "Is your team using feature flags today",
    "You have led a team of this size before?",
    "Any questions for us about the role",
  ])("recognises '%s'", (text) => {
    const s = setup();
    expect(latestQuestion([s.event(text, "systemAudio")])).toBe(
      text.replace(/\?$/, ""),
    );
  });
  it.each([
    "That is the plan for next week, right?",
    "What a lovely office you have",
    "We shipped the release on Friday.",
  ])("does not treat '%s' as a question to answer", (text) => {
    const s = setup();
    expect(latestQuestion([s.event(text, "systemAudio")])).toBeNull();
  });
  it("skips the user's own question when the other side is audible", () => {
    const s = setup();
    expect(
      heardQuestion([
        s.event("Tell me about your pricing model", "systemAudio", -9000),
        s.event("What does that include for support?", "microphone"),
      ]),
    ).toMatchObject({
      source: "systemAudio",
      text: "Tell me about your pricing model",
    });
    // In a room there is only the microphone, so everyone is heard on it.
    expect(
      heardQuestion([s.event("What does that include for support?")])?.source,
    ).toBe("microphone");
  });
  it("offers the question just heard and clears it once it has been asked about", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    expect(s.listen.value.latestQuestion).toBeNull();
    s.speech.events = [s.event("What is your notice period?", "systemAudio")];
    s.listen.observe();
    expect(s.listen.value.latestQuestion).toBe("What is your notice period");
    expect(s.requests).toHaveLength(0);
    await s.listen.ask({ question: "" });
    await flush();
    expect(s.listen.value.latestQuestion).toBeNull();
    // A typed question about something else leaves the next one on offer.
    s.speech.events = [
      ...s.speech.events,
      s.event("Why did you leave your last job?", "systemAudio", -200),
    ];
    await s.listen.ask({ question: "What is a notice period?" });
    await flush();
    expect(s.listen.value.latestQuestion).toBe("Why did you leave your last job");
  });
  it("stops offering a question after a minute", async () => {
    const s = setup();
    await s.start({ transcript: true, screen: false, acknowledged: true });
    s.speech.events = [
      s.event("What is your notice period?", "systemAudio", -61_000),
    ];
    s.listen.observe();
    expect(s.listen.value.latestQuestion).toBeNull();
  });
});

describe("automatic answers are an explicit, bounded opt-in", () => {
  const audioOnly = { transcript: true, screen: false, acknowledged: true };
  async function settle() {
    for (let i = 0; i < 3; i++) await flush();
  }
  it("is off by default, and needs an active session sharing its transcript", async () => {
    const s = setup();
    expect(() => s.listen.setAuto({ enabled: true })).toThrow(/transcript/);
    await s.start({ transcript: false, screen: true, acknowledged: true });
    expect(s.listen.value.auto).toBe(false);
    expect(() => s.listen.setAuto({ enabled: true })).toThrow(/transcript/);
    expect(() => s.listen.setAuto({ enabled: "yes" })).toThrow();
    expect(() => s.listen.setAuto({ enabled: true, limit: 0 })).toThrow();
    s.speech.events = [s.event("What is your notice period?", "systemAudio")];
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(0);
  });
  it("answers a newly heard question once, with no review", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.listen.setAuto({ enabled: true });
    expect(s.listen.value.auto).toBe(true);
    s.speech.events = [s.event("What is your notice period?", "systemAudio")];
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(1);
    expect(JSON.stringify(s.requests[0])).toContain(
      "What is your notice period?",
    );
    expect(s.assistant.value.review).toBeNull();
    expect(s.assistant.value.responses.at(-1)?.status).toBe("completed");
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(1);
    expect(s.ports.interruptAutomatic).not.toHaveBeenCalled();
  });
  it("leaves a question that was already heard when it was turned on", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.speech.events = [s.event("What is your notice period?", "systemAudio")];
    s.listen.setAuto({ enabled: true });
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(0);
    expect(s.listen.value.latestQuestion).toBe("What is your notice period");
  });
  it("ignores stale questions and the user's own questions on a call", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.listen.setAuto({ enabled: true });
    s.speech.events = [
      s.event("Why did you leave your last job?", "systemAudio", -25_000),
    ];
    s.listen.observe();
    await settle();
    s.speech.events = [
      s.event("We use a weekly release train", "systemAudio", -4000),
      s.event("How often do you ship to production?", "microphone"),
    ];
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(0);
  });
  it("spaces answers out and then answers the newer question", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.listen.setAuto({ enabled: true });
    s.speech.events = [s.event("What is your notice period?", "systemAudio")];
    s.listen.observe();
    await settle();
    s.speech.events = [
      ...s.speech.events,
      s.event("Why did you leave your last job?", "systemAudio", -100),
    ];
    s.listen.observe();
    await settle();
    expect(s.requests).toHaveLength(1);
    s.setMonotonic(8001);
    await settle();
    expect(s.requests).toHaveLength(2);
    expect(JSON.stringify(s.requests[1])).toContain(
      "Why did you leave your last job?",
    );
  });
  it("never interrupts an answer in progress, and answers when it ends", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.listen.setAuto({ enabled: true });
    s.speech.events = [s.event("We are reviewing the code together.")];
    const pending = deferred<string>();
    s.account.token.mockImplementationOnce(() => pending.promise);
    await s.listen.ask({ question: "Summarise so far" });
    await flush();
    s.speech.events = [
      ...s.speech.events,
      s.event("What is your notice period?", "systemAudio", -100),
    ];
    s.listen.observe();
    await settle();
    expect(s.assistant.value.responses).toHaveLength(1);
    expect(s.assistant.value.responses[0]?.status).toBe("sending");
    pending.resolve("synthetic-late-token");
    await settle();
    expect(s.assistant.value.responses.map((r) => r.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(s.assistant.value.responses[1]?.question).toBe("");
  });
  it.each(["revoke", "stop", "re-authorise", "off"])(
    "ends on %s",
    async (change) => {
      const s = setup();
      await s.start(audioOnly);
      s.listen.setAuto({ enabled: true });
      if (change === "revoke") s.listen.revoke();
      if (change === "stop") s.ports.stop();
      if (change === "re-authorise") await s.listen.authorise(audioOnly);
      if (change === "off") s.listen.setAuto({ enabled: false });
      expect(s.listen.value.auto).toBe(false);
      s.speech.events = [s.event("What is your notice period?", "systemAudio")];
      s.listen.observe();
      await settle();
      expect(s.requests).toHaveLength(0);
    },
  );
  it("pauses itself after sixty answers in a session", async () => {
    const s = setup();
    await s.start(audioOnly);
    s.listen.setAuto({ enabled: true });
    for (let i = 0; i < 62; i++) {
      s.speech.events = [
        s.event(`What is the answer to item ${i}?`, "systemAudio", -900 + i),
      ];
      s.setMonotonic((i + 1) * 8001);
      await settle();
    }
    expect(s.requests).toHaveLength(60);
    expect(s.listen.value.auto).toBe(false);
    expect(s.listen.value.message).toMatch(/paused after 60/);
  });
});
