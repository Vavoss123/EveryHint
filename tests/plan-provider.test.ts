import { describe, expect, it, vi } from "vitest";
import type { AIRequest, ProviderEvent } from "../src/shared/ai";
import { ChatGptProvider, parseModels } from "../src/main/ai/plan/provider";
import { RESOURCE } from "../src/main/ai/plan/oauth";
import { json, registration, tokens } from "./plan-fixtures";
import { deferred, frame } from "./helpers";

const catalog = {
  models: [
    {
      slug: "fixture-text",
      display_name: "Fixture Text",
      visibility: "list",
      input_modalities: ["text"],
    },
    {
      slug: "fixture-image",
      display_name: "Fixture Image",
      visibility: "list",
      input_modalities: ["text", "image"],
    },
    { slug: "fixture-hidden", display_name: "Hidden", visibility: "hide" },
  ],
};
const request = (extra: Partial<AIRequest> = {}): AIRequest => ({
  model: "fixture-text",
  requestId: "fixture-request",
  sessionId: "fixture-session",
  captureSessionId: null,
  provider: "codex",
  question: "synthetic question",
  prompt: "exact frozen synthetic context",
  screenshot: null,
  transcripts: [],
  history: [],
  createdAt: Date.now(),
  ...extra,
});
const completed = (text = "Hello 🦊") => ({
  type: "response.completed",
  response: {
    status: "completed",
    model: "fixture-text",
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 7, output_tokens: 3 },
  },
});
const sse = (events: unknown[], split = false) => {
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""),
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (split)
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};
async function setup(
  events: unknown[] = [
    { type: "response.output_text.delta", delta: "Hello 🦊" },
    completed(),
  ],
  split = false,
) {
  const account = {
    identity: registration().id as string | null,
    registration: registration(),
    token: vi.fn(async (_signal: AbortSignal) => {
      void _signal;
      return "synthetic-access-only";
    }),
  };
  const transport = vi.fn(async (url: string, _init?: RequestInit) => {
    void _init;
    return url.endsWith("/models") ? json(catalog) : sse(events, split);
  });
  const provider = new ChatGptProvider(account, transport);
  await provider.discoverModels();
  provider.selectModel("fixture-text");
  return { account, transport, provider };
}
async function collect(
  provider: ChatGptProvider,
  value = request(),
  signal = new AbortController().signal,
) {
  const items: ProviderEvent[] = [];
  for await (const event of provider.respond(value, signal)) items.push(event);
  return items;
}
describe("answer-only ChatGPT Responses transport", () => {
  it("rechecks Live sharing permission after token renewal before any inference POST", async () => {
    const s = await setup();
    const pending = deferred<string>();
    s.account.token.mockReturnValueOnce(pending.promise);
    let allowed = true;
    const result = (async () => {
      for await (const event of s.provider.respond(
        request(),
        new AbortController().signal,
        () => allowed,
      ))
        void event;
    })();
    await Promise.resolve();
    allowed = false;
    pending.resolve("synthetic-refreshed-token");
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
    expect(
      s.transport.mock.calls.every(([url]) => url.endsWith("/models")),
    ).toBe(true);
  });
  it("does not contact OpenAI during construction or local inspection and never selects an API-key fallback", async () => {
    const account = { identity: null, registration: undefined, token: vi.fn() },
      transport = vi.fn();
    const provider = new ChatGptProvider(account, transport);
    expect((await provider.inspect()).ready).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(account.token).not.toHaveBeenCalled();
  });
  it("preserves the official visible model ordering and only accepts explicit image metadata", () => {
    expect(parseModels(catalog).map((item) => item.id)).toEqual([
      "fixture-text",
      "fixture-image",
    ]);
    expect(parseModels(catalog)[1]!.images).toBe(true);
    expect(
      parseModels({
        models: [
          { slug: "unknown", display_name: "Unknown", visibility: "list" },
        ],
      })[0]!.images,
    ).toBe(false);
    expect(() => parseModels({ data: [{ id: "api-model" }] })).toThrow(
      "catalog",
    );
  });
  it("requires explicit model selection and considers catalog visibility unverified", async () => {
    const s = await setup();
    await s.provider.discoverModels();
    expect((await s.provider.inspect()).ready).toBe(false);
    s.provider.selectModel("fixture-text");
    expect((await s.provider.inspect()).message).toContain("unverified");
    expect(() => s.provider.selectModel("not-listed")).toThrow();
    expect(
      s.transport.mock.calls.every(([url]) => url === `${RESOURCE}/models`),
    ).toBe(true);
  });
  it("posts only the reviewed context, disables storage/tools and decodes split UTF-8 streaming until completed", async () => {
    const s = await setup(undefined, true),
      result = await collect(s.provider);
    expect(result.map((event) => event.type)).toEqual(["text", "complete"]);
    expect(result[1]).toMatchObject({
      text: "Hello 🦊",
      model: "fixture-text",
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    const [url, init] = s.transport.mock.calls.at(-1)!;
    expect(url).toBe(`${RESOURCE}/responses`);
    expect(init!.headers).toMatchObject({
      authorization: "Bearer synthetic-access-only",
    });
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      model: "fixture-text",
      store: false,
      stream: true,
      tools: [],
      tool_choice: "none",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: request().prompt }],
        },
      ],
    });
    for (const field of [
      "max_output_tokens",
      "temperature",
      "metadata",
      "conversation",
      "previous_response_id",
      "background",
      "api_key",
    ])
      expect(body).not.toHaveProperty(field);
    expect((await s.provider.inspect()).message).toContain(
      "response completed",
    );
  });
  it("rejects a screenshot for unconfirmed image support before making a remote request", async () => {
    const s = await setup();
    await expect(
      collect(s.provider, request({ screenshot: frame })),
    ).rejects.toThrow("image-input");
    expect(s.transport).toHaveBeenCalledTimes(1);
  });
  it("includes the exact selected screenshot once when metadata explicitly supports images", async () => {
    const s = await setup();
    s.provider.selectModel("fixture-image");
    await collect(
      s.provider,
      request({ model: "fixture-image", screenshot: frame }),
    );
    const body = JSON.parse(s.transport.mock.calls.at(-1)![1]!.body as string);
    expect(body.input[0].content).toHaveLength(2);
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: frame.dataUrl,
    });
    expect(JSON.stringify(body)).not.toContain("audio");
  });
  it.each([401, 403, 404, 429, 503])(
    "handles HTTP %i once without retry, alternate endpoint or billable fallback",
    async (status) => {
      const s = await setup();
      s.transport.mockImplementation(async () =>
        json(
          { error: { code: "fixture_code", message: "private fixture error" } },
          status,
        ),
      );
      const expected =
        status === 401
          ? "auth"
          : status === 429
            ? "rate-limit"
            : status === 503
              ? "network"
              : "permissions";
      await expect(collect(s.provider)).rejects.toMatchObject({
        code: expected,
        status,
      });
      expect(s.transport).toHaveBeenCalledTimes(2);
      expect(s.transport.mock.calls.at(-1)![0]).toBe(`${RESOURCE}/responses`);
    },
  );
  it("retains streamed text before a plan limit failure and never calls completion", async () => {
    const s = await setup([
      { type: "response.output_text.delta", delta: "partial" },
      {
        type: "response.failed",
        response: {
          error: { code: "subscription_sharing_usage_limit_exceeded" },
        },
      },
    ]);
    const partial: ProviderEvent[] = [];
    await expect(
      (async () => {
        for await (const event of s.provider.respond(
          request(),
          new AbortController().signal,
        ))
          partial.push(event);
      })(),
    ).rejects.toMatchObject({ code: "rate-limit" });
    expect(partial).toEqual([{ type: "text", text: "partial" }]);
  });
  it.each([
    [{ type: "response.incomplete", response: {} }],
    [{ type: "response.output_text.delta", delta: "unfinished" }],
    [{ type: "error", code: "subscription_sharing_unsupported_capability" }],
    [
      {
        type: "response.output_item.added",
        item: { type: "function_call", name: "shell", arguments: "invalid" },
      },
    ],
    [{ type: "response.function_call_arguments.delta", delta: "invalid" }],
  ])("fails closed for incomplete/error/tool streams %j", async (eventList) => {
    const s = await setup([eventList]);
    await expect(collect(s.provider)).rejects.toThrow();
    expect(s.transport).toHaveBeenCalledTimes(2);
  });
  it("cancels the actual stream reader and rejects late output", async () => {
    const s = await setup(),
      cancel = vi.fn(),
      abort = new AbortController();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    s.transport.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              stream = controller;
            },
            cancel,
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const result = collect(s.provider, request(), abort.signal);
    await vi.waitFor(() => expect(s.transport).toHaveBeenCalledTimes(2));
    stream.enqueue(
      new TextEncoder().encode(
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
      ),
    );
    abort.abort();
    await expect(result).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("invalidates model selection on account changes and cannot reuse stale reviews", async () => {
    const s = await setup();
    s.account.identity = "different-account";
    await expect(collect(s.provider)).rejects.toThrow("catalog expired");
    expect((await s.provider.inspect()).ready).toBe(false);
    expect(s.transport).toHaveBeenCalledTimes(1);
    s.account.registration.tokens = tokens({ scopes: ["openid"] });
    expect((await s.provider.inspect()).message).toContain(
      "permission is missing",
    );
  });
  it("expires a catalog without refreshing or sending inference automatically", async () => {
    let now = 1000000;
    const s = await setup(),
      provider = new ChatGptProvider(s.account, s.transport, () => now);
    await provider.discoverModels();
    provider.selectModel("fixture-text");
    now += 300001;
    expect((await provider.inspect()).ready).toBe(false);
    await expect(collect(provider)).rejects.toThrow("catalog expired");
    expect(
      s.transport.mock.calls.every(([url]) => url.endsWith("/models")),
    ).toBe(true);
  });
  it("validates real SSE frames even when MIME metadata is missing or incorrect", async () => {
    for (const mime of ["", "application/json"]) {
      const s = await setup();
      s.transport.mockImplementation(async () => {
        const response = sse([
          { type: "response.output_text.delta", delta: "Hello 🦊" },
          completed(),
        ]);
        if (mime) response.headers.set("content-type", mime);
        else response.headers.delete("content-type");
        return response;
      });
      expect((await collect(s.provider)).at(-1)).toMatchObject({
        type: "complete",
        text: "Hello 🦊",
      });
    }
  });
  it("rejects non-stream JSON completion instead of fabricating response.completed", async () => {
    const s = await setup();
    s.transport.mockImplementation(async () => json(completed().response));
    await expect(collect(s.provider)).rejects.toThrow(
      "HTTP 200, application/json",
    );
    expect((await s.provider.inspect()).message).toContain("unverified");
  });
  it("reports a structured JSON error with no raw body even when delivered as HTTP 200", async () => {
    const s = await setup();
    s.transport.mockImplementation(async () =>
      json({
        error: {
          code: "subscription_sharing_user_not_eligible",
          message: "private fixture secret",
        },
      }),
    );
    await expect(collect(s.provider)).rejects.toMatchObject({
      code: "permissions",
    });
  });
  it("does not install a late model catalog after account invalidation", async () => {
    const s = await setup(),
      pending = deferred<Response>();
    s.transport.mockImplementation(() => pending.promise);
    const result = s.provider.discoverModels();
    await vi.waitFor(() => expect(s.transport).toHaveBeenCalledTimes(2));
    s.provider.invalidate();
    pending.resolve(json(catalog));
    await expect(result).rejects.toThrow();
    expect((await s.provider.inspect()).modelDetails).toEqual([]);
  });
  it("rejects completed streams containing a tool item and never labels them verified", async () => {
    const terminal = completed();
    terminal.response.output = [{ type: "function_call", content: [] }];
    const s = await setup([terminal]);
    await expect(collect(s.provider)).rejects.toThrow("tool attempt");
    expect((await s.provider.inspect()).message).toContain("unverified");
  });
});

describe("deliberate Listen model readiness", () => {
  it("does not access a catalog until explicitly requested, then selects verified image metadata", async () => {
    const account = {
        identity: "a",
        registration: registration(),
        token: vi.fn(async () => "synthetic"),
      },
      transport = vi.fn(async (_url: string) => {
        void _url;
        return json(catalog);
      });
    const provider = new ChatGptProvider(account, transport);
    await provider.inspect();
    expect(transport).not.toHaveBeenCalled();
    await provider.readyForRequest();
    expect((await provider.inspect()).selectedModel).toBe("fixture-image");
    await provider.readyForRequest();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("refreshes stale metadata on a deliberate action while preserving the chosen model", async () => {
    let now = Date.now();
    const account = {
        identity: "a",
        registration: registration(),
        token: vi.fn(async () => "synthetic"),
      },
      transport = vi.fn(async (_url: string) => {
        void _url;
        return json(catalog);
      });
    const provider = new ChatGptProvider(account, transport, () => now);
    await provider.readyForRequest();
    provider.selectModel("fixture-text");
    now += 300001;
    expect((await provider.inspect()).ready).toBe(false);
    await provider.readyForRequest();
    expect((await provider.inspect()).selectedModel).toBe("fixture-text");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("fails when the previous model disappears without choosing a fallback or making inference", async () => {
    let now = Date.now();
    const account = {
        identity: "a",
        registration: registration(),
        token: vi.fn(async () => "synthetic"),
      },
      transport = vi.fn(async (_url: string) => {
        void _url;
        return json(catalog);
      });
    const provider = new ChatGptProvider(account, transport, () => now);
    await provider.readyForRequest();
    now += 300001;
    transport.mockImplementationOnce(async () =>
      json({ models: catalog.models.slice(0, 1) }),
    );
    await expect(provider.readyForRequest()).rejects.toThrow(/unavailable/);
    expect((await provider.inspect()).ready).toBe(false);
    expect(transport.mock.calls.every(([url]) => url.endsWith("/models"))).toBe(
      true,
    );
  });
});
