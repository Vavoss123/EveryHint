// Actual installed SDK/CLI, synthetic loopback HTTP fixture. No paid or live provider request.
import { createServer } from "node:http";
import { mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  query,
  type SDKMessage,
  type SpawnedProcess,
} from "@anthropic-ai/claude-agent-sdk";
import { claudeOptions, ClaudeProvider } from "../src/main/ai/claude";
import type { AIRequest } from "../src/shared/ai";

const requests: Record<string, unknown>[] = [];
let endpoint = "",
  root = "",
  tool = "";
let holdStream = false;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body || "{}");
  if (request.url?.includes("count_tokens")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ input_tokens: 12 }));
    return;
  }
  if (!request.url?.startsWith("/v1/messages")) {
    response.writeHead(404);
    response.end("{}");
    return;
  }
  requests.push(input);
  const callTool = tool && requests.length === 1;
  const content = callTool
    ? [
        {
          type: "tool_use" as const,
          id: "tool_fixture",
          name: tool,
          input:
            tool === "Bash"
              ? { command: "echo prohibited > everyhint-tool-sentinel.txt" }
              : tool === "Write"
                ? {
                    file_path: join(root, "everyhint-tool-sentinel.txt"),
                    content: "prohibited",
                  }
                : { file_path: join(root, "never-read.txt") },
        },
      ]
    : [{ type: "text" as const, text: "Local protocol fixture answer." }];
  const message = {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    model: input.model,
    content,
    stop_reason: callTool ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 12,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  if (!input.stream) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(message));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const send = (value: Record<string, unknown>) =>
    response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
  send({
    type: "message_start",
    message: { ...message, content: [], stop_reason: null },
  });
  for (let index = 0; index < content.length; index++) {
    const block = content[index]!;
    send({
      type: "content_block_start",
      index,
      content_block:
        block.type === "text"
          ? { type: "text", text: "" }
          : { ...block, input: {} },
    });
    send({
      type: "content_block_delta",
      index,
      delta:
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : {
              type: "input_json_delta",
              partial_json: JSON.stringify(block.input),
            },
    });
    send({ type: "content_block_stop", index });
  }
  if (holdStream) return;
  send({
    type: "message_delta",
    delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: 5 },
  });
  send({ type: "message_stop" });
  response.end();
});
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "everyhint-sdk-fixture-"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable.");
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  if (resolve(root).startsWith(resolve(tmpdir()) + sep))
    await rm(root, { recursive: true, force: true });
});
function localOptions() {
  const options = claudeOptions(
    root,
    "synthetic-loopback-key",
    new AbortController(),
  );
  options.env = {
    ...options.env,
    ANTHROPIC_BASE_URL: endpoint,
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
    ANTHROPIC_LOG: "off",
  };
  options.model = "claude-sonnet-4-6";
  return options;
}
describe("real Claude SDK using loopback fixtures only", () => {
  it("submits no tool schemas and streams a synthetic response through the production adapter", async () => {
    tool = "";
    requests.length = 0;
    const provider = new ClaudeProvider(
      (input) =>
        query({
          ...input,
          options: {
            ...input.options,
            model: "claude-sonnet-4-6",
            env: {
              ...input.options?.env,
              ANTHROPIC_BASE_URL: endpoint,
              CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
            },
          },
        }),
      () => ({ ANTHROPIC_API_KEY: "synthetic-loopback-key" }),
    );
    await provider.inspect(true);
    const request: AIRequest = {
      requestId: "fixture",
      sessionId: "fixture",
      captureSessionId: null,
      provider: "claude",
      question: "Test",
      prompt: "Return a short text answer. No tools.",
      transcripts: [],
      screenshot: null,
      history: [],
      createdAt: Date.now(),
    };
    const events = [];
    for await (const event of provider.respond(
      request,
      AbortSignal.timeout(30000),
    ))
      events.push(event);
    expect(events.some((event) => event.type === "text")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      text: "Local protocol fixture answer.",
    });
    expect(requests.length).toBeGreaterThan(0);
    for (const input of requests) expect(input.tools ?? []).toEqual([]);
  });
  it("aborts a real SDK process mid-stream and removes its temporary workspace", async () => {
    tool = "";
    holdStream = true;
    requests.length = 0;
    let child: SpawnedProcess | undefined;
    let cwd = "";
    const provider = new ClaudeProvider(
      (input) => {
        const originalSpawn = input.options!.spawnClaudeCodeProcess!;
        cwd = input.options!.cwd!;
        return query({
          ...input,
          options: {
            ...input.options,
            model: "claude-sonnet-4-6",
            env: {
              ...input.options?.env,
              ANTHROPIC_BASE_URL: endpoint,
              CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
            },
            spawnClaudeCodeProcess: (spec) => {
              child = originalSpawn(spec);
              return child;
            },
          },
        });
      },
      () => ({ ANTHROPIC_API_KEY: "synthetic-loopback-key" }),
    );
    await provider.inspect(true);
    const abort = new AbortController();
    const request: AIRequest = {
      requestId: "cancel",
      sessionId: "fixture",
      captureSessionId: null,
      provider: "claude",
      question: "Test",
      prompt: "Return text only.",
      transcripts: [],
      screenshot: null,
      history: [],
      createdAt: Date.now(),
    };
    const consume = async () => {
      for await (const event of provider.respond(request, abort.signal))
        if (event.type === "text") abort.abort();
    };
    try {
      await expect(consume()).rejects.toThrow();
      expect(abort.signal.aborted).toBe(true);
      expect(child).toBeDefined();
      expect(child!.killed || child!.exitCode !== null).toBe(true);
      await expect(access(cwd)).rejects.toThrow();
    } finally {
      holdStream = false;
      await provider.dispose();
    }
  });
  it.each(["Bash", "Write", "Read", "mcp__files__read"])(
    "blocks server-generated %s calls in the actual SDK without executing them",
    async (name) => {
      tool = name;
      requests.length = 0;
      const options = localOptions();
      options.maxTurns = 2;
      const stream = query({ prompt: "Do not execute anything.", options });
      const events: SDKMessage[] = [];
      try {
        for await (const event of stream) events.push(event);
      } catch (error) {
        expect(String(error)).toMatch(/maximum number of turns/);
      } finally {
        stream.close();
      }
      const init = events.find(
        (event) => event.type === "system" && event.subtype === "init",
      );
      expect(init).toMatchObject({
        tools: [],
        skills: [],
        plugins: [],
        mcp_servers: [],
        permissionMode: "dontAsk",
        apiKeySource: "ANTHROPIC_API_KEY",
      });
      const inputs = JSON.stringify(requests.map((input) => input.messages));
      expect(inputs, inputs.slice(-2000)).toMatch(
        /not available|not found|not allowed|denied|unknown tool|permission|no such tool/i,
      );
      await expect(
        access(join(root, "everyhint-tool-sentinel.txt")),
      ).rejects.toThrow();
      expect(requests.length).toBeGreaterThan(0);
      for (const input of requests) expect(input.tools ?? []).toEqual([]);
    },
  );
});
