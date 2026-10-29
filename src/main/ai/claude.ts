import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  query,
  type Options,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AIProvider,
  AIRequest,
  ProviderEvent,
  ProviderStatus,
} from "../../shared/ai";
import { RESPONSE_INSTRUCTIONS } from "./context";
import { baseEnvironment } from "./environment";
import { ProviderError } from "./errors";

export function claudeOptions(
  root: string,
  key: string,
  abortController: AbortController,
): Options {
  return {
    abortController,
    cwd: root,
    env: {
      ...baseEnvironment(),
      ANTHROPIC_API_KEY: key,
      CLAUDE_CONFIG_DIR: root,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4096",
      MAX_THINKING_TOKENS: "1024",
      CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
      CLAUDE_AGENT_SDK_CLIENT_APP: "everyhint/0.5.0",
    },
    tools: [],
    disallowedTools: ["*"],
    allowedTools: [],
    permissionMode: "dontAsk",
    allowDangerouslySkipPermissions: false,
    canUseTool: async () => ({
      behavior: "deny",
      message: "EveryHint is response-only. All tool execution is prohibited.",
    }),
    extraArgs: { bare: null, "disable-slash-commands": null },
    settingSources: [],
    settings: {
      disableAllHooks: true,
      autoMemoryEnabled: false,
      disableBundledSkills: true,
      enabledPlugins: {
        "cc-plugin-agents-md@builtin": false,
        "cc-plugin-plugin-authoring@builtin": false,
      },
      permissions: { deny: ["*"] },
    },
    skills: [],
    plugins: [],
    agents: {},
    mcpServers: {},
    strictMcpConfig: true,
    persistSession: false,
    enableFileCheckpointing: false,
    systemPrompt: RESPONSE_INSTRUCTIONS,
    includePartialMessages: true,
    maxTurns: 1,
    maxBudgetUsd: 1,
  };
}
async function* userMessage(
  request: AIRequest,
): AsyncGenerator<SDKUserMessage> {
  const content = [
    { type: "text" as const, text: request.prompt },
    ...(request.screenshot
      ? [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: "image/jpeg" as const,
              data: request.screenshot.dataUrl.split(",")[1]!,
            },
          },
        ]
      : []),
  ];
  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}
async function removeWorkspace(root: string): Promise<void> {
  if (
    !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
    !root.includes("everyhint-ai-")
  )
    throw new Error("Invalid assistant temporary directory.");
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
export class ClaudeProvider implements AIProvider {
  readonly id = "claude" as const;
  private apiBilling = false;
  private running: Query | undefined;
  private abort: AbortController | undefined;
  private child: ChildProcessWithoutNullStreams | undefined;
  private busy = false;
  private cleanup: Promise<void> = Promise.resolve();
  constructor(
    private readonly runQuery: typeof query = query,
    private readonly environment: () => NodeJS.ProcessEnv = () => process.env,
  ) {}
  async inspect(apiBilling: boolean): Promise<ProviderStatus> {
    this.apiBilling = apiBilling;
    const hasKey = Boolean(this.environment().ANTHROPIC_API_KEY?.trim());
    return {
      id: this.id,
      auth: hasKey ? "api-key" : "missing",
      ready: apiBilling && hasKey,
      capabilities: { text: true, images: true, tools: false },
      models: [],
      message: !apiBilling
        ? "Disabled. Claude requires a separate API-billing opt-in for this app session. Subscription login is unsupported."
        : !hasKey
          ? "Not connected. Set ANTHROPIC_API_KEY before starting EveryHint. Claude subscription/OAuth credentials are not used."
          : "API key detected. Authentication is checked when asking. Explicit Ask may incur Anthropic API charges. The provider selects its default model; quotas are unavailable.",
    };
  }
  async *respond(
    request: AIRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    if (!this.apiBilling)
      throw new ProviderError(
        "billing",
        "Enable Claude API billing explicitly before asking.",
      );
    const key = this.environment().ANTHROPIC_API_KEY?.trim();
    if (!key)
      throw new ProviderError(
        "auth",
        "ANTHROPIC_API_KEY is missing. Subscription credentials are not used.",
      );
    if (this.busy)
      throw new ProviderError(
        "provider",
        "A Claude request is already running.",
      );
    signal.throwIfAborted();
    this.busy = true;
    let cleaned!: () => void;
    this.cleanup = new Promise<void>((done) => {
      cleaned = done;
    });
    let root: string;
    try {
      root = await mkdtemp(join(tmpdir(), "everyhint-ai-"));
    } catch (error) {
      this.busy = false;
      cleaned();
      throw error;
    }
    const abort = new AbortController();
    this.abort = abort;
    const cancel = (): void => {
      abort.abort();
      this.running?.close();
    };
    signal.addEventListener("abort", cancel, { once: true });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const forceStop = (): void => {
      // The SDK closes stdin and has its own cancellation signal. Bound teardown
      // even if an SDK/CLI regression fails to finish its graceful shutdown.
      killTimer = setTimeout(() => this.child?.kill("SIGKILL"), 3000);
      killTimer.unref();
    };
    signal.addEventListener("abort", forceStop, { once: true });
    let text = "";
    let model: string | undefined;
    let complete = false;
    let confirmed = false;
    try {
      signal.throwIfAborted();
      const options = claudeOptions(root, key, abort);
      options.spawnClaudeCodeProcess = (spec) => {
        // Use Electron's bundled Node runtime, never a shell or a visible console.
        this.child = spawn(
          spec.command === "node" ? process.execPath : spec.command,
          spec.args,
          {
            cwd: spec.cwd,
            env: { ...spec.env, ELECTRON_RUN_AS_NODE: "1" },
            signal: spec.signal,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        // SDK errors are mapped to safe messages; stderr can contain sensitive data.
        this.child.stderr.resume();
        return this.child;
      };
      const stream = this.runQuery({ prompt: userMessage(request), options });
      this.running = stream;
      for await (const event of stream) {
        signal.throwIfAborted();
        if (event.type === "system" && event.subtype === "init") {
          if (
            event.tools.length ||
            event.mcp_servers.length ||
            event.skills.length ||
            event.plugins.length ||
            event.permissionMode !== "dontAsk" ||
            event.apiKeySource !== "ANTHROPIC_API_KEY"
          )
            throw new ProviderError(
              "permissions",
              "Claude did not confirm the required tool and API-authentication restrictions. Request stopped.",
            );
          model = event.model;
          confirmed = true;
        }
        if (
          event.type === "stream_event" &&
          event.event.type === "content_block_delta" &&
          event.event.delta.type === "text_delta"
        ) {
          if (!confirmed)
            throw new ProviderError(
              "permissions",
              "Claude did not confirm its execution restrictions.",
            );
          text += event.event.delta.text;
          yield { type: "text", text };
        }
        if (event.type === "assistant") {
          // Authentication/API error message bodies may contain sensitive details.
          // Classify their error code before considering any accompanying text.
          if (event.error) throw new Error(event.error);
          if (!confirmed)
            throw new ProviderError(
              "permissions",
              "Claude did not confirm its execution restrictions.",
            );
          if (event.message.content.some((block) => block.type === "tool_use"))
            throw new ProviderError(
              "permissions",
              "The provider attempted a prohibited tool call. Request stopped.",
            );
          const full = event.message.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n");
          if (full && full !== text) {
            text = full;
            yield { type: "text", text };
          }
        }
        if (event.type === "result") {
          if (event.is_error || event.subtype !== "success")
            throw new Error(
              event.subtype === "success"
                ? event.result
                : event.errors.join(" "),
            );
          complete = true;
          if (!confirmed)
            throw new ProviderError(
              "permissions",
              "Claude did not confirm its execution restrictions.",
            );
          text = event.result || text;
          yield {
            type: "complete",
            text,
            model,
            usage: {
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
              estimatedUsd: event.total_cost_usd,
            },
          };
        }
      }
      if (!complete)
        throw new ProviderError(
          "process",
          "Claude stopped before producing a completed response.",
        );
    } finally {
      signal.removeEventListener("abort", cancel);
      signal.removeEventListener("abort", forceStop);
      if (killTimer) clearTimeout(killTimer);
      try {
        this.running?.close();
        this.running = undefined;
        this.abort = undefined;
        const child = this.child;
        this.child = undefined;
        if (child && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await new Promise<void>((resolveExit) =>
            child.once("exit", () => resolveExit()),
          );
        }
      } finally {
        // Only the directory returned by mkdtemp can be removed.
        try {
          await removeWorkspace(root);
        } finally {
          this.busy = false;
          cleaned();
        }
      }
    }
  }
  async dispose(): Promise<void> {
    this.abort?.abort();
    this.running?.close();
    this.child?.kill("SIGKILL");
    await this.cleanup;
  }
}
