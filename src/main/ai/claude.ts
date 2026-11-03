import Anthropic from "@anthropic-ai/sdk";
import type {
  AIModel,
  AIProvider,
  AIRequest,
  ProviderEvent,
  ProviderStatus,
} from "../../shared/ai";
import { RESPONSE_INSTRUCTIONS } from "./context";
import { ProviderError } from "./errors";
import type { CredentialVault } from "./plan/vault";

export const CLAUDE_MODELS: readonly (AIModel & {
  usdPerMillion: { input: number; output: number };
})[] = [
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5 · best answers",
    images: true,
    usdPerMillion: { input: 4, output: 20 },
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5 · faster",
    images: true,
    usdPerMillion: { input: 2, output: 10 },
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5 · fastest, lowest cost",
    images: true,
    usdPerMillion: { input: 0.1, output: 0.5 },
  },
];
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
// Responses are capped at 32,000 characters by the assistant controller.
const MAX_TOKENS = 16000;
type Client = Pick<Anthropic, "beta">;
export function parseClaudeKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key))
    throw new Error(
      "Paste an Anthropic API key from console.anthropic.com. It starts with sk-ant-.",
    );
  return key;
}
function failure(error: unknown): ProviderError {
  // Never forward HTTP bodies or credential values to the renderer/logs.
  if (error instanceof Anthropic.AuthenticationError)
    return new ProviderError(
      "auth",
      "Anthropic rejected the API key. Check or replace it in Account & AI.",
    );
  if (error instanceof Anthropic.PermissionDeniedError)
    return new ProviderError(
      "permissions",
      "This Anthropic API key cannot use the selected Claude model.",
    );
  if (error instanceof Anthropic.RateLimitError)
    return new ProviderError(
      "rate-limit",
      "Claude is rate limited or the API account is out of credit. Wait, or check billing at console.anthropic.com.",
    );
  if (error instanceof Anthropic.BadRequestError)
    return new ProviderError(
      "provider",
      "Claude rejected the request. Try a shorter question or less context.",
    );
  if (error instanceof Anthropic.APIConnectionError)
    return new ProviderError(
      "network",
      "Could not reach Claude. Check your network, then try again.",
    );
  if (error instanceof Anthropic.APIError)
    return new ProviderError(
      "provider",
      "Claude could not finish this request. Try again.",
    );
  if (error instanceof ProviderError) return error;
  return new ProviderError(
    "provider",
    "Claude could not finish this request. Try again.",
  );
}
export class ClaudeProvider implements AIProvider {
  readonly id = "claude" as const;
  private apiBilling = false;
  private model = DEFAULT_CLAUDE_MODEL;
  private stored: string | null | undefined;
  constructor(
    private readonly vault: CredentialVault | null = null,
    private readonly environment: () => NodeJS.ProcessEnv = () => process.env,
    private readonly client: (key: string) => Client = (apiKey) =>
      new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 }),
  ) {}
  get selectedModel(): string {
    return this.model;
  }
  /** True when the key was saved in EveryHint, which is the billing opt-in. */
  async hasSavedKey(): Promise<boolean> {
    return Boolean(await this.savedKey());
  }
  private async savedKey(): Promise<string | null> {
    if (this.stored === undefined)
      this.stored = (await this.vault?.read().catch(() => null)) ?? null;
    return this.stored;
  }
  private async key(): Promise<string | null> {
    return (
      (await this.savedKey()) ||
      this.environment().ANTHROPIC_API_KEY?.trim() ||
      null
    );
  }
  async saveKey(value: unknown): Promise<void> {
    const key = parseClaudeKey(value);
    if (!this.vault) throw new Error("Secure key storage is unavailable.");
    await this.vault.write(key);
    this.stored = key;
  }
  async clearKey(): Promise<void> {
    await this.vault?.clear();
    this.stored = null;
  }
  selectModel(id: unknown): void {
    if (!CLAUDE_MODELS.some((model) => model.id === id))
      throw new Error("Choose a listed Claude model.");
    this.model = id as string;
  }
  async inspect(apiBilling: boolean): Promise<ProviderStatus> {
    this.apiBilling = apiBilling;
    const saved = Boolean(await this.savedKey()),
      hasKey = Boolean(await this.key());
    return {
      id: this.id,
      auth: hasKey ? "api-key" : "missing",
      ready: apiBilling && hasKey,
      capabilities: { text: true, images: true, tools: false },
      models: CLAUDE_MODELS.map((model) => model.id),
      modelDetails: CLAUDE_MODELS.map(({ id, name, images }) => ({
        id,
        name,
        images,
      })),
      selectedModel: this.model,
      message: !hasKey
        ? "Add your Anthropic API key to use Claude. Requests are billed to your Anthropic API account."
        : !apiBilling
          ? "API key found in ANTHROPIC_API_KEY. Enable Claude API billing for this session to use it."
          : `Ready. ${saved ? "Saved API key" : "ANTHROPIC_API_KEY"} · requests are billed to your Anthropic API account.`,
    };
  }
  async *respond(
    request: AIRequest,
    signal: AbortSignal,
    canSend?: () => boolean,
  ): AsyncIterable<ProviderEvent> {
    if (!this.apiBilling)
      throw new ProviderError(
        "billing",
        "Add a Claude API key or enable Claude API billing before asking.",
      );
    const key = await this.key();
    if (!key)
      throw new ProviderError(
        "auth",
        "Add your Anthropic API key in Account & AI to use Claude.",
      );
    const model = CLAUDE_MODELS.find((item) => item.id === this.model)!;
    signal.throwIfAborted();
    if (canSend && !canSend())
      throw new ProviderError(
        "cancelled",
        "Permission expired or changed before transmission.",
      );
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (request.screenshot)
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: request.screenshot.dataUrl.slice(
            request.screenshot.dataUrl.indexOf(",") + 1,
          ),
        },
      });
    content.push({ type: "text", text: request.prompt });
    let text = "";
    try {
      const stream = this.client(key).beta.messages.stream(
        {
          model: model.id,
          max_tokens: MAX_TOKENS,
          system: RESPONSE_INSTRUCTIONS,
          messages: [{ role: "user", content }],
          // Live help favours latency; adaptive thinking still scales with
          // the problem.
          output_config: { effort: "medium" },
          // Retry a safety-classifier decline on a suitable model instead of
          // failing the live answer.
          ...(model.id === "claude-haiku-5-5"
            ? {}
            : {
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default" as const,
              }),
        },
        { signal },
      );
      for await (const event of stream) {
        signal.throwIfAborted();
        if (
          event.type === "content_block_start" &&
          ["tool_use", "server_tool_use"].includes(event.content_block.type)
        )
          throw new ProviderError(
            "permissions",
            "The provider attempted a prohibited tool call. Request stopped.",
          );
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text;
          yield { type: "text", text };
        }
      }
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal")
        throw new ProviderError(
          "provider",
          "Claude declined to answer this request.",
        );
      const input = message.usage.input_tokens,
        output = message.usage.output_tokens;
      yield {
        type: "complete",
        text,
        model: message.model,
        usage: {
          inputTokens: input,
          outputTokens: output,
          estimatedUsd:
            (input * model.usdPerMillion.input +
              output * model.usdPerMillion.output) /
            1_000_000,
        },
      };
    } catch (error) {
      if (signal.aborted)
        throw new ProviderError("cancelled", "Request cancelled.");
      throw failure(error);
    }
  }
  dispose(): void {}
}
