import { randomUUID } from "node:crypto";
import type { AssistantSnapshot } from "../../shared/ai";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import type {
  DetectedQuestion,
  IntelligenceDiagnostics,
  IntelligenceEventType,
  IntelligenceSettings,
  LiveAuthorisation,
  LiveContext,
  OperatingMode,
} from "../../shared/intelligence";
import { exactKeys, record } from "../../shared/validation";
import { AssistantController } from "../ai/controller";
import { actionReview } from "./actions";
import { normalizeQuestion, similarity } from "./question";

interface LivePorts {
  assistant: AssistantController;
  context: () => LiveContext | null;
  settings: () => IntelligenceSettings;
  questions: () => readonly DetectedQuestion[];
  mode: () => OperatingMode;
  diagnostics: IntelligenceDiagnostics;
  changed: () => void;
  status: (message: string) => void;
  event: (
    type: IntelligenceEventType,
    text: string,
    referenceId?: string,
  ) => void;
}
export class LiveScheduler {
  private grant: LiveAuthorisation | null = null;
  private generation = 0;
  private authorising = false;
  private deadline = 0;
  private nextMonotonicRequestAt = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private slot: {
    grantId: string;
    question: DetectedQuestion;
    requestId: string | null;
  } | null = null;
  private sent: string[] = [];
  private preexisting = new Set<string>();
  private suppressed = new Set<string>();
  private lastPublishedSecond = -1;
  constructor(
    private readonly ports: LivePorts,
    private readonly now: () => number = Date.now,
    private readonly monotonic: () => number = () => performance.now(),
  ) {}
  get value(): LiveAuthorisation | null {
    return this.grant ? structuredClone(this.grant) : null;
  }
  async authorise(value: unknown): Promise<void> {
    const input = record(value);
    exactKeys(input, ["acknowledged", "expected", "sharing", "limits"]);
    if (input.acknowledged !== true)
      throw new Error(
        "Explicitly acknowledge the separate Live Assist remote-sharing permission.",
      );
    if (this.ports.mode() !== "live")
      throw new Error(
        "Select Live Assist before authorising automatic requests.",
      );
    if (this.grant || this.slot || this.authorising)
      throw new Error(
        "Pause the current Live authorisation before starting another.",
      );
    const sharing = record(input.sharing);
    exactKeys(sharing, [
      "microphone",
      "systemAudio",
      "screenshot",
      "history",
      "knowledge",
    ]);
    let knowledge:
      { enabled: boolean; remote: boolean; ids: string[] } | undefined;
    if (sharing.knowledge !== undefined) {
      const inputKnowledge = record(sharing.knowledge);
      exactKeys(inputKnowledge, ["enabled", "remote", "ids"]);
      if (
        typeof inputKnowledge.enabled !== "boolean" ||
        typeof inputKnowledge.remote !== "boolean" ||
        !Array.isArray(inputKnowledge.ids) ||
        inputKnowledge.ids.length > 10 ||
        inputKnowledge.ids.some(
          (id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id),
        )
      )
        throw new Error(
          "Choose bounded Live knowledge sources and sharing permission.",
        );
      knowledge = inputKnowledge as unknown as typeof knowledge;
      if (knowledge!.enabled && (!knowledge!.remote || !knowledge!.ids.length))
        throw new Error(
          "Live knowledge requires explicitly selected documents and separate remote-sharing permission.",
        );
    }
    for (const key of ["microphone", "systemAudio", "screenshot", "history"])
      if (typeof sharing[key] !== "boolean")
        throw new Error("Choose each remote-sharing source explicitly.");
    if (!sharing.microphone && !sharing.systemAudio)
      throw new Error(
        "Live Assist requires at least one selected final transcript source. A screen change alone never triggers inference.",
      );
    const expected = record(input.expected);
    exactKeys(expected, [
      "captureSessionId",
      "accountLabel",
      "captureEpoch",
      "assistantSessionId",
      "accountId",
      "model",
      "sourceId",
      "sourceName",
      "images",
      "transcribing",
      "available",
      "modeId",
      "modeName",
      "knowledgeSources",
    ]);
    for (const key of [
      "captureSessionId",
      "accountLabel",
      "assistantSessionId",
      "accountId",
      "model",
    ])
      if (
        typeof expected[key] !== "string" ||
        (expected[key] as string).length > 128
      )
        throw new Error("Invalid Live Assist account/model/session preview.");
    if (
      expected.sourceId !== null &&
      (typeof expected.sourceId !== "string" || expected.sourceId.length > 128)
    )
      throw new Error("Invalid screen source preview.");
    if (
      expected.sourceName !== null &&
      (typeof expected.sourceName !== "string" ||
        expected.sourceName.length > 256)
    )
      throw new Error("Invalid screen source name.");
    const limits = record(input.limits);
    if (
      !Number.isSafeInteger(expected.captureEpoch) ||
      (expected.captureEpoch as number) < 0 ||
      typeof expected.images !== "boolean" ||
      typeof expected.transcribing !== "boolean"
    )
      throw new Error("Invalid Live capture/model preview.");
    const available = record(expected.available);
    exactKeys(available, ["microphone", "systemAudio", "screenshot"]);
    for (const key of ["microphone", "systemAudio", "screenshot"])
      if (typeof available[key] !== "boolean")
        throw new Error("Invalid Live source preview.");
    exactKeys(limits, ["sessionMinutes", "cooldownSeconds", "requestLimit"]);
    const settings = this.ports.settings();
    for (const key of [
      "sessionMinutes",
      "cooldownSeconds",
      "requestLimit",
    ] as const)
      if (limits[key] !== settings[key])
        throw new Error(
          "Live Assist limits changed. Review the current permission again.",
        );
    const active = this.ports.assistant.value;
    if (
      active.review ||
      active.responses.some(
        (response) =>
          response.status === "sending" || response.status === "generating",
      )
    )
      throw new Error(
        "Finish or clear the current manual review/request before authorising Live Assist.",
      );
    const generation = ++this.generation;
    this.authorising = true;
    try {
      await this.ports.assistant.inspect();
      if (generation !== this.generation || this.ports.mode() !== "live")
        throw new Error("Live Assist authorisation was cancelled.");
      const context = this.ports.context();
      if (!context)
        throw new Error(
          "Live Assist requires active authorised capture, a connected ChatGPT plan and a selected available model.",
        );
      if (JSON.stringify(expected) !== JSON.stringify(context))
        throw new Error(
          "Capture, account, model or source availability changed. Review the permission again.",
        );
      if (!context.transcribing)
        throw new Error(
          "Enable local speech transcription before authorising Live Assist.",
        );
      if (
        knowledge?.enabled &&
        knowledge.ids.some(
          (id) => !context.knowledgeSources?.some((source) => source.id === id),
        )
      )
        throw new Error(
          "A selected Live knowledge document is unavailable or outside the active mode.",
        );
      for (const source of ["microphone", "systemAudio", "screenshot"] as const)
        if (sharing[source] && !context.available[source])
          throw new Error(
            `The selected ${source} source is not authorised and available for Live sharing.`,
          );
      if (sharing.screenshot && !context.images)
        throw new Error(
          "The selected model cannot accept screenshots. Leave screen sharing off or select an image-capable model.",
        );
      const startedAt = this.now();
      this.deadline = this.monotonic() + settings.sessionMinutes * 60000;
      this.nextMonotonicRequestAt = this.monotonic();
      this.grant = {
        ...(context.modeId ? { modeId: context.modeId } : {}),
        id: randomUUID(),
        captureSessionId: context.captureSessionId,
        captureEpoch: context.captureEpoch,
        assistantSessionId: context.assistantSessionId,
        accountId: context.accountId,
        model: context.model,
        sourceId: context.sourceId,
        sourceName: context.sourceName,
        sharing: {
          ...(knowledge ? { knowledge: structuredClone(knowledge) } : {}),
          microphone: sharing.microphone as boolean,
          systemAudio: sharing.systemAudio as boolean,
          screenshot: sharing.screenshot as boolean,
          history: sharing.history as boolean,
        },
        startedAt,
        expiresAt: startedAt + settings.sessionMinutes * 60000,
        cooldownSeconds: settings.cooldownSeconds,
        requestLimit: settings.requestLimit,
        requests: 0,
        nextRequestAt: startedAt,
        confidenceThreshold: settings.confidenceThreshold,
      };
      this.sent = [];
      this.preexisting = new Set(
        this.ports.questions().map((question) => question.id),
      );
      this.suppressed.clear();
      this.lastPublishedSecond = -1;
      const id = this.grant.id;
      this.expiry = setTimeout(() => {
        if (this.grant?.id === id)
          this.revoke(
            "The authorised session expired; renew explicitly to continue.",
          );
      }, settings.sessionMinutes * 60000);
      this.expiry.unref();
      this.ports.status(
        "Live Assist is authorised for high-confidence final questions from the selected shared sources. Pause stops automatic sharing immediately.",
      );
      this.ports.changed();
    } finally {
      if (generation === this.generation) this.authorising = false;
    }
  }
  private valid(grant: LiveAuthorisation): boolean {
    if (
      this.grant?.id !== grant.id ||
      this.ports.mode() !== "live" ||
      this.now() >= grant.expiresAt ||
      this.now() < grant.startedAt - 1000 ||
      this.monotonic() >= this.deadline
    )
      return false;
    const context = this.ports.context();
    return Boolean(
      context &&
      context.transcribing &&
      context.captureSessionId === grant.captureSessionId &&
      context.captureEpoch === grant.captureEpoch &&
      context.assistantSessionId === grant.assistantSessionId &&
      context.accountId === grant.accountId &&
      context.model === grant.model &&
      context.sourceId === grant.sourceId &&
      context.modeId === grant.modeId &&
      (!grant.sharing.knowledge?.enabled ||
        (grant.sharing.knowledge.remote &&
          grant.sharing.knowledge.ids.every((id) =>
            context.knowledgeSources?.some((source) => source.id === id),
          ))) &&
      (!grant.sharing.microphone || context.available.microphone) &&
      (!grant.sharing.systemAudio || context.available.systemAudio) &&
      (!grant.sharing.screenshot ||
        (context.available.screenshot && context.images)),
    );
  }
  private suppress(question: DetectedQuestion, reason: string): void {
    const id = `${question.id}:${reason}`;
    if (!this.suppressed.has(id)) {
      this.suppressed.add(id);
      this.ports.diagnostics.suppressedRequests++;
      while (this.suppressed.size > 200)
        this.suppressed.delete(this.suppressed.values().next().value!);
    }
  }
  tick(): void {
    const grant = this.grant;
    if (!grant) return;
    if (!this.valid(grant)) {
      this.revoke(
        "Permission, capture, transcription, account, model or expiry changed. Refresh/reselect if needed, then authorise again.",
      );
      return;
    }
    const second = Math.floor(this.now() / 1000);
    if (second !== this.lastPublishedSecond) {
      this.lastPublishedSecond = second;
      this.ports.changed();
    }
    const candidates = this.ports
      .questions()
      .filter((question) => {
        if (
          question.sessionId !== grant.captureSessionId ||
          this.preexisting.has(question.id) ||
          question.at < grant.startedAt ||
          question.at > this.now() ||
          question.expiresAt <= this.now() ||
          this.now() - question.at > 30000
        )
          return false;
        if (
          !question.automaticEligible ||
          question.confidence < grant.confidenceThreshold
        )
          return false;
        if (
          !grant.sharing[question.source] ||
          !this.ports.assistant.allowsTranscript(question.transcriptId)
        ) {
          this.suppress(question, "scope");
          return false;
        }
        if (
          this.sent.some(
            (text) =>
              normalizeQuestion(text) === normalizeQuestion(question.text) ||
              similarity(text, question.text) >= 0.88,
          )
        ) {
          this.suppress(question, "duplicate");
          return false;
        }
        return true;
      })
      .sort((a, b) => b.at - a.at || b.confidence - a.confidence);
    this.ports.diagnostics.queueDepth = candidates.length ? 1 : 0;
    if (this.slot) return;
    if (grant.requests >= grant.requestLimit) {
      this.revoke(
        "The authorised request limit was reached. Renew explicitly for any further automatic requests.",
      );
      return;
    }
    const question = candidates[0];
    if (!question) return;
    if (
      this.now() < grant.nextRequestAt ||
      this.monotonic() < this.nextMonotonicRequestAt
    ) {
      this.suppress(question, "cooldown");
      return;
    }
    const assistant = this.ports.assistant.value;
    if (
      assistant.review ||
      assistant.responses.some(
        (response) =>
          response.status === "sending" || response.status === "generating",
      )
    ) {
      this.suppress(question, "busy");
      return;
    }
    const slot = {
      grantId: grant.id,
      question,
      requestId: null as string | null,
    };
    this.slot = slot;
    grant.requests++;
    grant.nextRequestAt = this.now() + grant.cooldownSeconds * 1000;
    this.nextMonotonicRequestAt =
      this.monotonic() + grant.cooldownSeconds * 1000;
    this.sent.push(question.text);
    this.sent = this.sent.slice(-100);
    this.ports.diagnostics.automaticAttempts++;
    this.ports.diagnostics.queueDepth = 0;
    this.ports.event(
      "AssistRequested",
      "Automatic request reserved within the explicit Live Assist permission",
      question.id,
    );
    this.ports.changed();
    void this.run(grant, slot);
  }
  private async run(
    grant: LiveAuthorisation,
    slot: NonNullable<LiveScheduler["slot"]>,
  ): Promise<void> {
    try {
      await this.ports.assistant.inspect();
      if (this.slot !== slot || !this.valid(grant))
        throw new Error("Scope changed.");
      const options = {
        ...DEFAULT_CONTEXT,
        microphone: grant.sharing.microphone,
        systemAudio: grant.sharing.systemAudio,
        screenshot: grant.sharing.screenshot,
        history: grant.sharing.history,
        recentSeconds: Math.min(
          300,
          this.ports.settings().retentionMinutes * 60,
        ),
      };
      const prepared = actionReview(
        { action: "get-answer", question: slot.question.text, options },
        slot.question,
      );
      await this.ports.assistant.prepare(
        prepared.review!,
        true,
        undefined,
        grant.sharing.knowledge?.enabled && grant.sharing.knowledge.remote
          ? grant.sharing.knowledge.ids
          : [],
      );
      if (
        this.slot !== slot ||
        !this.valid(grant) ||
        slot.question.expiresAt <= this.now() ||
        !this.ports.assistant.allowsTranscript(slot.question.transcriptId)
      )
        throw new Error("Scope changed during preparation.");
      const review = this.ports.assistant.value.review;
      if (!review?.automatic || review.model !== grant.model)
        throw new Error("Automatic review changed.");
      slot.requestId = review.requestId;
      const permission = () => {
        const allowed =
          this.slot === slot &&
          this.valid(grant) &&
          slot.question.expiresAt > this.now() &&
          this.ports.assistant.allowsTranscript(slot.question.transcriptId);
        // Every successful pre-send check conservatively moves the next-start time.
        // The actual provider repeats this check after token renewal, just before POST.
        if (
          allowed &&
          (slot.requestId === null ||
            this.ports.assistant.requestState(slot.requestId) === "sending")
        )
          this.extendCooldown(grant);
        return allowed;
      };
      await this.ports.assistant.ask(
        { reviewId: review.requestId, acknowledged: true },
        permission,
      );
    } catch {
      if (this.slot === slot)
        this.revoke(
          "Automatic context or model access could not be prepared safely. No retry was made; review manually or authorise again.",
        );
    }
  }
  private extendCooldown(grant: LiveAuthorisation): void {
    grant.nextRequestAt = this.now() + grant.cooldownSeconds * 1000;
    this.nextMonotonicRequestAt =
      this.monotonic() + grant.cooldownSeconds * 1000;
  }
  assistantChanged(value: AssistantSnapshot): void {
    const slot = this.slot;
    if (!slot?.requestId) return;
    const response = value.responses.find(
      (item) => item.requestId === slot.requestId,
    );
    if (
      !response ||
      response.status === "sending" ||
      response.status === "generating"
    )
      return;
    this.slot = null;
    this.ports.diagnostics.queueDepth = 0;
    if (response.status === "completed") {
      this.ports.diagnostics.automaticCompletions++;
      this.ports.diagnostics.responseLatencyMs =
        (response.endedAt ?? this.now()) - response.startedAt;
      if (this.grant && this.grant.requests >= this.grant.requestLimit)
        this.revoke(
          "The authorised request limit was reached. Renew explicitly for further automatic requests.",
        );
      else this.ports.changed();
    } else
      this.revoke(
        "The automatic response failed or was cancelled. Live Assist is paused; no retry or paid fallback was made.",
      );
  }
  revoke(reason: string): void {
    const hadScope = Boolean(this.grant || this.slot || this.authorising);
    const slot = this.slot;
    this.grant = null;
    this.sent = [];
    this.preexisting.clear();
    this.suppressed.clear();
    this.slot = null;
    this.authorising = false;
    this.generation++;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = undefined;
    this.ports.diagnostics.queueDepth = 0;
    if (slot) {
      if (
        slot.requestId === null ||
        this.ports.assistant.value.review?.automatic
      )
        this.ports.assistant.discardReview();
      if (
        slot.requestId &&
        this.ports.assistant.value.responses.some(
          (response) =>
            response.requestId === slot.requestId &&
            (response.status === "sending" || response.status === "generating"),
        )
      )
        this.ports.assistant.cancel();
    }
    if (hadScope) {
      this.ports.status(`Live Assist paused. ${reason}`);
      this.ports.changed();
    }
  }
  dispose(): void {
    this.revoke("Application closed.");
    this.sent = [];
    this.suppressed.clear();
  }
}
