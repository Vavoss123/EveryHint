import { randomUUID } from "node:crypto";
import type {
  AIProvider,
  AIResponse,
  AssistantSnapshot,
  ContextReview,
  ConversationTurn,
  ProviderId,
  ProviderStatus,
} from "../../shared/ai";
import { parseReview, providerId } from "../../shared/ai";
import type { SessionSnapshot } from "../../shared/contracts";
import type { TranscriptEvent } from "../../shared/transcription";
import { exactKeys, record } from "../../shared/validation";
import { buildReview, imageHash } from "./context";
import { providerError, ProviderError } from "./errors";

const maxResponseChars = 32000;
export class AssistantController {
  private revision = 0;
  private selected: ProviderId = "codex";
  private sessionId = randomUUID();
  private claudeApiBilling = false;
  private statuses: ProviderStatus[];
  private review: ContextReview | null = null;
  private responses: AIResponse[] = [];
  private history: ConversationTurn[] = [];
  private sentImages = new Set<string>();
  private active:
    | {
        id: string;
        abort: AbortController;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private inspecting: Promise<void> | undefined;
  private reviewTimer: ReturnType<typeof setTimeout> | undefined;
  private historyTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private captureSession: string | null = null;
  constructor(
    private readonly providers: readonly AIProvider[],
    private readonly sources: () => {
      capture: SessionSnapshot;
      events: readonly TranscriptEvent[];
    },
    private readonly changed: (value: AssistantSnapshot) => void,
    private readonly timeoutMs = 90000,
    private readonly now: () => number = Date.now,
  ) {
    if (
      new Set(providers.map((provider) => provider.id)).size !== 2 ||
      providers.length !== 2
    )
      throw new Error("Register exactly one ChatGPT and one Claude provider.");
    this.statuses = providers.map((provider) => ({
      id: provider.id,
      auth: "unknown",
      ready: false,
      message: "Inspect the local connection before asking.",
      capabilities: { text: false, images: false, tools: false },
      models: [],
    }));
  }
  get value(): AssistantSnapshot {
    return structuredClone({
      revision: this.revision,
      sessionId: this.sessionId,
      selected: this.selected,
      providers: this.statuses,
      claudeApiBilling: this.claudeApiBilling,
      review: this.review,
      responses: this.responses,
    });
  }
  private publish(): void {
    if (!this.closed) {
      this.revision++;
      this.changed(this.value);
    }
  }
  async inspect(): Promise<void> {
    if (this.inspecting) return this.inspecting;
    const optIn = this.claudeApiBilling;
    this.inspecting = (async () => {
      const statuses = await Promise.all(
        this.providers.map((provider) => provider.inspect(optIn)),
      );
      if (!this.closed && optIn === this.claudeApiBilling) {
        this.statuses = statuses;
        this.publish();
      }
    })().finally(() => {
      this.inspecting = undefined;
    });
    return this.inspecting;
  }
  select(value: unknown): void {
    const selected = providerId(value);
    if (selected === this.selected) return;
    this.clear();
    this.selected = selected;
    this.publish();
  }
  async billing(value: unknown): Promise<void> {
    if (typeof value !== "boolean")
      throw new Error("API billing opt-in must be a boolean.");
    this.cancel();
    this.discardReview();
    this.claudeApiBilling = value;
    // Immediately revoke readiness before the asynchronous inspection completes.
    this.statuses = this.statuses.map((status) =>
      status.id === "claude" ? { ...status, ready: false } : status,
    );
    this.publish();
    if (this.inspecting) await this.inspecting;
    await this.inspect();
  }
  prepare(value: unknown): void {
    if (this.closed) throw new Error("Assistant is shutting down.");
    if (this.active)
      throw new Error("Cancel the active request before reviewing another.");
    const input = parseReview(value);
    const status = this.statuses.find((status) => status.id === this.selected)!;
    if (input.options.screenshot && !status.capabilities.images)
      throw new Error(
        "This provider cannot accept screenshots through the current restricted integration.",
      );
    const { capture, events } = this.sources();
    const review = buildReview(
      input,
      this.selected,
      this.sessionId,
      capture,
      events,
      this.history,
      this.now(),
    );
    if (status.selectedModel) review.model = status.selectedModel;
    if (
      review.screenshot &&
      this.sentImages.has(imageHash(review.screenshot.dataUrl))
    )
      throw new Error(
        "This unchanged screenshot was already submitted. Uncheck screenshot or capture an updated image.",
      );
    this.discardReview();
    this.review = review;
    this.reviewTimer = setTimeout(() => this.discardReview(), 120000);
    this.publish();
  }
  discardReview(): void {
    if (this.reviewTimer) clearTimeout(this.reviewTimer);
    this.reviewTimer = undefined;
    if (this.review) {
      this.review = null;
      this.publish();
    }
  }
  async ask(value: unknown): Promise<void> {
    if (this.closed) throw new Error("Assistant is shutting down.");
    const input = record(value);
    exactKeys(input, ["reviewId", "acknowledged"]);
    if (input.acknowledged !== true)
      throw new Error("Acknowledge the remote data transfer for this request.");
    if (this.active) throw new Error("A request is already active.");
    const request = this.review;
    if (
      !request ||
      input.reviewId !== request.requestId ||
      request.sessionId !== this.sessionId ||
      request.provider !== this.selected ||
      request.expiresAt <= this.now()
    )
      throw new Error(
        "Review this question and its selected context before asking. The review may have expired.",
      );
    const provider = this.providers.find(
      (provider) => provider.id === this.selected,
    )!;
    const abort = new AbortController();
    const response: AIResponse = {
      requestId: request.requestId,
      sessionId: this.sessionId,
      provider: request.provider,
      question: request.question,
      text: "",
      status: "sending",
      startedAt: this.now(),
      firstTextAt: null,
      endedAt: null,
      error: null,
      usage: null,
      model: null,
    };
    const timer = setTimeout(
      () => this.finishCancelled("timeout"),
      this.timeoutMs,
    );
    this.active = { id: request.requestId, abort, timer };
    this.responses.push(response);
    this.expireHistory();
    while (this.responses.length > 8) this.responses.shift();
    while (
      this.responses.reduce(
        (sum, item) => sum + item.text.length + item.question.length,
        0,
      ) > 64000 &&
      this.responses.length > 1
    )
      this.responses.shift();
    this.discardReview();
    this.publish();
    // Reservation happens synchronously; double clicks cannot race auth inspection.
    void (async () => {
      try {
        const status = await provider.inspect(this.claudeApiBilling);
        if (!this.current(response)) return;
        this.statuses = this.statuses.map((item) =>
          item.id === status.id ? status : item,
        );
        if (!status.ready)
          throw new ProviderError(
            status.auth === "missing"
              ? "auth"
              : status.id === "codex"
                ? "permissions"
                : "billing",
            status.message,
          );
        if (request.model && request.model !== status.selectedModel)
          throw new ProviderError(
            "permissions",
            "The selected model changed. Review this question again.",
          );
        if (request.screenshot) {
          this.sentImages.add(imageHash(request.screenshot.dataUrl));
          if (this.sentImages.size > 32)
            this.sentImages.delete(this.sentImages.values().next().value!);
        }
        for await (const event of provider.respond(request, abort.signal)) {
          if (!this.current(response)) break;
          if (
            typeof event.text !== "string" ||
            event.text.length > maxResponseChars
          )
            throw new ProviderError(
              "provider",
              "Response exceeded the 32,000 character limit. Request stopped.",
            );
          response.text = event.text;
          if (event.text && response.firstTextAt === null)
            response.firstTextAt = this.now();
          response.status = "generating";
          if (event.type === "complete") {
            clearTimeout(timer);
            response.status = "completed";
            response.endedAt = this.now();
            response.usage = event.usage ?? null;
            response.model = event.model ?? null;
            this.history.push({
              question: request.question,
              answer: response.text,
            });
            while (
              this.history.length > 4 ||
              this.history.reduce(
                (sum, turn) => sum + turn.question.length + turn.answer.length,
                0,
              ) > 12000
            )
              this.history.shift();
            this.expireHistory();
            if (request.model) {
              // Reflect verified model access after completion. Inspection is
              // local metadata only; its failure cannot undo a completed answer.
              try {
                const inspected = await provider.inspect(this.claudeApiBilling);
                if (!this.current(response)) break;
                this.statuses = this.statuses.map((item) =>
                  item.id === inspected.id ? inspected : item,
                );
              } catch {
                /* Keep the completed response if local inspection fails. */
              }
            }
          }
          this.publish();
          if (event.type === "complete") break;
        }
        if (this.current(response) && response.status !== "completed")
          throw new ProviderError(
            "process",
            "The provider stopped before completing the response.",
          );
      } catch (error) {
        if (!this.current(response)) return;
        response.error = providerError(error);
        response.status =
          response.error.code === "rate-limit" ? "rate-limited" : "error";
        response.endedAt = this.now();
        if (response.error.code === "auth")
          this.statuses = this.statuses.map((status) =>
            status.id === response.provider
              ? {
                  ...status,
                  ready: false,
                  auth: "error",
                  message: response.error!.message,
                }
              : status,
          );
      } finally {
        if (this.current(response)) {
          clearTimeout(timer);
          this.active = undefined;
          this.publish();
        }
      }
    })();
  }
  private current(response: AIResponse): boolean {
    return (
      !this.closed &&
      this.active?.id === response.requestId &&
      this.sessionId === response.sessionId
    );
  }
  private finishCancelled(reason: "timeout" | "cancelled"): void {
    if (!this.active) return;
    const active = this.active;
    this.active = undefined;
    clearTimeout(active.timer);
    const response = this.responses.find(
      (item) => item.requestId === active.id,
    );
    if (response) {
      response.status = reason === "timeout" ? "error" : "cancelled";
      response.endedAt = this.now();
      response.error = {
        code: reason,
        message:
          reason === "timeout"
            ? "Request timed out after the configured deadline. Execution was cancelled; already transmitted data cannot be recalled."
            : "Request cancelled. Already transmitted data cannot be recalled.",
      };
    }
    active.abort.abort();
    this.publish();
  }
  cancel(): void {
    this.finishCancelled("cancelled");
  }
  private expireHistory(): void {
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => this.clear(), 15 * 60000);
  }
  clear(): void {
    this.cancel();
    this.discardReview();
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = undefined;
    this.history = [];
    this.responses = [];
    this.sentImages.clear();
    this.sessionId = randomUUID();
    this.publish();
  }
  captureChanged(capture: SessionSnapshot): void {
    if (this.captureSession !== capture.sessionId) {
      this.captureSession = capture.sessionId;
      this.clear();
    } else if (capture.state === "STOPPED" || capture.state === "ERROR")
      this.discardReview();
  }
  async dispose(): Promise<void> {
    this.clear();
    this.closed = true;
    await Promise.all(this.providers.map((provider) => provider.dispose()));
  }
}
