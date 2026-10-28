import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantController } from "../src/main/ai/controller";
import { CaptureSessionController } from "../src/main/session";
import { LiveScheduler } from "../src/main/intelligence/live";
import {
  DEFAULT_CONTEXT,
  type AIRequest,
  type ProviderId,
  type ProviderEvent,
} from "../src/shared/ai";
import {
  DEFAULT_INTELLIGENCE,
  type LiveContext,
  type DetectedQuestion,
} from "../src/shared/intelligence";
import { defaultConfig } from "../src/shared/modes";
import {
  EMPTY_FACTS,
  type Person,
  type MemoryRecord,
  type WorkspaceSelection,
  type WorkspaceAIContext,
} from "../src/shared/workspace";
import { workspaceHarness } from "./workspace-helpers";
import type { WorkspacePorts } from "../src/main/workspace/controller";
import { backend, deferred } from "./helpers";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
const empty: WorkspaceSelection = {
  purpose: "answer",
  eventId: null,
  description: false,
  personIds: [],
  memoryIds: [],
  meetingIds: [],
};
async function setup(extra: Partial<WorkspacePorts> = {}) {
  const provider = (id: ProviderId) => ({
    id,
    inspect: vi.fn(async () => ({
      id,
      auth: "chatgpt" as const,
      ready: true,
      message: "Fixture only",
      capabilities: { text: true, images: false, tools: false as const },
      models: ["fixture"],
      selectedModel: "fixture",
    })),
    respond: vi.fn(async function* (
      request: AIRequest,
      _signal: AbortSignal,
      valid?: () => boolean,
    ): AsyncGenerator<ProviderEvent> {
      void _signal;
      if (valid && !valid()) throw new Error("Scope changed");
      yield {
        type: "complete",
        text: `Prepared from supplied sources. [${request.workspaceContext?.entries[0]?.ref}]`,
      };
    }),
    dispose: vi.fn(),
  });
  const codex = provider("codex"),
    claude = provider("claude"),
    capture = new CaptureSessionController(backend(), () => 3000, vi.fn())
      .value;
  const retrieve = vi.fn(async (query: string, selection: WorkspaceSelection) =>
    h.controller.buildContext(query, selection),
  );
  const assistant = new AssistantController(
    [codex, claude],
    () => ({ capture, events: [] }),
    vi.fn(),
    90000,
    Date.now,
    undefined,
    () => ({ mode: defaultConfig().modes[0]!, outputLanguage: "default" }),
    undefined,
    retrieve,
  );
  const h = await workspaceHarness({ assistant, ...extra });
  const config = { ...h.controller.value.config, memoryEnabled: true };
  await h.command("configure", { settings: config, acknowledged: true });
  const person = (await h.command("save-person", {
    id: "new",
    manual: { ...EMPTY_FACTS, name: "Test Participant" },
    notes: "User-authored test note",
    meetingIds: [],
    updatedAt: 0,
  })) as Person;
  const memory = (await h.command("save-memory", {
    id: "new",
    updatedAt: 0,
    type: "note",
    description: "The prototype release is Thursday; checklist due Wednesday.",
    personIds: [],
    topics: ["prototype"],
    status: "open",
    review: "approved",
  })) as MemoryRecord;
  await assistant.inspect();
  const selection = {
    ...empty,
    personIds: [person.id],
    memoryIds: [memory.id],
  };
  cleanups.push(async () => {
    await assistant.dispose();
    await h.close();
  });
  const prepare = (workspaceSelection?: WorkspaceSelection) =>
    assistant.prepare({
      question: "Prepare for the prototype discussion",
      options: { ...DEFAULT_CONTEXT, history: false },
      ...(workspaceSelection ? { workspaceSelection } : {}),
    });
  const complete = async () => {
    for (let i = 0; i < 40; i++) {
      if (
        !["sending", "generating"].includes(
          assistant.value.responses.at(-1)?.status ?? "",
        )
      )
        return;
      await new Promise((r) => setTimeout(r, 2));
    }
    throw new Error("Fixture stream timed out");
  };
  return {
    ...h,
    assistant,
    codex,
    claude,
    person,
    memory,
    retrieve,
    selection,
    prepare,
    complete,
  };
}
describe("P10 exact AI context and brief consent", () => {
  async function calendar(h: Awaited<ReturnType<typeof setup>>) {
    h.reads.mockImplementation(async (_service, url) => {
      void _service;
      return url.endsWith("calendarList") || url.includes("calendarList?")
        ? {
            items: [
              {
                id: "calendar",
                summary: "Fixture calendar",
                timeZone: "Europe/London",
                accessRole: "reader",
              },
            ],
          }
        : {
            items: [
              {
                id: "event",
                summary: "Harmless prototype",
                description: "Prototype release Thursday",
                updated: new Date().toISOString(),
                start: {
                  dateTime: new Date(Date.now() + 86400000).toISOString(),
                },
                end: {
                  dateTime: new Date(Date.now() + 88200000).toISOString(),
                },
                recurringEventId: "series",
              },
            ],
          };
    });
    await h.command("connect-calendar", { acknowledged: true });
    await h.command("list-calendars");
    await h.command("configure", {
      settings: {
        ...h.controller.value.config,
        selectedCalendarIds: ["calendar"],
      },
      acknowledged: true,
    });
    await h.command("refresh-calendar");
    return (
      await h.controller.query({
        scopeId: h.controller.value.scopeId,
        query: { kind: "event", query: "", offset: 0 },
      })
    ).items[0] as import("../src/shared/workspace").CalendarEvent;
  }
  it("generates an event-bound ephemeral brief, saves only under chosen policy and invalidates saved context", async () => {
    const h = await setup(),
      event = await calendar(h),
      selection = { ...h.selection, purpose: "brief", eventId: event.id };
    await h.command("prepare-brief", { selection, knowledgeIds: [] });
    await h.assistant.ask({
      reviewId: h.assistant.value.review!.requestId,
      acknowledged: true,
    });
    await h.complete();
    const response = h.assistant.value.responses.at(-1)!;
    expect(h.db().workspaceList("brief")).toHaveLength(0);
    await expect(
      h.command("save-brief", {
        requestId: response.requestId,
        acknowledged: true,
      }),
    ).rejects.toThrow("enable brief persistence");
    await h.command("configure", {
      settings: { ...h.controller.value.config, briefPersistence: true },
      acknowledged: true,
    });
    await h.command("save-brief", {
      requestId: response.requestId,
      acknowledged: true,
    });
    expect(h.controller.value.preparedEventIds).toContain(event.id);
    expect(await h.command("saved-brief", event.id)).toMatchObject({
      text: response.text,
      eventId: event.id,
    });
    await h.command("delete-person", { id: h.person.id, acknowledged: true });
    expect(await h.command("saved-brief", event.id)).toBeNull();
  });
  it("keeps independent saved meetings when a calendar association is removed", async () => {
    const get = vi.fn(async () => ({
      id: "saved",
      title: "Independent title",
      notes: "Actual saved notes",
      actions: [{ status: "open", text: "A saved commitment" }],
    }));
    const h = await setup({
        meetings: {
          value: { locked: false },
          requireStore: () => ({ get }),
        } as never,
      }),
      event = await calendar(h);
    const items = (await h.command("associate-meeting", {
      eventId: event.id,
      meetingId: "saved",
      acknowledged: true,
    })) as { items: { association: { id: string }; notes: string }[] };
    expect(items.items[0]?.notes).toBe("Actual saved notes");
    await h.command("remove-association", items.items[0]!.association.id);
    expect(
      (
        (await h.command("event-associations", event.id)) as {
          items: unknown[];
        }
      ).items,
    ).toHaveLength(0);
    expect(get).toHaveBeenCalled();
  });
  it("leaves workspace sources out by default and makes no request while preparing", async () => {
    const h = await setup();
    await h.prepare();
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(h.assistant.value.review?.workspaceContext).toBeUndefined();
    expect(h.codex.respond).not.toHaveBeenCalled();
  });
  it("previews only selected facts and evidence, and requires exact acknowledgement", async () => {
    const h = await setup();
    await h.prepare(h.selection);
    const review = h.assistant.value.review!;
    expect(review.workspaceContext?.entries.map((e) => e.kind)).toEqual([
      "person",
      "memory",
    ]);
    expect(review.prompt).toContain("untrusted");
    await expect(
      h.assistant.ask({ reviewId: review.requestId, acknowledged: false }),
    ).rejects.toThrow("Acknowledge");
    expect(h.codex.respond).not.toHaveBeenCalled();
    await h.assistant.ask({ reviewId: review.requestId, acknowledged: true });
    await h.complete();
    expect(h.codex.respond).toHaveBeenCalledTimes(1);
    expect(h.claude.respond).not.toHaveBeenCalled();
    expect(h.assistant.value.responses[0]?.workspaceContext).toEqual(
      review.workspaceContext,
    );
  });
  it("subtracts a source, changes the review ID and never transmits the removed contact", async () => {
    const h = await setup();
    await h.prepare(h.selection);
    const old = h.assistant.value.review!;
    h.assistant.removeContext({
      reviewId: old.requestId,
      kind: "workspace",
      index: 0,
    });
    const review = h.assistant.value.review!;
    expect(review.requestId).not.toBe(old.requestId);
    expect(review.prompt).not.toContain("Test Participant");
    await expect(
      h.assistant.ask({ reviewId: old.requestId, acknowledged: true }),
    ).rejects.toThrow("Review");
    await h.assistant.ask({ reviewId: review.requestId, acknowledged: true });
    await h.complete();
    expect(
      h.codex.respond.mock.calls[0]?.[0].workspaceContext?.entries,
    ).toHaveLength(1);
  });
  it("keeps source guards after subtraction and refuses a deleted memory before POST", async () => {
    const h = await setup();
    await h.prepare(h.selection);
    h.assistant.removeContext({
      reviewId: h.assistant.value.review!.requestId,
      kind: "workspace",
      index: 0,
    });
    await h.command("delete-memory", { id: h.memory.id, acknowledged: true });
    await expect(
      h.assistant.ask({
        reviewId: h.assistant.value.review!.requestId,
        acknowledged: true,
      }),
    ).rejects.toThrow("changed");
    expect(h.codex.respond).not.toHaveBeenCalled();
  });
  it("checks again after asynchronous provider inspection", async () => {
    const h = await setup();
    await h.prepare(h.selection);
    const pending = deferred<Awaited<ReturnType<typeof h.codex.inspect>>>();
    h.codex.inspect.mockReturnValueOnce(pending.promise);
    await h.assistant.ask({
      reviewId: h.assistant.value.review!.requestId,
      acknowledged: true,
    });
    h.controller.invalidate();
    pending.resolve({
      id: "codex",
      auth: "chatgpt",
      ready: true,
      message: "fixture",
      capabilities: { text: true, images: false, tools: false },
      models: ["fixture"],
      selectedModel: "fixture",
    });
    await h.complete();
    expect(h.codex.respond).not.toHaveBeenCalled();
    expect(h.assistant.value.responses.at(-1)?.error?.code).toBe("cancelled");
  });
  it("does not let brief/contact answers enter ordinary follow-up history", async () => {
    const h = await setup();
    await h.prepare({ ...h.selection, purpose: "brief" });
    await h.assistant.ask({
      reviewId: h.assistant.value.review!.requestId,
      acknowledged: true,
    });
    await h.complete();
    await h.assistant.prepare({
      question: "A separate question",
      options: DEFAULT_CONTEXT,
    });
    expect(h.assistant.value.review?.history).toHaveLength(0);
  });
  it("rejects forged context, over-large selections and automatic payload injection", async () => {
    const h = await setup();
    expect(() =>
      h.assistant.prepare({
        question: "x",
        options: DEFAULT_CONTEXT,
        workspaceContext: { entries: [] },
      }),
    ).toThrow("Unexpected");
    expect(() =>
      h.prepare({
        ...empty,
        personIds: Array.from({ length: 6 }, (_, i) => `p${i}`),
      }),
    ).toThrow("at most");
    expect(() =>
      h.assistant.prepare(
        {
          question: "x",
          options: DEFAULT_CONTEXT,
          workspaceSelection: h.selection,
        },
        true,
      ),
    ).toThrow("scoped Live grant");
  });
  it("rejects excluded people and refuses save/export without an event-bound completed brief", async () => {
    const h = await setup();
    await h.command("configure", {
      settings: {
        ...h.controller.value.config,
        excludedPersonIds: [h.person.id],
      },
      acknowledged: true,
    });
    await expect(h.prepare(h.selection)).rejects.toThrow("excluded");
    await expect(
      h.command("save-brief", { requestId: "unknown", acknowledged: true }),
    ).rejects.toThrow("completed brief");
  });
  it("cancels pending retrieval when workspace locks or the preparation is discarded", async () => {
    const h = await setup();
    const wait = deferred<{
      context: WorkspaceAIContext;
      valid: () => boolean;
    }>();
    h.retrieve.mockReturnValueOnce(wait.promise);
    const prepare = h.prepare(h.selection);
    h.assistant.discardReview();
    wait.resolve({
      context: { purpose: "brief", entries: [], notices: [] },
      valid: () => true,
    });
    await expect(prepare).rejects.toThrow("cancelled");
    expect(h.codex.respond).not.toHaveBeenCalled();
  });
});
describe("P10 explicitly staged Live context", () => {
  async function live() {
    const h = await setup();
    await h.command("stage-live-context", { ...h.selection, purpose: "live" });
    const questions: DetectedQuestion[] = [];
    const context: LiveContext = {
      accountId: "test",
      accountLabel: "Fixture",
      model: "fixture",
      captureSessionId: "capture",
      captureEpoch: 1,
      assistantSessionId: h.assistant.value.sessionId,
      sourceId: null,
      sourceName: null,
      images: false,
      transcribing: true,
      available: { microphone: true, systemAudio: false, screenshot: false },
      workspaceSources: h.controller.liveContext,
    };
    const scheduler = new LiveScheduler({
      assistant: h.assistant,
      context: () => ({
        ...context,
        workspaceSources: h.controller.liveContext,
      }),
      settings: () => DEFAULT_INTELLIGENCE,
      questions: () => questions,
      mode: () => "live",
      diagnostics: {
        analysedTranscripts: 0,
        duplicateQuestions: 0,
        unchangedFrames: 0,
        sampledFrames: 0,
        screenChanges: 0,
        detectionMs: 0,
        screenMs: 0,
        suggestionsCreated: 0,
        automaticAttempts: 0,
        automaticCompletions: 0,
        suppressedRequests: 0,
        queueDepth: 0,
        responseLatencyMs: null,
      },
      changed: vi.fn(),
      status: vi.fn(),
      event: vi.fn(),
    });
    cleanups.push(async () => {
      scheduler.revoke("Fixture complete");
    });
    const input = (workspace?: {
      enabled: boolean;
      remote: boolean;
      scopeId: string;
      selection: WorkspaceSelection;
    }) => ({
      acknowledged: true,
      expected: context,
      sharing: {
        microphone: true,
        systemAudio: false,
        screenshot: false,
        history: false,
        ...(workspace ? { workspace } : {}),
      },
      limits: { sessionMinutes: 30, cooldownSeconds: 30, requestLimit: 20 },
    });
    return {
      ...h,
      scheduler,
      questions,
      context,
      input,
      workspace: {
        enabled: true,
        remote: true,
        scopeId: context.workspaceSources!.scopeId,
        selection: context.workspaceSources!.selection,
      },
    };
  }
  it("keeps all P10 context disabled by default even after staging", async () => {
    const h = await live();
    await h.scheduler.authorise(h.input());
    expect(h.scheduler.value?.sharing.workspace).toBeUndefined();
    expect(h.retrieve).not.toHaveBeenCalled();
  });
  it("requires separate remote consent and exact staged IDs / purpose / profile", async () => {
    const h = await live();
    await expect(
      h.scheduler.authorise(h.input({ ...h.workspace, remote: false })),
    ).rejects.toThrow("separate");
    await expect(
      h.scheduler.authorise(
        h.input({
          ...h.workspace,
          selection: { ...h.workspace.selection, personIds: ["foreign"] },
        }),
      ),
    ).rejects.toThrow("staged");
    expect(h.codex.respond).not.toHaveBeenCalled();
  });
  it("uses only the frozen grant, preserves cooldown and revokes on source change", async () => {
    const h = await live();
    await h.scheduler.authorise(h.input(h.workspace));
    h.questions.push({
      id: "q1",
      sessionId: "capture",
      transcriptId: "t1",
      source: "microphone",
      text: "When is the prototype release?",
      at: Date.now(),
      expiresAt: Date.now() + 30000,
      confidence: 0.99,
      relevance: 1,
      automaticEligible: true,
      reason: "fixture",
      screen: null,
      contextIds: [],
    });
    h.scheduler.tick();
    await h.complete();
    for (let i = 0; i < 20 && !h.codex.respond.mock.calls.length; i++)
      await new Promise((r) => setTimeout(r, 2));
    expect(h.retrieve).toHaveBeenCalledExactlyOnceWith(
      "When is the prototype release?",
      h.workspace.selection,
    );
    expect(h.codex.respond).toHaveBeenCalledTimes(1);
    h.scheduler.assistantChanged(h.assistant.value);
    h.questions.push({
      ...h.questions[0]!,
      id: "q2",
      transcriptId: "t2",
      text: "What is the checklist deadline?",
    });
    h.scheduler.tick();
    expect(h.codex.respond).toHaveBeenCalledTimes(1);
    expect(h.scheduler.value?.requests).toBe(1);
    h.controller.invalidate();
    h.scheduler.tick();
    expect(h.scheduler.value).toBeNull();
  });
});
