import { describe, expect, it, vi } from "vitest";
import { AssistantController } from "../src/main/ai/controller";
import { ChatGptProvider } from "../src/main/ai/plan/provider";
import { CaptureSessionController } from "../src/main/session";
import { DEFAULT_CONTEXT, type AIProvider } from "../src/shared/ai";
import { backend, consent, frame, source } from "./helpers";
import { json, registration } from "./plan-fixtures";

describe("P6 reviewed context through the actual ChatGPT transport with synthetic HTTP", () => {
  it("sends a fresh image once, follows up with bounded text history, and clears it on account/provider changes", async () => {
    const account = {
      identity: "account-a" as string | null,
      registration: registration(),
      token: vi.fn(async () => "synthetic-credential-only"),
    };
    const bodies: Record<string, unknown>[] = [];
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models"))
        return json({
          models: [
            {
              slug: "fixture-image",
              display_name: "Fixture Image",
              visibility: "list",
              input_modalities: ["text", "image"],
            },
          ],
        });
      bodies.push(JSON.parse(init!.body as string) as Record<string, unknown>);
      const text =
        bodies.length === 1
          ? "The function counts colours in a dictionary."
          : "The dictionary associates each colour with its count.";
      const events = [
        { type: "response.output_text.delta", delta: text },
        {
          type: "response.completed",
          response: {
            status: "completed",
            model: "fixture-image",
            output: [
              { type: "message", content: [{ type: "output_text", text }] },
            ],
          },
        },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const chatgpt = new ChatGptProvider(account, transport);
    const claude: AIProvider = {
      id: "claude",
      inspect: async () => ({
        id: "claude",
        auth: "missing",
        ready: false,
        message: "disabled fixture",
        capabilities: { text: true, images: false, tools: false },
        models: [],
      }),
      respond: vi.fn(),
      dispose: () => {},
    };
    const capture = {
      ...new CaptureSessionController(
        backend(),
        () => 3000,
        () => {},
      ).value,
      state: "ACTIVE" as const,
      source,
      consent,
      sessionId: "capture",
      frame: { ...frame, capturedAt: Date.now() },
    };
    const fresh = vi.fn(async () => ({
      ...capture,
      frame: { ...frame, capturedAt: Date.now() },
    }));
    const assistant = new AssistantController(
      [chatgpt, claude],
      () => ({ capture, events: [] }),
      () => {},
      90000,
      Date.now,
      fresh,
    );
    try {
      await chatgpt.discoverModels();
      chatgpt.selectModel("fixture-image");
      await assistant.inspect();
      expect(bodies).toHaveLength(0);
      await assistant.prepare({
        question: "Explain visible code.",
        preset: "code",
        options: { ...DEFAULT_CONTEXT, screenshot: true },
      });
      const first = assistant.value.review!;
      expect(first.sourceName).toBe(source.name);
      expect(fresh).toHaveBeenCalledOnce();
      expect(bodies).toHaveLength(0);
      await expect(
        assistant.ask({ reviewId: first.requestId, acknowledged: false }),
      ).rejects.toThrow("Acknowledge");
      await assistant.ask({ reviewId: first.requestId, acknowledged: true });
      await vi.waitFor(() =>
        expect(assistant.value.responses.at(-1)!.status).toBe("completed"),
      );
      expect(bodies[0]).toMatchObject({
        model: "fixture-image",
        store: false,
        stream: true,
        tools: [],
        tool_choice: "none",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: first.prompt },
              { type: "input_image", image_url: frame.dataUrl },
            ],
          },
        ],
      });
      expect(JSON.stringify(bodies)).not.toContain("synthetic-credential-only");
      // Async fresh capture deduplication must fail before any transmission.
      await expect(
        assistant.prepare({
          question: "Same image?",
          options: { ...DEFAULT_CONTEXT, screenshot: true },
        }),
      ).rejects.toThrow("already submitted");
      await assistant.prepare({
        question: "Why did it use a dictionary?",
        preset: "code",
        options: DEFAULT_CONTEXT,
      });
      const followup = assistant.value.review!;
      expect(followup.history).toHaveLength(1);
      expect(followup.prompt).toContain("counts colours");
      await assistant.ask({ reviewId: followup.requestId, acknowledged: true });
      await vi.waitFor(() =>
        expect(assistant.value.responses.at(-1)!.status).toBe("completed"),
      );
      const serialized = JSON.stringify(bodies[1]);
      expect(serialized).toContain("Why did it use a dictionary?");
      expect(serialized).not.toContain("input_image");
      for (const key of [
        "conversation",
        "previous_response_id",
        "max_output_tokens",
        "temperature",
        "metadata",
      ])
        expect(bodies[1]).not.toHaveProperty(key);
      assistant.select("claude");
      assistant.prepare({ question: "Isolated", options: DEFAULT_CONTEXT });
      expect(assistant.value.review!.history).toEqual([]);
      assistant.select("codex");
      account.identity = "account-b";
      chatgpt.invalidate();
      assistant.clear();
      await assistant.inspect();
      assistant.prepare({ question: "New account", options: DEFAULT_CONTEXT });
      expect(assistant.value.review!.history).toEqual([]);
      expect(assistant.value.responses).toEqual([]);
      expect(bodies).toHaveLength(2);
      expect(claude.respond).not.toHaveBeenCalled();
    } finally {
      await assistant.dispose();
    }
  });
});
