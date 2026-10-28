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
import {
  buildReview,
  contextPrompt,
  imageHash,
  validateScreenshot,
} from "./context";
import { providerError, ProviderError } from "./errors";
import type { MeetingAIContext } from "../../shared/meeting-ai";

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
  private excludedTranscripts = new Set<string>();
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
  private preparation = 0;
  private referenceGuard:
    { requestId: string; valid: () => boolean } | undefined;
  constructor(
    private readonly providers: readonly AIProvider[],
    private readonly sources: () => {
      capture: SessionSnapshot;
      events: readonly TranscriptEvent[];
    },
    private readonly changed: (value: AssistantSnapshot) => void,
    private readonly timeoutMs = 90000,
    private readonly now: () => number = Date.now,
    private readonly freshCapture?: () => Promise<SessionSnapshot>,
    private readonly modeContext?: () => import("../../shared/personal").ModeContext,
    private readonly retrieveKnowledge?: (
      query: string,
      ids: string[],
    ) => Promise<{
      excerpts: import("../../shared/knowledge").KnowledgeExcerpt[];
      valid: () => boolean;
    }>,
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
  allowsTranscript(id: string): boolean {
    return !this.excludedTranscripts.has(id);
  }
  allowsAction(
    action: import("../../shared/intelligence").ContextualAction,
  ): boolean {
    return this.modeContext?.().mode.actions.includes(action) ?? true;
  }
  get routing(): {
    sessionId: string;
    selected: ProviderId;
    auth: ProviderStatus["auth"];
    ready: boolean;
    model: string | null;
    images: boolean;
  } {
    const status = this.statuses.find((item) => item.id === this.selected)!;
    return {
      sessionId: this.sessionId,
      selected: this.selected,
      auth: status.auth,
      ready: status.ready,
      model: status.selectedModel ?? null,
      images: status.capabilities.images,
    };
  }
  requestState(id: string): AIResponse["status"] | undefined {
    return this.responses.find((response) => response.requestId === id)?.status;
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
  prepare(
    value: unknown,
    automatic = false,
    reference?: { context: MeetingAIContext; valid: () => boolean },
    automaticKnowledgeIds?: string[],
  ): void | Promise<void> {
    if (this.closed) throw new Error("Assistant is shutting down.");
    if (this.active)
      throw new Error("Cancel the active request before reviewing another.");
    if (automatic && this.review)
      throw new Error(
        "A manual review is pending. Automatic preparation is unavailable.",
      );
    const input = parseReview(value);
    const modeContext = this.modeContext?.();
    if (automatic && input.knowledgeIds?.length)
      throw new Error(
        "Automatic knowledge must come from the scoped Live grant.",
      );
    const knowledgeIds = automatic
      ? (automaticKnowledgeIds ?? [])
      : (input.knowledgeIds ?? []);
    if (
      knowledgeIds.length &&
      (!this.retrieveKnowledge ||
        !modeContext ||
        knowledgeIds.some((id) => !modeContext.mode.knowledgeIds.includes(id)))
    )
      throw new Error(
        "Knowledge must belong to the active mode and current profile.",
      );
    let knowledge:
      | {
          excerpts: import("../../shared/knowledge").KnowledgeExcerpt[];
          valid: () => boolean;
        }
      | undefined;
    if (modeContext) {
      if (
        !modeContext.mode.actions.includes(input.action ?? "get-answer") &&
        !reference
      )
        throw new Error(
          "This contextual action is disabled in the active AI mode.",
        );
      for (const key of [
        "screenshot",
        "microphone",
        "systemAudio",
        "history",
      ] as const)
        input.options[key] =
          input.options[key] && modeContext.mode.context[key];
    }
    if (
      reference &&
      (this.selected !== "codex" ||
        input.options.screenshot ||
        input.options.microphone ||
        input.options.systemAudio ||
        input.options.history)
    )
      throw new Error(
        "Meeting AI uses only selected meeting text through ChatGPT plan inference.",
      );
    const status = this.statuses.find((status) => status.id === this.selected)!;
    if (input.options.screenshot && !status.capabilities.images)
      throw new Error(
        "This provider cannot accept screenshots through the current restricted integration.",
      );
    let history = this.history;
    if (input.regenerateId) {
      const previous = this.responses.at(-1);
      if (
        !previous ||
        previous.requestId !== input.regenerateId ||
        previous.question !== input.question
      )
        throw new Error(
          "Only the latest response in this conversation can be regenerated.",
        );
      history = history.filter((turn) => turn.requestId !== input.regenerateId);
    }
    this.discardReview();
    const generation = this.preparation;
    const finish = (capture: SessionSnapshot): void => {
      if (generation !== this.preparation || this.closed || this.active)
        throw new Error("Assist preparation was cancelled. Get Answer again.");
      const { events } = this.sources();
      const review = buildReview(
        input,
        this.selected,
        this.sessionId,
        capture,
        events.filter(
          (event) =>
            !this.excludedTranscripts.has(event.id) &&
            (!input.transcriptIds || input.transcriptIds.includes(event.id)),
        ),
        history,
        this.now(),
      );
      if (status.selectedModel) review.model = status.selectedModel;
      if (modeContext) {
        review.modeContext = modeContext;
        review.prompt = contextPrompt(review);
        review.textChars = review.prompt.length;
        if (review.textChars > input.options.totalChars)
          throw new Error(
            "Mode instructions exceed the selected context budget. Shorten instructions or select less context.",
          );
      }
      if (input.regenerateId) review.replacesRequestId = input.regenerateId;
      if (automatic) review.automatic = true;
      if (reference) {
        if (!reference.valid())
          throw new Error(
            "The selected meeting context changed. Review it again.",
          );
        review.meetingContext = structuredClone(reference.context);
        review.notices.push(...reference.context.notices);
        review.prompt = contextPrompt(review);
        review.textChars = review.prompt.length;
        if (review.textChars > 20000)
          throw new Error(
            "Selected meeting context exceeds 20,000 serialized characters. Select fewer excerpts.",
          );
        this.referenceGuard = {
          requestId: review.requestId,
          valid: reference.valid,
        };
      }
      if (
        review.screenshot &&
        this.sentImages.has(imageHash(review.screenshot.dataUrl))
      )
        if (automatic) {
          review.screenshot = null;
          review.imageBytes = 0;
          delete review.sourceName;
          review.notices.push(
            "Unchanged image already submitted; image omitted. Only the selected text/history is shared in this request.",
          );
          review.prompt = contextPrompt(review);
          review.textChars = review.prompt.length;
        } else
          throw new Error(
            "This unchanged screenshot was already submitted. Uncheck screenshot or capture an updated image.",
          );
      if (knowledge) {
        if (!knowledge.valid())
          throw new Error(
            "Knowledge changed during preparation. Review again.",
          );
        review.knowledge = structuredClone(knowledge.excerpts);
        review.notices.push(
          review.knowledge.length
            ? "Only the displayed knowledge excerpts will be shared. Citations indicate supplied references, not independently verified claim support."
            : "No sufficiently relevant authorised knowledge excerpt was found.",
        );
        const referenceValid = this.referenceGuard?.valid;
        const knowledgeValid = knowledge.valid;
        this.referenceGuard = {
          requestId: review.requestId,
          valid: () =>
            knowledgeValid() && (!referenceValid || referenceValid()),
        };
        review.prompt = contextPrompt(review);
        review.textChars = review.prompt.length;
        if (review.textChars > input.options.totalChars)
          throw new Error(
            "Knowledge and mode context exceed the selected total text limit. Select less context or increase the limit.",
          );
      }
      this.review = review;
      this.reviewTimer = setTimeout(
        () => this.discardReview(),
        Math.max(0, review.expiresAt - this.now()),
      );
      if (!automatic) this.publish();
    };
    const captureAndFinish = () => {
      if (input.options.screenshot && this.freshCapture)
        return this.freshCapture().then(finish);
      finish(this.sources().capture);
    };
    if (knowledgeIds.length)
      return this.retrieveKnowledge!(input.question, knowledgeIds).then(
        (result) => {
          knowledge = result;
          return captureAndFinish();
        },
      );
    return captureAndFinish();
  }
  discardReview(): void {
    this.referenceGuard = undefined;
    this.preparation++;
    if (this.reviewTimer) clearTimeout(this.reviewTimer);
    this.reviewTimer = undefined;
    if (this.review) {
      this.review = null;
      this.publish();
    }
  }
  removeContext(value: unknown): void {
    const input = record(value);
    exactKeys(input, ["reviewId", "kind", "index"]);
    const review = this.review;
    if (
      !review ||
      review.requestId !== input.reviewId ||
      review.expiresAt <= this.now()
    )
      throw new Error(
        "Review the selected context again before removing an item.",
      );
    if (input.kind === "screenshot" && input.index === 0) {
      review.screenshot = null;
      review.imageBytes = 0;
      delete review.sourceName;
    } else if (
      (input.kind === "transcripts" || input.kind === "history") &&
      Number.isInteger(input.index) &&
      (input.index as number) >= 0 &&
      (input.index as number) < review[input.kind].length
    ) {
      if (input.kind === "transcripts") {
        const id = review.transcripts[input.index as number]!.id;
        if (this.excludedTranscripts.size >= 5000)
          throw new Error("Clear conversation before removing more context.");
        if (id) this.excludedTranscripts.add(id);
      } else {
        const removed = review.history[input.index as number]!;
        this.history = this.history.filter(
          (turn) => turn.requestId !== removed.requestId,
        );
      }
      review[input.kind].splice(input.index as number, 1);
    } else throw new Error("Choose a context item in this review.");
    if (
      !review.question &&
      !review.screenshot &&
      !review.transcripts.length &&
      !review.history.length
    ) {
      this.discardReview();
      return;
    }
    const guard = this.referenceGuard;
    const previousId = review.requestId;
    review.requestId = randomUUID();
    if (!review.meetingContext && guard?.requestId === previousId)
      this.referenceGuard = { ...guard, requestId: review.requestId };
    review.prompt = contextPrompt(review);
    review.textChars = review.prompt.length;
    this.publish();
  }
  async ask(value: unknown, canSend?: () => boolean): Promise<void> {
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
    if (Boolean(request.automatic) !== Boolean(canSend))
      throw new Error(
        "Automatic reviews belong to Live Assist. Prepare a manual review to send manually.",
      );
    const referenceGuard =
      this.referenceGuard?.requestId === request.requestId
        ? this.referenceGuard.valid
        : undefined;
    const permission =
      canSend && referenceGuard
        ? () => canSend() && referenceGuard()
        : (canSend ?? referenceGuard);
    if (request.meetingContext && !referenceGuard)
      throw new Error(
        "Meeting context must be prepared through its selected profile review.",
      );
    if (request.knowledge?.length && !referenceGuard)
      throw new Error(
        "Knowledge must be prepared through a current local-source review.",
      );
    if (permission && !permission())
      throw new Error(
        "Live Assist permission expired or changed before transmission.",
      );
    if (request.screenshot)
      validateScreenshot(request.screenshot, this.now(), 120000);
    const abort = new AbortController();
    const response: AIResponse = {
      ...(request.knowledge?.length
        ? { knowledge: structuredClone(request.knowledge) }
        : {}),
      ...(request.modeContext
        ? { modeName: request.modeContext.mode.name }
        : {}),
      requestId: request.requestId,
      sessionId: this.sessionId,
      provider: request.provider,
      question: request.question,
      ...(request.meetingContext
        ? { meetingPurpose: request.meetingContext.purpose }
        : {}),
      ...(request.automatic
        ? { automatic: true, contextNotices: request.notices.slice(0, 8) }
        : {}),
      ...(request.action ? { action: request.action } : {}),
      preset: request.preset,
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
        if (permission && !permission())
          throw new ProviderError(
            "cancelled",
            "Live Assist permission expired or changed before transmission.",
          );
        const stream = permission
          ? provider.respond(request, abort.signal, permission)
          : provider.respond(request, abort.signal);
        for await (const event of stream) {
          if (!this.current(response)) break;
          if (permission && !permission())
            throw new ProviderError(
              "cancelled",
              "Live Assist permission expired or changed during the response.",
            );
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
            if (request.replacesRequestId)
              this.history = this.history.filter(
                (turn) => turn.requestId !== request.replacesRequestId,
              );
            if (!request.meetingContext)
              this.history.push({
                requestId: request.requestId,
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
    this.excludedTranscripts.clear();
    this.sessionId = randomUUID();
    this.publish();
  }
  captureChanged(capture: SessionSnapshot): void {
    if (capture.state !== "ACTIVE") this.preparation++;
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
