import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantController } from "../src/main/ai/controller";
import { ChatGptProvider } from "../src/main/ai/plan/provider";
import { IntelligenceController } from "../src/main/intelligence/controller";
import { CaptureSessionController } from "../src/main/session";
import { DEFAULT_INTELLIGENCE } from "../src/shared/intelligence";
import type { AIProvider } from "../src/shared/ai";
import type { SessionSnapshot } from "../src/shared/contracts";
import type { TranscriptEvent } from "../src/shared/transcription";
import { backend, deferred } from "./helpers";
import { json, registration } from "./plan-fixtures";

describe("P7 actual builder/scheduler/ChatGPT transport with synthetic HTTP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
  });
  afterEach(() => vi.useRealTimers());
  it.each([false, true])(
    "sends only permitted final text; blocks a scope expiry during token renewal=%s",
    async (expire) => {
      const account = {
        identity: "account-a",
        registration: registration(),
        token: vi.fn(async (_signal: AbortSignal) => {
          void _signal;
          return "synthetic-secret";
        }),
      };
      const posts: Record<string, unknown>[] = [];
      const transport = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/models"))
          return json({
            models: [
              {
                slug: "fixture-auto",
                display_name: "Fixture Auto",
                visibility: "list",
                input_modalities: ["text"],
              },
            ],
          });
        posts.push(JSON.parse(init!.body as string));
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", model: "fixture-auto", output: [{ type: "message", content: [{ type: "output_text", text: "Synthetic permitted answer" }] }] } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      });
      const chatgpt = new ChatGptProvider(account, transport);
      await chatgpt.discoverModels();
      chatgpt.selectModel("fixture-auto");
      const claude: AIProvider = {
        id: "claude",
        inspect: async () => ({
          id: "claude",
          auth: "missing",
          ready: false,
          message: "disabled",
          capabilities: { text: false, images: false, tools: false },
          models: [],
        }),
        respond: vi.fn(),
        dispose: () => {},
      };
      const capture: SessionSnapshot = {
        ...new CaptureSessionController(
          backend(),
          () => 3000,
          () => {},
        ).value,
        sessionId: "capture",
        epoch: 1,
        state: "ACTIVE",
        consent: {
          screen: false,
          microphone: true,
          systemAudio: true,
          acknowledged: true,
        },
      };
      capture.sources.microphone.state = "CAPTURING";
      capture.sources.systemAudio.state = "CAPTURING";
      const events: TranscriptEvent[] = [];
      const listener: { current?: IntelligenceController } = {};
      const assistant = new AssistantController(
        [chatgpt, claude],
        () => ({ capture, events }),
        (value) => listener.current?.assistantChanged(value),
      );
      assistant.captureChanged(capture);
      await assistant.inspect();
      let monotonic = 100;
      const intelligence = new IntelligenceController(
        assistant,
        () => {},
        Date.now,
        undefined,
        () => ({ accountId: account.identity, transcribing: true }),
        () => monotonic,
      );
      listener.current = intelligence;
      try {
        intelligence.configure({
          ...DEFAULT_INTELLIGENCE,
          requestLimit: 1,
          sessionMinutes: 1,
          sources: { microphone: true, systemAudio: true, screen: false },
        });
        intelligence.mode("live");
        intelligence.update(capture, events);
        await intelligence.authorise({
          acknowledged: true,
          expected: intelligence.value.liveContext,
          sharing: {
            microphone: true,
            systemAudio: false,
            screenshot: false,
            history: false,
          },
          limits: { sessionMinutes: 1, cooldownSeconds: 30, requestLimit: 1 },
        });
        const pending = deferred<string>();
        if (expire) account.token.mockReturnValueOnce(pending.promise);
        const end = Date.now();
        events.push(
          {
            id: "private",
            sessionId: "capture",
            source: "systemAudio",
            startMs: end - 2000,
            endMs: end,
            text: "Unshared private system words",
            state: "final",
            model: "tiny.en",
          },
          {
            id: "question",
            sessionId: "capture",
            source: "microphone",
            startMs: end - 1000,
            endMs: end,
            text: "Why would you use a dictionary instead of a list",
            state: "final",
            model: "tiny.en",
          },
        );
        intelligence.update(capture, events);
        await vi.advanceTimersByTimeAsync(0);
        if (expire) {
          expect(posts).toHaveLength(0);
          monotonic += 60001;
          pending.resolve("synthetic-refreshed-secret");
          await vi.advanceTimersByTimeAsync(0);
          expect(posts).toHaveLength(0);
          expect(intelligence.value.live).toBeNull();
        } else {
          expect(posts).toHaveLength(1);
          expect(posts[0]).toMatchObject({
            model: "fixture-auto",
            store: false,
            stream: true,
            tools: [],
            tool_choice: "none",
          });
          const body = JSON.stringify(posts[0]);
          expect(body).toContain("dictionary");
          for (const forbidden of [
            "Unshared private",
            "synthetic-secret",
            "account-a",
            "input_image",
            "automaticAttempts",
            'automatic":true',
            "previous_response_id",
            'conversation":',
          ])
            expect(body).not.toContain(forbidden);
          expect(assistant.value.responses[0]).toMatchObject({
            status: "completed",
            automatic: true,
          });
          expect(intelligence.value.live).toBeNull();
        }
        expect(claude.respond).not.toHaveBeenCalled();
      } finally {
        intelligence.dispose();
        await assistant.dispose();
      }
    },
  );
});
