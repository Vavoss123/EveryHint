import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { ScreenFrame, SessionSnapshot } from "../../shared/contracts";
import type { TranscriptEvent } from "../../shared/transcription";
import {
  DEFAULT_INTELLIGENCE,
  type DetectedQuestion,
  type IntelligenceEvent,
  type IntelligenceEventType,
  type IntelligenceSettings,
  type IntelligenceSnapshot,
  type OperatingMode,
} from "../../shared/intelligence";
import { detectQuestion, normalizeQuestion, similarity } from "./question";
import { ScreenChangeDetector } from "./screen";

export class LocalIntelligence {
  protected snapshot: IntelligenceSnapshot = {
    revision: 0,
    mode: "manual",
    sessionId: null,
    settings: structuredClone(DEFAULT_INTELLIGENCE),
    questions: [],
    suggestions: [],
    events: [],
    screen: null,
    live: null,
    liveContext: null,
    localResult: null,
    status:
      "Manual Assist; local automatic analysis and remote automation are off.",
    diagnostics: {
      analysedTranscripts: 0,
      duplicateQuestions: 0,
      unchangedFrames: 0,
      sampledFrames: 0,
      screenChanges: 0,
      detectionMs: 0,
      screenMs: 0,
      suggestionsCreated: 0,
      automaticAttempts: 0,
      automaticCompletions: 0,
      suppressedRequests: 0,
      queueDepth: 0,
      responseLatencyMs: null,
    },
  };
  protected capture: SessionSnapshot | null = null;
  protected recent: TranscriptEvent[] = [];
  private seen = new Map<string, number>();
  private screenFrameAt = -1;
  private sourceId: string | null = null;
  private screenDetector = new ScreenChangeDetector();
  private activatedAt = 0;
  constructor(
    protected readonly changed: (value: IntelligenceSnapshot) => void,
    protected readonly now: () => number = Date.now,
    private readonly sample: (frame: ScreenFrame) => Uint8Array = () => {
      throw new Error("Local screen sampler is unavailable.");
    },
  ) {}
  get value(): IntelligenceSnapshot {
    this.trim();
    return structuredClone(this.snapshot);
  }
  protected publish(): void {
    this.trim();
    this.snapshot.revision++;
    this.changed(this.value);
  }
  protected event(
    type: IntelligenceEventType,
    text: string,
    source?: IntelligenceEvent["source"],
    referenceId?: string,
  ): void {
    if (!this.snapshot.sessionId) return;
    this.snapshot.events.push({
      id: randomUUID(),
      sessionId: this.snapshot.sessionId,
      type,
      text: text.slice(0, 600),
      at: this.now(),
      ...(source ? { source } : {}),
      ...(referenceId ? { referenceId } : {}),
    });
  }
  protected trim(): void {
    const cutoff = this.now() - this.snapshot.settings.retentionMinutes * 60000;
    this.snapshot.events = this.snapshot.events
      .filter((event) => event.at >= cutoff)
      .slice(-100);
    this.snapshot.questions = this.snapshot.questions
      .filter((question) => question.expiresAt > this.now())
      .sort((a, b) => a.at - b.at)
      .slice(-20);
    this.recent = this.recent
      .filter((event) => event.endMs >= cutoff)
      .slice(-100);
    let chars = this.recent.reduce((sum, event) => sum + event.text.length, 0);
    while (chars > 12000) chars -= this.recent.shift()!.text.length;
    for (const [id, at] of this.seen) if (at < cutoff) this.seen.delete(id);
    while (this.seen.size > 2000)
      this.seen.delete(this.seen.keys().next().value!);
  }
  protected resetContext(): void {
    this.seen.clear();
    this.recent = [];
    this.snapshot.questions = [];
    this.snapshot.events = [];
    this.snapshot.suggestions = [];
    this.snapshot.screen = null;
    this.snapshot.localResult = null;
    this.screenFrameAt = -1;
    this.sourceId = null;
    this.screenDetector.reset();
  }
  configure(settings: IntelligenceSettings): void {
    this.snapshot.settings = structuredClone(settings);
    this.activatedAt = this.now();
    this.resetContext();
    this.publish();
  }
  setMode(mode: OperatingMode): void {
    this.snapshot.mode = mode;
    this.activatedAt = this.now();
    this.resetContext();
    this.snapshot.status =
      mode === "manual"
        ? "Manual Assist; local automatic analysis and remote automation are off."
        : mode === "live"
          ? "Live Assist needs a separate authorisation before automatic requests."
          : "Auto-Hint; selected context is analysed locally. Suggestions require review and approval.";
    // Existing transcripts are not replayed after a mode transition.
    this.publish();
  }
  protected eligibleCapture(): boolean {
    return (
      this.capture?.state === "ACTIVE" &&
      Boolean(this.capture.sessionId && this.capture.consent?.acknowledged) &&
      !(
        this.capture.source &&
        this.snapshot.settings.excludedSourceIds.includes(
          this.capture.source.id,
        )
      )
    );
  }
  update(capture: SessionSnapshot, events: readonly TranscriptEvent[]): void {
    const stateChanged = this.capture?.state !== capture.state;
    const boundary = this.snapshot.sessionId !== capture.sessionId;
    const epochChanged =
      this.capture !== null && this.capture.epoch !== capture.epoch;
    this.capture = { ...capture, frame: null };
    if (boundary) {
      this.resetContext();
      this.snapshot.sessionId = capture.sessionId;
    }
    if (capture.state !== "ACTIVE") {
      if (this.snapshot.screen) this.snapshot.screen = null;
      if (boundary || stateChanged || epochChanged) this.publish();
      return;
    }
    const previousSource = this.sourceId;
    this.sourceId = capture.source?.id ?? null;
    if (previousSource !== this.sourceId || epochChanged) {
      this.screenDetector.reset();
      this.screenFrameAt = -1;
      this.snapshot.screen = null;
    }
    if (this.snapshot.mode === "manual" || !this.eligibleCapture()) {
      for (const event of events)
        if (event.state === "final") this.seen.set(event.id, event.endMs);
      if (boundary) this.publish();
      return;
    }
    const start = performance.now();
    const fresh = events
      .filter(
        (event) =>
          event.state === "final" &&
          event.sessionId === capture.sessionId &&
          this.snapshot.settings.sources[event.source] &&
          capture.consent?.[event.source] &&
          Number.isFinite(event.startMs) &&
          Number.isFinite(event.endMs) &&
          event.startMs <= event.endMs &&
          event.endMs >= this.activatedAt &&
          event.endMs <= this.now() + 1000 &&
          event.startMs >=
            this.now() - this.snapshot.settings.retentionMinutes * 60000 &&
          !this.seen.has(event.id),
      )
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    for (const event of fresh) {
      this.seen.set(event.id, event.endMs);
      const bounded = { ...event, text: event.text.slice(0, 8000) };
      this.recent.push(bounded);
      this.snapshot.diagnostics.analysedTranscripts++;
      const context = this.recent
        .filter(
          (other) =>
            other.id !== event.id &&
            Math.abs(event.endMs - other.endMs) <= 30000,
        )
        .slice(-6)
        .map((other) => other.text)
        .join(" ")
        .slice(-3000);
      const detected = detectQuestion(bounded.text, context);
      if (detected) {
        const duplicate = this.snapshot.questions.some(
          (question) =>
            question.at >= event.endMs - 120000 &&
            (normalizeQuestion(question.text) ===
              normalizeQuestion(detected.text) ||
              similarity(question.text, detected.text) >= 0.88),
        );
        if (duplicate) {
          this.snapshot.diagnostics.duplicateQuestions++;
          continue;
        }
        const screen =
          capture.consent?.screen &&
          this.snapshot.settings.sources.screen &&
          capture.frame &&
          capture.source &&
          Math.abs(event.endMs - capture.frame.capturedAt) <= 30000
            ? {
                sourceId: capture.source.id,
                name: capture.source.name,
                capturedAt: capture.frame.capturedAt,
              }
            : null;
        const question: DetectedQuestion = {
          id: randomUUID(),
          sessionId: capture.sessionId!,
          transcriptId: event.id,
          source: event.source,
          text: detected.text,
          at: event.endMs,
          expiresAt: Math.min(
            this.now() + 90000,
            event.endMs + this.snapshot.settings.retentionMinutes * 60000,
          ),
          confidence: detected.confidence,
          relevance: detected.relevance,
          automaticEligible:
            detected.automaticEligible &&
            detected.confidence >= this.snapshot.settings.confidenceThreshold,
          reason: detected.reason,
          screen,
          contextIds: this.recent
            .filter((other) => Math.abs(event.endMs - other.endMs) <= 30000)
            .slice(-12)
            .map((other) => other.id),
        };
        this.snapshot.questions.push(question);
        this.event(
          "QuestionDetected",
          question.text,
          event.source,
          question.id,
        );
      } else if (
        /\b(?:error|exception|traceback|stuck|help|compare|summari[sz]e|recap)\b/i.test(
          bounded.text,
        )
      )
        this.event("KeywordDetected", bounded.text, event.source, event.id);
      this.event(
        "ContextUpdated",
        `Final ${event.source === "microphone" ? "microphone" : "system-audio"} excerpt available`,
        event.source,
        event.id,
      );
    }
    this.snapshot.diagnostics.detectionMs = performance.now() - start;
    let screenProcessed = false;
    if (
      capture.frame &&
      capture.source &&
      capture.consent?.screen &&
      this.snapshot.settings.sources.screen &&
      capture.frame.capturedAt !== this.screenFrameAt &&
      capture.frame.capturedAt <= this.now() + 1000 &&
      this.now() - capture.frame.capturedAt <= 10000
    ) {
      screenProcessed = true;
      this.screenFrameAt = capture.frame.capturedAt;
      const started = performance.now();
      try {
        const result = this.screenDetector.observe(capture.frame, () =>
          this.sample(capture.frame!),
        );
        if (result.sampled) this.snapshot.diagnostics.sampledFrames++;
        if (result.unchanged) this.snapshot.diagnostics.unchangedFrames++;
        const prior = this.snapshot.screen;
        this.snapshot.screen = {
          sourceId: capture.source.id,
          name: capture.source.name,
          capturedAt: capture.frame.capturedAt,
          changedAt: result.changed
            ? capture.frame.capturedAt
            : (prior?.changedAt ?? null),
          difference: result.difference,
        };
        if (result.changed) {
          this.snapshot.diagnostics.screenChanges++;
          this.event(
            "ScreenChanged",
            "Meaningful stable visual change; content has not been classified as a question.",
            "screen",
            capture.source.id,
          );
        }
      } catch {
        this.snapshot.status =
          "Local screen-change analysis is unavailable. No screen-driven request was made.";
      }
      this.snapshot.diagnostics.screenMs = performance.now() - started;
    }
    if (fresh.length || screenProcessed || boundary || epochChanged)
      this.publish();
  }
  clear(): void {
    const seen = new Map(this.seen);
    this.activatedAt = this.now();
    this.resetContext();
    this.seen = seen;
    this.publish();
  }
}
