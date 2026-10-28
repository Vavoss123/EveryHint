import { createHash } from "node:crypto";
import type { ScreenFrame, SessionSnapshot } from "../../shared/contracts";
import type { TranscriptEvent } from "../../shared/transcription";
import type {
  ActionOutcome,
  ContextSuggestion,
  IntelligenceSnapshot,
  OperatingMode,
  IntelligenceSettings,
  LiveContext,
} from "../../shared/intelligence";
import { dynamicAction } from "../../shared/actions";
import { exactKeys, record } from "../../shared/validation";
import { AssistantController } from "../ai/controller";
import type { AssistantSnapshot } from "../../shared/ai";
import { LocalIntelligence } from "./engine";
import { actionReview, parseAction } from "./actions";
import { similarity } from "./question";
import { LiveScheduler } from "./live";

export class IntelligenceController extends LocalIntelligence {
  private known = new Map<string, number>();
  private dismissed = new Map<string, number>();
  private similarDismissals: string[] = [];
  private expiryTimer: ReturnType<typeof setInterval>;
  private assistantSession: string;
  private completed = new Set<string>();
  private reviewedId: string | null = null;
  private publishedContext = "";
  private scheduler: LiveScheduler;
  private closed = false;
  constructor(
    private readonly assistant: AssistantController,
    changed: (value: IntelligenceSnapshot) => void,
    now: () => number = Date.now,
    sample?: (frame: ScreenFrame) => Uint8Array,
    private readonly connection: () => {
      accountId: string | null;
      accountLabel?: string;
      transcribing: boolean;
      modeId?: string;
      modeName?: string;
      knowledgeSources?: { id: string; name: string }[];
      workspaceSources?: LiveContext["workspaceSources"];
    } = () => ({ accountId: null, transcribing: false }),
    monotonic: () => number = () => performance.now(),
  ) {
    super(changed, now, sample);
    this.assistantSession = assistant.value.sessionId;
    this.scheduler = new LiveScheduler(
      {
        assistant,
        context: () => this.currentContext(),
        settings: () => this.snapshot.settings,
        questions: () => this.snapshot.questions,
        mode: () => this.snapshot.mode,
        diagnostics: this.snapshot.diagnostics,
        changed: () => this.publish(),
        status: (message) => {
          this.snapshot.status = message;
        },
        event: (type, text, id) => this.event(type, text, undefined, id),
      },
      now,
      monotonic,
    );
    this.expiryTimer = setInterval(() => this.tick(), 1000);
    this.expiryTimer.unref();
  }
  protected override resetContext(): void {
    super.resetContext();
    this.known?.clear();
    this.dismissed?.clear();
    this.similarDismissals = [];
  }
  protected override publish(): void {
    if (this.closed) return;
    this.rank();
    this.publishedContext = JSON.stringify(this.currentContext());
    super.publish();
  }
  override get value(): IntelligenceSnapshot {
    const value = super.value;
    value.live = this.scheduler?.value ?? null;
    value.liveContext = this.currentContext();
    return value;
  }
  get indicator(): {
    mode: OperatingMode;
    enabled: boolean;
    requests: number;
    limit: number;
    expiresAt: number | null;
  } {
    const grant = this.scheduler?.value;
    return {
      mode: this.snapshot.mode,
      enabled: Boolean(grant),
      requests: grant?.requests ?? 0,
      limit: grant?.requestLimit ?? 0,
      expiresAt: grant?.expiresAt ?? null,
    };
  }
  private currentContext(): LiveContext | null {
    const capture = this.capture,
      connection = this.connection(),
      assistant = this.assistant.routing;
    if (
      !capture?.sessionId ||
      !this.eligibleCapture() ||
      assistant.selected !== "codex" ||
      !connection.accountId ||
      assistant.auth !== "chatgpt" ||
      !assistant.ready ||
      !assistant.model
    )
      return null;
    const sources = this.snapshot.settings.sources;
    return {
      captureSessionId: capture.sessionId,
      ...(connection.workspaceSources
        ? { workspaceSources: connection.workspaceSources }
        : {}),
      ...(connection.modeId
        ? {
            modeId: connection.modeId,
            modeName: connection.modeName,
            knowledgeSources: connection.knowledgeSources ?? [],
          }
        : {}),
      captureEpoch: capture.epoch,
      assistantSessionId: assistant.sessionId,
      accountId: connection.accountId,
      accountLabel: (
        connection.accountLabel ?? "Selected ChatGPT account"
      ).slice(0, 128),
      model: assistant.model,
      sourceId: capture.source?.id ?? null,
      sourceName: capture.source?.name.slice(0, 256) ?? null,
      images: assistant.images,
      transcribing: connection.transcribing,
      available: {
        microphone:
          sources.microphone &&
          Boolean(capture.consent?.microphone) &&
          capture.sources.microphone.state === "CAPTURING" &&
          !capture.sources.microphone.muted,
        systemAudio:
          sources.systemAudio &&
          Boolean(capture.consent?.systemAudio) &&
          capture.sources.systemAudio.state === "CAPTURING",
        screenshot:
          sources.screen &&
          Boolean(capture.consent?.screen && capture.source) &&
          capture.sources.screen.state === "CAPTURING",
      },
    };
  }
  authorise(value: unknown): Promise<void> {
    return this.scheduler.authorise(value);
  }
  revoke(reason: string): void {
    this.scheduler.revoke(reason);
  }
  override configure(settings: IntelligenceSettings): void {
    this.scheduler?.revoke("Intelligence settings changed.");
    super.configure(settings);
  }
  override clear(): void {
    this.scheduler?.revoke("Conversation context was cleared or changed.");
    super.clear();
  }
  private rank(): void {
    const now = this.now();
    for (const [id, at] of this.known) if (at < now) this.known.delete(id);
    for (const [id, at] of this.dismissed)
      if (at < now) this.dismissed.delete(id);
    const previous = this.snapshot.suggestions;
    const candidates: ContextSuggestion[] = [];
    if (this.snapshot.mode !== "manual" && this.eligibleCapture()) {
      const answered = this.assistant.value.responses.filter(
        (response) => response.status === "completed",
      );
      for (const question of this.snapshot.questions) {
        if (!this.assistant.allowsTranscript(question.transcriptId)) {
          question.automaticEligible = false;
          continue;
        }
        if (
          question.expiresAt <= now ||
          this.similarDismissals.some(
            (text) => similarity(text, question.text) >= 0.7,
          ) ||
          answered.some(
            (response) => similarity(response.question, question.text) >= 0.88,
          )
        )
          continue;
        const action = dynamicAction(question.text);
        const id = createHash("sha256")
          .update(`${question.id}:${action}`)
          .digest("hex");
        if (this.dismissed.has(id)) continue;
        const freshness = Math.max(0, 1 - (now - question.at) / 90000);
        candidates.push({
          id,
          sessionId: question.sessionId,
          questionId: question.id,
          action,
          text: question.text,
          at: question.at,
          expiresAt: question.expiresAt,
          score:
            question.confidence * 0.4 +
            question.relevance * 0.35 +
            freshness * 0.2 +
            (question.screen ? 0.05 : 0),
          source: question.source,
        });
      }
      const screen = this.snapshot.events
        .filter(
          (event) => event.type === "ScreenChanged" && event.at >= now - 30000,
        )
        .at(-1);
      if (
        screen &&
        !this.dismissed.has(screen.id) &&
        !this.similarDismissals.includes(
          "Help me understand the selected current screen.",
        )
      )
        candidates.push({
          id: screen.id,
          sessionId: screen.sessionId,
          questionId: null,
          action: "get-answer",
          text: "Help me understand the selected current screen.",
          at: screen.at,
          expiresAt: screen.at + 30000,
          score: 0.4,
          source: "screen",
        });
      const keyword = this.snapshot.events
        .filter(
          (event) =>
            event.type === "KeywordDetected" && event.at >= now - 30000,
        )
        .at(-1);
      if (
        keyword &&
        this.assistant.allowsTranscript(keyword.referenceId ?? "") &&
        !this.dismissed.has(keyword.id) &&
        !this.similarDismissals.some(
          (text) => similarity(text, keyword.text) >= 0.7,
        )
      )
        candidates.push({
          id: keyword.id,
          sessionId: keyword.sessionId,
          questionId: null,
          action: dynamicAction(keyword.text),
          text: keyword.text,
          at: keyword.at,
          expiresAt: keyword.at + 30000,
          score: 0.35,
          source:
            keyword.source === "microphone" ? "microphone" : "systemAudio",
        });
    }
    this.snapshot.suggestions = candidates
      .filter((candidate) => this.assistant.allowsAction(candidate.action))
      .sort(
        (a, b) => b.score - a.score || b.at - a.at || a.id.localeCompare(b.id),
      )
      .slice(0, 3);
    for (const item of previous)
      if (item.expiresAt <= now)
        this.event("SuggestionExpired", item.text, item.source, item.id);
    for (const item of this.snapshot.suggestions)
      if (!this.known.has(item.id)) {
        this.known.set(item.id, item.expiresAt);
        this.snapshot.diagnostics.suggestionsCreated++;
        this.event("SuggestionCreated", item.text, item.source, item.id);
      }
    while (this.known.size > 200)
      this.known.delete(this.known.keys().next().value!);
  }
  mode(value: unknown): void {
    if (value !== "manual" && value !== "auto-hint" && value !== "live")
      throw new Error("Choose Manual, Auto-Hint or Live Assist.");
    this.scheduler.revoke("Operating mode changed.");
    this.setMode(value as OperatingMode);
  }
  dismiss(value: unknown): void {
    const input = record(value);
    exactKeys(input, ["id", "similar"]);
    if (typeof input.id !== "string" || typeof input.similar !== "boolean")
      throw new Error("Invalid suggestion dismissal.");
    const suggestion = this.value.suggestions.find(
      (item) => item.id === input.id,
    );
    if (!suggestion) throw new Error("This suggestion expired.");
    this.dismissed.set(suggestion.id, suggestion.expiresAt);
    while (this.dismissed.size > 200)
      this.dismissed.delete(this.dismissed.keys().next().value!);
    if (input.similar) {
      this.similarDismissals.push(suggestion.text);
      this.similarDismissals = this.similarDismissals.slice(-50);
    }
    this.event(
      "SuggestionDismissed",
      suggestion.text,
      suggestion.source,
      suggestion.id,
    );
    this.publish();
  }
  async action(value: unknown): Promise<ActionOutcome> {
    const input = parseAction(value);
    if (!this.assistant.allowsAction(input.action))
      throw new Error("This action is disabled in the active AI mode.");
    this.scheduler.revoke("A reviewed contextual action was chosen.");
    const suggestion = input.suggestionId
      ? this.value.suggestions.find((item) => item.id === input.suggestionId)
      : undefined;
    if (input.suggestionId && !suggestion)
      throw new Error("This suggestion expired. Choose current context.");
    if (suggestion?.source === "screen" && !input.options.screenshot)
      throw new Error("Select screenshot to review this screen suggestion.");
    if (
      suggestion &&
      suggestion.source !== "screen" &&
      !input.options[suggestion.source]
    )
      throw new Error(
        "Select the suggestion's transcript source before reviewing it.",
      );
    const question = suggestion?.questionId
      ? this.snapshot.questions.find(
          (item) => item.id === suggestion.questionId,
        )
      : undefined;
    if (question && !this.assistant.allowsTranscript(question.transcriptId))
      throw new Error(
        "This question was excluded from shared context. Type your own question to prepare a new review.",
      );
    const prepared = actionReview(
      { ...input, question: input.question || suggestion?.text },
      question,
    );
    if (prepared.local) {
      this.snapshot.localResult = {
        action: input.action,
        text: prepared.local,
      };
      this.publish();
      return { type: "local", action: input.action, text: prepared.local };
    }
    await this.assistant.prepare(prepared.review!);
    const review = this.assistant.value.review;
    if (!review) throw new Error("Context review was cancelled.");
    if (
      prepared.requireContext &&
      !review.transcripts.length &&
      !review.history.length &&
      !review.screenshot
    ) {
      this.assistant.discardReview();
      throw new Error(
        "This action requires selected retained conversation or screen context. No earlier session context is assumed.",
      );
    }
    this.snapshot.localResult = null;
    this.event(
      "AssistRequested",
      `Prepared ${review.action}; user review and acknowledgement required`,
      undefined,
      review.requestId,
    );
    this.publish();
    return {
      type: "review",
      reviewId: review.requestId,
      action: review.action!,
    };
  }
  override update(
    capture: SessionSnapshot,
    events: readonly TranscriptEvent[],
  ): void {
    const grant = this.scheduler?.value;
    if (
      grant &&
      (capture.state !== "ACTIVE" ||
        capture.sessionId !== grant.captureSessionId ||
        capture.epoch !== grant.captureEpoch ||
        (capture.source?.id ?? null) !== grant.sourceId)
    )
      this.scheduler.revoke(
        "Capture was paused, stopped, changed or lost permission.",
      );
    super.update(capture, events);
    this.scheduler?.tick();
    // Source startup and Whisper readiness can change without any transcript.
    // Publish that permission preview so consent never depends on speaking first.
    if (this.publishedContext !== JSON.stringify(this.currentContext()))
      this.publish();
  }
  assistantChanged(value: AssistantSnapshot): void {
    this.scheduler?.assistantChanged(value);
    const reviewChanged = (value.review?.requestId ?? null) !== this.reviewedId;
    this.reviewedId = value.review?.requestId ?? null;
    if (value.sessionId !== this.assistantSession) {
      this.assistantSession = value.sessionId;
      this.completed.clear();
      this.clear();
      return;
    }
    const response = value.responses.at(-1);
    if (
      response?.status === "completed" &&
      !this.completed.has(response.requestId)
    ) {
      this.completed.add(response.requestId);
      while (this.completed.size > 32)
        this.completed.delete(this.completed.values().next().value!);
      this.event(
        "AssistCompleted",
        `${response.automatic ? "Automatic" : "Reviewed"} ${response.action ?? "get-answer"} completed`,
        undefined,
        response.requestId,
      );
      this.publish();
    } else if (
      reviewChanged ||
      this.publishedContext !== JSON.stringify(this.currentContext())
    )
      this.publish();
  }
  tick(): void {
    if (this.closed) return;
    this.scheduler?.tick();
    const now = this.now(),
      cutoff = now - this.snapshot.settings.retentionMinutes * 60000;
    if (
      this.snapshot.suggestions.some((item) => item.expiresAt <= now) ||
      this.snapshot.questions.some((item) => item.expiresAt <= now) ||
      this.snapshot.events.some((event) => event.at < cutoff) ||
      this.publishedContext !== JSON.stringify(this.currentContext())
    )
      this.publish();
  }
  dispose(): void {
    this.closed = true;
    this.scheduler?.dispose();
    clearInterval(this.expiryTimer);
    this.resetContext();
  }
}
