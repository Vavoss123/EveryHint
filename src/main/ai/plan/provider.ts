import type {
  AIModel,
  AIProvider,
  AIRequest,
  ProviderEvent,
  ProviderStatus,
} from "../../../shared/ai";
import { record } from "../../../shared/validation";
import { defaultCatalogModel } from "../../../shared/connection";
import { RESPONSE_INSTRUCTIONS } from "../context";
import { ProviderError } from "../errors";
import type { ChatGptAccounts } from "./accounts";
import { httpError, limitedJson, planFetch, type PlanFetch } from "./http";
import { planAllowed, RESOURCE } from "./oauth";

type Accounts = Pick<ChatGptAccounts, "identity" | "registration" | "token">;
export function parseModels(body: unknown): AIModel[] {
  const list = record(body).models;
  if (!Array.isArray(list) || list.length > 500)
    throw new ProviderError(
      "provider",
      "OpenAI returned an unsupported model catalog.",
    );
  const models: AIModel[] = [];
  for (const raw of list) {
    const item = record(raw);
    if (item.visibility !== "list") continue;
    if (
      typeof item.slug !== "string" ||
      !/^[A-Za-z0-9_.:/-]{1,200}$/.test(item.slug) ||
      typeof item.display_name !== "string" ||
      !item.display_name ||
      item.display_name.length > 200
    )
      throw new ProviderError(
        "provider",
        "OpenAI returned invalid model metadata.",
      );
    if (models.some((model) => model.id === item.slug)) continue;
    // Missing image metadata is never interpreted as image support.
    models.push({
      id: item.slug,
      name: Array.from(item.display_name)
        .filter(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        )
        .join(""),
      images:
        Array.isArray(item.input_modalities) &&
        item.input_modalities.includes("image"),
    });
  }
  return models;
}
async function* events(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  // The request explicitly asks for SSE. Validate its bounded data frames and
  // terminal event rather than rejecting a stream solely on MIME metadata.
  if (!response.body)
    throw new ProviderError(
      "network",
      "OpenAI returned an empty Responses stream.",
    );
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "",
    size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        pending += decoder.decode();
        break;
      }
      size += value.length;
      if (size > 4 * 1024 * 1024)
        throw new ProviderError(
          "provider",
          "The response stream exceeded its size limit.",
        );
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 512000)
        throw new ProviderError(
          "provider",
          "A response event exceeded its size limit.",
        );
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const block = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data) as unknown;
        } catch (error) {
          if (error instanceof SyntaxError)
            throw new ProviderError(
              "provider",
              "OpenAI returned an invalid stream event.",
            );
          throw error;
        }
      }
    }
    if (pending.trim()) {
      const mime = response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase();
      const safeMime =
        mime && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) && mime.length <= 80
          ? mime
          : "unknown";
      if (pending.trimStart().startsWith("{")) {
        let error: unknown;
        try {
          const value = record(JSON.parse(pending));
          error = value.error;
        } catch {
          /* No raw provider bodies enter diagnostics. */
        }
        if (error) throw await streamError(error);
      }
      throw new ProviderError(
        "network",
        `OpenAI ended without a complete SSE event (HTTP ${response.status}, ${safeMime}). No automatic retry or billing fallback was made.`,
      );
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function rejectTools(value: unknown): void {
  const item = record(value);
  if (item.type !== "message" && item.type !== "reasoning")
    throw new ProviderError(
      "permissions",
      "OpenAI returned an unsupported output or tool attempt. EveryHint has no tool executor.",
    );
}
async function streamError(value: unknown): Promise<ProviderError> {
  const error =
    typeof value === "object" && value !== null
      ? (value as { code?: unknown })
      : {};
  const code =
    typeof error.code === "string" && /^[\w-]{1,100}$/.test(error.code)
      ? error.code
      : "response_failed";
  const status = /usage_limit_exceeded|rate_limit/.test(code)
    ? 429
    : /unavailable/.test(code)
      ? 503
      : /invalid_user|invalid_token/.test(code)
        ? 401
        : /scope|authoriz|eligible|capability|route|permission/.test(code)
          ? 403
          : 500;
  return httpError(
    new Response(JSON.stringify({ error: { code } }), { status }),
  );
}
export class ChatGptProvider implements AIProvider {
  // Preserve the P4 IPC identifier; UI and docs identify the actual transport as ChatGPT.
  readonly id = "codex" as const;
  private models: AIModel[] = [];
  private selected: string | null = null;
  private owner: string | null = null;
  private fetchedAt = 0;
  private verified = new Set<string>();
  private discovery: AbortController | undefined;
  private generation = 0;
  constructor(
    private readonly accounts: Accounts,
    private readonly transport: PlanFetch = planFetch,
    private readonly now: () => number = Date.now,
  ) {}
  invalidate(): void {
    this.generation++;
    this.discovery?.abort();
    this.discovery = undefined;
    this.models = [];
    this.selected = null;
    this.owner = null;
    this.verified.clear();
  }
  get selectedModel(): string | null {
    return this.selected;
  }
  // Called only by a deliberate session-sharing or Ask action, never startup.
  async readyForRequest(): Promise<void> {
    if ((await this.inspect()).ready) return;
    const previous = this.selected;
    await this.discoverModels();
    const model = previous
      ? this.models.find((item) => item.id === previous)
      : defaultCatalogModel(this.models);
    if (!model)
      throw new ProviderError(
        "permissions",
        "The selected model is unavailable for this account. Choose an available model in Account & AI.",
      );
    this.selectModel(model.id);
  }
  private fresh(): boolean {
    return (
      this.owner !== null &&
      this.owner === this.accounts.identity &&
      this.now() - this.fetchedAt < 5 * 60000
    );
  }
  async inspect(): Promise<ProviderStatus> {
    const connected = Boolean(this.accounts.registration?.tokens),
      allowed = planAllowed(this.accounts.registration?.tokens ?? null);
    const fresh = this.fresh(),
      model = fresh
        ? this.models.find((item) => item.id === this.selected)
        : undefined;
    return {
      id: this.id,
      auth: connected ? "chatgpt" : "missing",
      ready: allowed && Boolean(model),
      message: !connected
        ? "Continue with ChatGPT to connect an EveryHint registration. Shared Codex credentials and API keys are not used."
        : !allowed
          ? "ChatGPT identity is connected, but plan permission is missing. Grant plan permission explicitly."
          : !fresh
            ? "Refresh models to request the current account catalog from OpenAI. No inference runs automatically."
            : !model
              ? "Choose a model from the current account catalog. Catalog visibility does not guarantee inference access."
              : this.verified.has(model.id)
                ? "A ChatGPT plan response completed with this model in this account session. Usage limits still apply."
                : "Ready to request a ChatGPT plan answer. Access to this model is unverified until a response completes.",
      capabilities: {
        text: allowed && Boolean(model),
        images: allowed && Boolean(model?.images),
        tools: false,
      },
      models: fresh ? this.models.map((item) => item.id) : [],
      modelDetails: fresh ? structuredClone(this.models) : [],
      selectedModel: fresh ? this.selected : null,
    };
  }
  async discoverModels(signal?: AbortSignal): Promise<void> {
    this.discovery?.abort();
    const abort = new AbortController();
    this.discovery = abort;
    const generation = this.generation,
      identity = this.accounts.identity;
    const combined = AbortSignal.any([
      abort.signal,
      ...(signal ? [signal] : []),
    ]);
    try {
      const token = await this.accounts.token(combined);
      combined.throwIfAborted();
      const response = await this.transport(`${RESOURCE}/models`, {
        signal: combined,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      });
      if (!response.ok) throw await httpError(response);
      const models = parseModels(await limitedJson(response));
      combined.throwIfAborted();
      if (
        generation !== this.generation ||
        identity !== this.accounts.identity ||
        this.discovery !== abort
      )
        throw new ProviderError(
          "cancelled",
          "The ChatGPT account changed during model discovery.",
        );
      this.models = models;
      this.selected = null;
      this.owner = identity;
      this.fetchedAt = this.now();
      if (models.length === 0)
        throw new ProviderError(
          "permissions",
          "This ChatGPT account returned no visible models. No API-key fallback was made.",
        );
    } finally {
      if (this.discovery === abort) this.discovery = undefined;
    }
  }
  selectModel(id: unknown): void {
    if (
      typeof id !== "string" ||
      !this.fresh() ||
      !this.models.some((model) => model.id === id)
    )
      throw new Error(
        "Refresh the current ChatGPT model catalog and select a listed model.",
      );
    this.selected = id;
  }
  async *respond(
    request: AIRequest,
    signal: AbortSignal,
    canSend?: () => boolean,
  ): AsyncGenerator<ProviderEvent> {
    const model =
      this.fresh() &&
      this.models.find(
        (item) => item.id === request.model && item.id === this.selected,
      );
    if (!model)
      throw new ProviderError(
        "permissions",
        "The reviewed model is no longer selected or its catalog expired. Refresh models, select one and review again.",
      );
    if (request.screenshot && !model.images)
      throw new ProviderError(
        "permissions",
        "The selected model has no verified image-input capability. Uncheck screenshot and review again.",
      );
    const generation = this.generation,
      identity = this.accounts.identity;
    const token = await this.accounts.token(signal);
    signal.throwIfAborted();
    if (canSend && !canSend())
      throw new ProviderError(
        "cancelled",
        "Live Assist permission expired or changed before transmission.",
      );
    if (generation !== this.generation || identity !== this.accounts.identity)
      throw new ProviderError(
        "cancelled",
        "The ChatGPT account changed before sending.",
      );
    const content: Record<string, string>[] = [
      { type: "input_text", text: request.prompt },
    ];
    if (request.screenshot)
      content.push({
        type: "input_image",
        image_url: request.screenshot.dataUrl,
      });
    const response = await this.transport(`${RESOURCE}/responses`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: model.id,
        instructions: RESPONSE_INSTRUCTIONS,
        input: [{ role: "user", content }],
        store: false,
        stream: true,
        tools: [],
        tool_choice: "none",
      }),
    });
    if (!response.ok) throw await httpError(response);
    let text = "";
    for await (const raw of events(response, signal)) {
      signal.throwIfAborted();
      if (generation !== this.generation || identity !== this.accounts.identity)
        throw new ProviderError(
          "cancelled",
          "The ChatGPT account changed during inference.",
        );
      const event = record(raw);
      if (typeof event.type !== "string")
        throw new ProviderError(
          "provider",
          "OpenAI returned an invalid event type.",
        );
      if (
        /call|tool|computer|code_interpreter|web_search|file_search/.test(
          event.type,
        )
      )
        throw new ProviderError(
          "permissions",
          "A tool attempt was rejected. EveryHint has no tool executor.",
        );
      if (
        event.type === "response.output_item.added" ||
        event.type === "response.output_item.done"
      )
        rejectTools(event.item);
      if (
        event.type === "response.output_text.delta" ||
        event.type === "response.refusal.delta"
      ) {
        if (
          typeof event.delta !== "string" ||
          text.length + event.delta.length > 32000
        )
          throw new ProviderError(
            "provider",
            "The response exceeded the 32,000 character text limit.",
          );
        text += event.delta;
        yield { type: "text", text };
      } else if (event.type === "response.failed")
        throw await streamError(record(event.response).error);
      else if (event.type === "error")
        throw await streamError(event.error ?? event);
      else if (event.type === "response.incomplete")
        throw new ProviderError(
          "provider",
          "OpenAI ended this response as incomplete. Partial text is retained; no retry or provider fallback was made.",
        );
      else if (event.type === "response.completed") {
        const result = record(event.response);
        if (result.status !== "completed" || !Array.isArray(result.output))
          throw new ProviderError(
            "provider",
            "OpenAI did not confirm completed inference.",
          );
        for (const item of result.output) rejectTools(item);
        const final = result.output
          .flatMap((item) => {
            const value = record(item);
            return value.type === "message" && Array.isArray(value.content)
              ? value.content.map((part) => {
                  const value = record(part);
                  return value.type === "output_text" &&
                    typeof value.text === "string"
                    ? value.text
                    : value.type === "refusal" &&
                        typeof value.refusal === "string"
                      ? value.refusal
                      : "";
                })
              : [];
          })
          .join("");
        if (final.length > 32000 || !final || (text && final !== text))
          throw new ProviderError(
            "provider",
            "OpenAI returned inconsistent or empty completed text.",
          );
        const usage =
          result.usage && typeof result.usage === "object"
            ? record(result.usage)
            : {};
        const count = (value: unknown) =>
          typeof value === "number" && Number.isSafeInteger(value) && value >= 0
            ? value
            : undefined;
        this.verified.add(model.id);
        yield {
          type: "complete",
          text: final,
          model:
            typeof result.model === "string" && result.model.length <= 200
              ? result.model
              : model.id,
          usage: {
            inputTokens: count(usage.input_tokens),
            outputTokens: count(usage.output_tokens),
          },
        };
        return;
      }
    }
    throw new ProviderError(
      "network",
      "The Responses stream ended without response.completed. Partial text is retained.",
    );
  }
  dispose(): void {
    this.invalidate();
  }
}
