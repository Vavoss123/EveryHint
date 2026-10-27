import { access } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type { AIRequest, ProviderEvent } from "../src/shared/ai";
import { CodexProvider } from "../src/main/ai/codex";
import { ClaudeProvider, claudeOptions } from "../src/main/ai/claude";
import { baseEnvironment } from "../src/main/ai/environment";
import { frame } from "./helpers";

const request = (): AIRequest => ({
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
});
function fixture(events: object[]) {
  const close = vi.fn();
  let options: Options | undefined;
  let message: SDKUserMessage | undefined;
  const run = vi.fn((input: Parameters<typeof query>[0]) => {
    options = input.options;
    const iterator = (async function* () {
      if (typeof input.prompt !== "string")
        for await (const value of input.prompt) message = value;
      for (const event of events) yield event as SDKMessage;
    })();
    return Object.assign(iterator, { close }) as unknown as Query;
  });
  const provider = new ClaudeProvider(run as typeof query, () => ({
    ANTHROPIC_API_KEY: "synthetic-test-key",
    CLAUDE_CODE_OAUTH_TOKEN: "must-not-use",
  }));
  return {
    provider,
    run,
    close,
    options: () => options!,
    message: () => message!,
  };
}
const init = {
  type: "system",
  subtype: "init",
  tools: [],
  skills: [],
  plugins: [],
  mcp_servers: [],
  permissionMode: "dontAsk",
  apiKeySource: "ANTHROPIC_API_KEY",
  model: "fixture-model",
};
const completed = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Hello world",
  usage: { input_tokens: 7, output_tokens: 3 },
  total_cost_usd: 0.0001,
};
async function collect(
  provider: ClaudeProvider,
  value = request(),
  signal = new AbortController().signal,
) {
  const events = [];
  for await (const event of provider.respond(value, signal)) events.push(event);
  return events;
}
describe("provider authentication and fail-closed permissions", () => {
  it.each([
    ["Logged in using ChatGPT", "chatgpt"],
    ["Logged in using an API key - masked", "api-key"],
    ["Not logged in", "missing"],
  ])(
    "detects Codex %s using the official status command only",
    async (output, auth) => {
      const provider = new CodexProvider(async () => output);
      const status = await provider.inspect();
      expect(status.auth).toBe(auth);
      expect(status.ready).toBe(false);
      expect(status.capabilities.text).toBe(false);
      expect(() => provider.respond()).toThrow("deny-all");
    },
  );
  it("reports Codex CLI failure without exposing stderr or credentials", async () => {
    const provider = new CodexProvider(async () => {
      throw new Error("secret");
    });
    const status = await provider.inspect();
    expect(status.auth).toBe("error");
    expect(status.message).not.toContain("secret");
  });
  it("never treats subscription OAuth or cloud credentials as Claude API authentication", async () => {
    const run = vi.fn();
    const provider = new ClaudeProvider(run as unknown as typeof query, () => ({
      CLAUDE_CODE_OAUTH_TOKEN: "subscription",
      AWS_BEARER_TOKEN_BEDROCK: "cloud",
    }));
    expect((await provider.inspect(true)).auth).toBe("missing");
    await expect(collect(provider)).rejects.toThrow("ANTHROPIC_API_KEY");
    expect(run).not.toHaveBeenCalled();
  });
  it("requires a separate API opt-in even with a detected key and rechecks it on every request", async () => {
    const f = fixture([]);
    const status = await f.provider.inspect(false);
    expect(status.auth).toBe("api-key");
    expect(status.ready).toBe(false);
    await expect(collect(f.provider)).rejects.toThrow("billing");
    expect(f.run).not.toHaveBeenCalled();
    await f.provider.inspect(true);
    await f.provider.inspect(false);
    await expect(collect(f.provider)).rejects.toThrow("billing");
  });
  it("uses explicit no-tools, deny-all, no settings/MCP/skills/plugins, ephemeral API-only options", async () => {
    const opts = claudeOptions(
      "isolated",
      "synthetic-key",
      new AbortController(),
    );
    expect(opts).toMatchObject({
      tools: [],
      disallowedTools: ["*"],
      permissionMode: "dontAsk",
      allowDangerouslySkipPermissions: false,
      settingSources: [],
      skills: [],
      plugins: [],
      agents: {},
      mcpServers: {},
      strictMcpConfig: true,
      persistSession: false,
      enableFileCheckpointing: false,
    });
    expect(opts.env?.ANTHROPIC_API_KEY).toBe("synthetic-key");
    expect(opts.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(opts.env?.OPENAI_API_KEY).toBeUndefined();
    expect(opts.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    for (const name of [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Agent",
      "mcp__files__read",
    ]) {
      const result = await opts.canUseTool!(
        name,
        {},
        {
          signal: new AbortController().signal,
          toolUseID: "test",
          requestId: "test",
        },
      );
      expect(result?.behavior).toBe("deny");
    }
  });
  it("allowlists process environment and strips endpoint, subscription, cloud and unrelated secrets", () => {
    const env = baseEnvironment({
      Path: "path",
      SYSTEMROOT: "windows",
      ANTHROPIC_BASE_URL: "evil",
      OPENAI_API_KEY: "secret",
      CLAUDE_CODE_OAUTH_TOKEN: "secret",
      CUSTOM_SECRET: "secret",
      NODE_OPTIONS: "--require evil",
      AWS_ACCESS_KEY_ID: "secret",
    });
    expect(env).toEqual({ Path: "path", SYSTEMROOT: "windows" });
  });
  it("streams provider deltas and result usage, includes images in memory, and cleans temporary config", async () => {
    const f = fixture([
      init,
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        },
      },
      completed,
    ]);
    await f.provider.inspect(true);
    const events = await collect(f.provider, {
      ...request(),
      screenshot: frame,
    });
    expect(events).toEqual([
      { type: "text", text: "Hello" },
      {
        type: "complete",
        text: "Hello world",
        model: "fixture-model",
        usage: { inputTokens: 7, outputTokens: 3, estimatedUsd: 0.0001 },
      },
    ]);
    expect(f.message().message.content).toEqual([
      { type: "text", text: "Reviewed prompt" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "dGVzdA==" },
      },
    ]);
    expect(f.close).toHaveBeenCalled();
    await expect(access(f.options().cwd!)).rejects.toThrow();
  });
  it.each([
    { ...init, tools: ["Bash"] },
    { ...init, mcp_servers: [{ name: "files" }] },
    { ...init, skills: ["unrelated"] },
    { ...init, plugins: [{ name: "unsafe" }] },
    { ...init, permissionMode: "bypassPermissions" },
    { ...init, apiKeySource: "oauth" },
  ])(
    "rejects an SDK that reports unexpected execution/auth permissions",
    async (event) => {
      const f = fixture([event, completed]);
      await f.provider.inspect(true);
      await expect(collect(f.provider)).rejects.toThrow("restrictions");
      expect(f.close).toHaveBeenCalled();
      await expect(access(f.options().cwd!)).rejects.toThrow();
    },
  );
  it("stops an attempted tool-use message and cleans the workspace on failure", async () => {
    const f = fixture([
      init,
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              id: "tool",
              input: { command: "write file" },
            },
          ],
        },
      },
    ]);
    await f.provider.inspect(true);
    await expect(collect(f.provider)).rejects.toThrow("prohibited tool call");
    expect(f.close).toHaveBeenCalled();
    await expect(access(f.options().cwd!)).rejects.toThrow();
  });
  it("rejects output without an SDK permission confirmation", async () => {
    const f = fixture([completed]);
    await f.provider.inspect(true);
    await expect(collect(f.provider)).rejects.toThrow("restrictions");
  });
  it("never emits SDK authentication error bodies as response text", async () => {
    const f = fixture([
      init,
      {
        type: "assistant",
        error: "authentication_failed",
        message: { content: [{ type: "text", text: "sensitive-error-body" }] },
      },
    ]);
    await f.provider.inspect(true);
    const output: ProviderEvent[] = [];
    const consume = async () => {
      for await (const event of f.provider.respond(
        request(),
        new AbortController().signal,
      ))
        output.push(event);
    };
    await expect(consume()).rejects.toThrow("authentication_failed");
    expect(output).toEqual([]);
    await expect(access(f.options().cwd!)).rejects.toThrow();
  });
  it("cancels the SDK and removes temporary files when iteration is cancelled", async () => {
    const f = fixture([
      init,
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "partial" },
        },
      },
      completed,
    ]);
    await f.provider.inspect(true);
    const abort = new AbortController();
    const stream = f.provider.respond(request(), abort.signal);
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    abort.abort();
    await expect(iterator.next()).rejects.toThrow();
    expect(f.close).toHaveBeenCalled();
    expect(f.options().abortController?.signal.aborted).toBe(true);
    await expect(access(f.options().cwd!)).rejects.toThrow();
  });
  it("reports SDK termination without a completed response and cleans its workspace", async () => {
    const f = fixture([init]);
    await f.provider.inspect(true);
    await expect(collect(f.provider)).rejects.toThrow("stopped");
    await expect(access(f.options().cwd!)).rejects.toThrow();
  });
});
