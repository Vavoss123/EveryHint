// Real @anthropic-ai/sdk against a synthetic loopback server. No paid request.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ClaudeProvider,
  DEFAULT_CLAUDE_MODEL,
  parseClaudeKey,
} from "../src/main/ai/claude";
import { RESPONSE_INSTRUCTIONS } from "../src/main/ai/context";
import type { CredentialVault } from "../src/main/ai/plan/vault";
import type { AIRequest, ProviderEvent } from "../src/shared/ai";
import { frame } from "./helpers";

const KEY = "sk-ant-synthetic-test-key-0000000000";
const requests: { body: Record<string, unknown>; headers: Headers }[] = [];
let reply: (send: (event: object) => void) => void;
let status = 200;
let server: Server, endpoint: string;
function sse(model: string, deltas: string[], stop = "end_turn") {
  return (send: (event: object) => void) => {
    send({
      type: "message_start",
      message: {
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 1 },
      },
    });
    send({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    });
    for (const text of deltas)
      send({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      });
    send({ type: "content_block_stop", index: 0 });
    send({
      type: "message_delta",
      delta: { stop_reason: stop, stop_sequence: null },
      usage: { output_tokens: 500 },
    });
    send({ type: "message_stop" });
  };
}
beforeAll(async () => {
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      body: JSON.parse(body || "{}"),
      headers: new Headers(request.headers as Record<string, string>),
    });
    if (status !== 200) {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          type: "error",
          error: { type: "error", message: "sensitive-error-body" },
        }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    reply((event) =>
      response.write(
        `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
      ),
    );
    response.end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
beforeEach(() => {
  requests.length = 0;
  status = 200;
  reply = sse(DEFAULT_CLAUDE_MODEL, ["Hello", " world"]);
});
function memoryVault(initial: string | null = null): CredentialVault {
  let value = initial;
  return {
    read: async () => value,
    write: async (next) => {
      value = next;
    },
    clear: async () => {
      value = null;
    },
  };
}
function provider(vault = memoryVault(KEY), env: NodeJS.ProcessEnv = {}) {
  return new ClaudeProvider(
    vault,
    () => env,
    (apiKey) => new Anthropic({ apiKey, baseURL: endpoint, maxRetries: 0 }),
  );
}
const request = (patch: Partial<AIRequest> = {}): AIRequest => ({
  requestId: "request",
  sessionId: "conversation",
  captureSessionId: null,
  provider: "claude",
  question: "Hello",
  transcripts: [],
  screenshot: null,
  history: [],
  createdAt: 1,
  prompt: "Reviewed prompt",
  ...patch,
});
async function collect(p: ClaudeProvider, value = request()) {
  const events: ProviderEvent[] = [];
  for await (const event of p.respond(value, new AbortController().signal))
    events.push(event);
  return events;
}
describe("Claude Messages API provider", () => {
  it("validates pasted API keys", () => {
    expect(parseClaudeKey(`  ${KEY}\n`)).toBe(KEY);
    expect(() => parseClaudeKey("sk-proj-openai")).toThrow("sk-ant-");
    expect(() => parseClaudeKey("")).toThrow();
  });
  it("needs a key and the billing opt-in before any request", async () => {
    const missing = provider(memoryVault(null));
    expect((await missing.inspect(true)).auth).toBe("missing");
    await expect(collect(missing)).rejects.toThrow("API key");
    const off = provider();
    expect((await off.inspect(false)).ready).toBe(false);
    await expect(collect(off)).rejects.toThrow("billing");
    expect(requests).toHaveLength(0);
  });
  it("never treats subscription or cloud credentials as an API key", async () => {
    const p = provider(memoryVault(null), {
      CLAUDE_CODE_OAUTH_TOKEN: "subscription",
      AWS_BEARER_TOKEN_BEDROCK: "cloud",
    });
    expect((await p.inspect(true)).auth).toBe("missing");
  });
  it("falls back to ANTHROPIC_API_KEY when no key is saved", async () => {
    const p = provider(memoryVault(null), { ANTHROPIC_API_KEY: KEY });
    expect(await p.hasSavedKey()).toBe(false);
    expect((await p.inspect(true)).ready).toBe(true);
  });
  it("saves, reports and clears the key", async () => {
    const vault = memoryVault(null),
      p = provider(vault);
    await p.saveKey(KEY);
    expect(await vault.read()).toBe(KEY);
    expect(await p.hasSavedKey()).toBe(true);
    await p.clearKey();
    expect(await vault.read()).toBeNull();
    expect((await p.inspect(true)).auth).toBe("missing");
  });
  it("lists selectable models and rejects unknown ones", async () => {
    const p = provider();
    const status = await p.inspect(true);
    expect(status.selectedModel).toBe("claude-opus-5-5");
    expect(status.models).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
    p.selectModel("claude-sonnet-5-5");
    expect((await p.inspect(true)).selectedModel).toBe("claude-sonnet-5-5");
    expect(() => p.selectModel("gpt-6")).toThrow();
  });
  it("streams text with the image, system rules, no tools and usage", async () => {
    const p = provider();
    await p.inspect(true);
    const events = await collect(p, request({ screenshot: frame }));
    expect(events).toEqual([
      { type: "text", text: "Hello" },
      { type: "text", text: "Hello world" },
      {
        type: "complete",
        text: "Hello world",
        model: "claude-opus-5-5",
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          estimatedUsd: (1000 * 4 + 500 * 20) / 1_000_000,
        },
      },
    ]);
    const { body, headers } = requests[0]!;
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      system: RESPONSE_INSTRUCTIONS,
      fallbacks: "default",
      output_config: { effort: "medium" },
    });
    expect(body.tools).toBeUndefined();
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: frame.dataUrl.slice(23),
            },
          },
          { type: "text", text: "Reviewed prompt" },
        ],
      },
    ]);
  });
  it("sends no fallback beta for Haiku", async () => {
    const p = provider();
    p.selectModel("claude-haiku-5-5");
    await p.inspect(true);
    reply = sse("claude-haiku-5-5", ["Hi"]);
    await collect(p);
    expect(requests[0]!.body.fallbacks).toBeUndefined();
  });
  it("maps a rejected key without exposing the error body", async () => {
    const p = provider();
    await p.inspect(true);
    status = 401;
    const error = await collect(p).catch((e: Error) => e);
    expect(error).toMatchObject({ code: "auth" });
    expect(String((error as Error).message)).not.toContain("sensitive");
  });
  it("maps rate limits", async () => {
    const p = provider();
    await p.inspect(true);
    status = 429;
    await expect(collect(p)).rejects.toMatchObject({ code: "rate-limit" });
  });
  it("reports a refusal instead of a silent empty answer", async () => {
    const p = provider();
    await p.inspect(true);
    reply = sse(DEFAULT_CLAUDE_MODEL, [], "refusal");
    await expect(collect(p)).rejects.toThrow("declined");
  });
  it("stops on cancellation", async () => {
    const p = provider();
    await p.inspect(true);
    const abort = new AbortController();
    const iterator = p.respond(request(), abort.signal)[Symbol.asyncIterator]();
    await iterator.next();
    abort.abort();
    await expect(iterator.next()).rejects.toMatchObject({ code: "cancelled" });
  });
});
