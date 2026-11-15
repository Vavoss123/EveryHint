import type { ContextReview } from "../../shared/ai";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import type {
  AudioSourceId,
  PrepareCapture,
  SessionSnapshot,
} from "../../shared/contracts";
import {
  SESSION_CONTEXT,
  type ListenSnapshot,
  type SharingChoices,
} from "../../shared/listen";
import type {
  TranscriptionSnapshot,
  TranscriptEvent,
} from "../../shared/transcription";
import { exactKeys, record } from "../../shared/validation";
import type { AssistantController } from "../ai/controller";
import { isHelpRequest } from "../ai/context";
import { detectQuestion } from "../intelligence/question";

// Sharing approved at Start lasts for the session; Stop, connection, mode
// and provider changes still revoke it. The bound guards against a
// forgotten session running for days.
const lifetime = 24 * 60 * 60_000;
/** A heard question is offered for this long after it was spoken. */
const HEARD_WINDOW_MS = 60_000;
/** Automatic answers are for the question just asked, not one from a while ago. */
const AUTO_FRESH_MS = 20_000;
const AUTO_INTERVAL_MS = 8_000;
/** Bounds what a forgotten automatic session can spend. */
const AUTO_LIMIT = 60;
/** A key repeat or double press must not restart the answer it just began. */
const REPEAT_MS = 1_500;

interface Ports {
  capture(): SessionSnapshot;
  speech(): TranscriptionSnapshot;
  prepare(input: PrepareCapture): Promise<void>;
  start(): void | Promise<void>;
  stop(): void;
  enableSpeech(): Promise<void>;
  speechReady(): Promise<void>;
  /** Waits until speech in progress has been transcribed. */
  settleSpeech(): Promise<void>;
  // Includes account, plan permission, provider, model, mode and assistant session.
  binding(includeModel?: boolean): string;
  owner(): string;
  ready(): Promise<void>;
  interruptAutomatic(): void;
}
interface Grant extends SharingChoices {
  sessionId: string;
  binding: string;
  expiresAt: number;
  deadline: number;
}
export interface HeardQuestion {
  id: string;
  text: string;
  source: AudioSourceId;
  endMs: number;
}
function choices(value: unknown): SharingChoices {
  const input = record(value);
  exactKeys(input, ["transcript", "screen", "acknowledged"]);
  for (const key of ["transcript", "screen", "acknowledged"])
    if (typeof input[key] !== "boolean")
      throw new Error("Choose this session's sharing permissions.");
  if ((input.transcript || input.screen) && input.acknowledged !== true)
    throw new Error("Authorise sharing with ChatGPT for this session first.");
  return input as unknown as SharingChoices;
}
export function recentFinals(
  capture: SessionSnapshot,
  events: readonly TranscriptEvent[],
  now: number,
): TranscriptEvent[] {
  return events
    .filter(
      (e) =>
        e.sessionId === capture.sessionId &&
        e.state === "final" &&
        capture.consent?.acknowledged &&
        capture.consent[e.source] &&
        Number.isFinite(e.startMs) &&
        Number.isFinite(e.endMs) &&
        e.startMs >= now - 120_000 &&
        e.endMs >= e.startMs &&
        e.endMs <= now + 1000,
    )
    .sort(
      (a, b) =>
        a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id),
    )
    .slice(-100);
}
/**
 * The newest complete question in the given lines. When the other side of a
 * call is audible as system audio, questions the user asked themselves on the
 * microphone are not ones they need help answering.
 */
export function heardQuestion(
  events: readonly TranscriptEvent[],
): HeardQuestion | null {
  const context = events
    .map((e) => e.text)
    .join(" ")
    .slice(-6000);
  const theirs = events.some((e) => e.source === "systemAudio");
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (theirs && event.source !== "systemAudio") continue;
    const score = detectQuestion(event.text, context);
    if (score?.complete && score.confidence >= 0.75 && score.relevance >= 0.65)
      return {
        id: event.id,
        text: score.text,
        source: event.source,
        endMs: event.endMs,
      };
  }
  return null;
}
export const latestQuestion = (
  events: readonly TranscriptEvent[],
): string | null => heardQuestion(events)?.text ?? null;

export class ListenController {
  private managedSession: string | null = null;
  private grant: Grant | undefined;
  private generation = 0;
  private requestEpoch = 0;
  private autoEpoch = -1;
  private inactiveEpoch = -1;
  private starting = false;
  private preparing = false;
  /** The question of the request being prepared, to coalesce repeats. */
  private preparingQuestion: string | undefined;
  /** A different question asked meanwhile; it runs next and the newest wins. */
  private queued: string | undefined;
  private message: string | null = null;
  private preview: ContextReview | null = null;
  private requestId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private lastState = "";
  /** The heard question the last conversation request already covered. */
  private askedAbout: string | undefined;
  private auto = false;
  /** Present when automatic answers were turned on; never answered unasked. */
  private autoSkip: string | undefined;
  private autoAt = -Infinity;
  private autoCount = 0;
  private autoTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly ports: Ports,
    private readonly assistant: AssistantController,
    private readonly changed: (value: ListenSnapshot) => void,
    private readonly now = Date.now,
    private readonly monotonic = () => performance.now(),
  ) {}
  get value(): ListenSnapshot {
    const capture = this.ports.capture(),
      speech = this.ports.speech();
    return {
      revision: this.revision,
      managed: !!this.managedSession,
      phase: this.phase(capture, speech),
      sharing: this.grant
        ? {
            transcript: this.grant.transcript,
            screen: this.grant.screen,
            expiresAt: this.grant.expiresAt,
          }
        : null,
      busy: this.preparing,
      message: this.message,
      latestQuestion: this.heard(capture, speech.events)?.text ?? null,
      auto: this.auto,
    };
  }
  private phase(
    capture: SessionSnapshot,
    speech: TranscriptionSnapshot,
  ): ListenSnapshot["phase"] {
    if (capture.state === "PAUSED") return "paused";
    if (
      capture.state === "ERROR" ||
      (this.managedSession && speech.state === "ERROR")
    )
      return "error";
    const awaitingSpeech =
      this.managedSession &&
      capture.state === "ACTIVE" &&
      (capture.consent?.microphone || capture.consent?.systemAudio) &&
      speech.state !== "LISTENING";
    if (this.starting || awaitingSpeech)
      return speech.state === "PAUSED" && !this.starting
        ? "transcription-paused"
        : "starting";
    return this.managedSession && capture.state === "ACTIVE"
      ? "listening"
      : "idle";
  }
  /** The newest question just heard, whether or not it was asked about. */
  private heardNow(
    capture = this.ports.capture(),
    events: readonly TranscriptEvent[] = this.ports.speech().events,
  ): HeardQuestion | null {
    const now = this.now();
    return heardQuestion(
      recentFinals(capture, events, now).filter(
        (e) =>
          e.endMs >= now - HEARD_WINDOW_MS &&
          this.assistant.allowsTranscript(e.id),
      ),
    );
  }
  private heard(
    capture?: SessionSnapshot,
    events?: readonly TranscriptEvent[],
  ): HeardQuestion | null {
    const question = this.heardNow(capture, events);
    return question && question.id !== this.askedAbout ? question : null;
  }
  /** A conversation request from this controller is being prepared or answered. */
  private answering(): boolean {
    return (
      this.preparing ||
      (!!this.requestId &&
        ["sending", "generating"].includes(
          this.assistant.requestState(this.requestId) ?? "",
        ))
    );
  }
  private publish(): void {
    const value = this.value,
      key = JSON.stringify({ ...value, revision: 0 });
    if (key === this.lastState) return;
    this.lastState = key;
    this.changed({ ...value, revision: ++this.revision });
  }
  private valid(grant: Grant): boolean {
    const capture = this.ports.capture();
    return (
      this.grant === grant &&
      capture.sessionId === grant.sessionId &&
      capture.state === "ACTIVE" &&
      this.now() < grant.expiresAt &&
      this.monotonic() < grant.deadline &&
      this.ports.binding() === grant.binding
    );
  }
  observe(): void {
    this.reconcile();
    this.autoAnswer();
    this.publish();
  }
  /** Brings this controller in line with capture, speech and the provider. */
  private reconcile(): void {
    const capture = this.ports.capture();
    if (
      this.managedSession &&
      !this.starting &&
      this.ports.speech().state === "ERROR"
    ) {
      const error =
        this.ports.speech().error ??
        "Local speech recognition stopped. Start a new session to try again.";
      this.ports.stop();
      this.message = error;
      return;
    }
    if (
      this.managedSession &&
      (capture.sessionId !== this.managedSession ||
        ["STOPPED", "ERROR", "IDLE"].includes(capture.state))
    ) {
      this.managedSession = null;
      this.revoke("Session ended. Sharing permission was cleared.");
    }
    if (
      this.grant &&
      (capture.sessionId !== this.grant.sessionId ||
        this.ports.binding() !== this.grant.binding ||
        this.now() >= this.grant.expiresAt ||
        this.monotonic() >= this.grant.deadline)
    )
      this.revoke(
        "Sharing permission changed or expired. Authorise this session again.",
      );
    if (capture.state !== "ACTIVE") {
      this.preview = null;
      if (this.inactiveEpoch !== capture.epoch && this.answering()) {
        this.inactiveEpoch = capture.epoch;
        this.requestEpoch++;
        this.queued = undefined;
        this.assistant.cancel();
        this.assistant.discardReview();
      }
    }
    // Resume the same locally authorised session once per capture epoch. An
    // explicit transcription pause in that epoch stays paused.
    if (
      this.managedSession &&
      !this.starting &&
      capture.state === "ACTIVE" &&
      capture.epoch !== this.autoEpoch &&
      (capture.consent?.microphone || capture.consent?.systemAudio) &&
      ["microphone", "systemAudio"].some(
        (key) => capture.sources[key as "microphone"].state === "CAPTURING",
      )
    ) {
      this.autoEpoch = capture.epoch;
      const sessionId = this.managedSession,
        epoch = capture.epoch;
      void this.ports.enableSpeech().catch((error) => {
        if (
          this.managedSession !== sessionId ||
          this.ports.capture().epoch !== epoch
        )
          return;
        this.message =
          error instanceof Error
            ? error.message
            : "Local transcription could not start.";
        this.revoke(this.message);
        this.ports.stop();
      });
    }
  }
  async start(value: unknown): Promise<void> {
    if (
      this.starting ||
      ["ACTIVE", "PAUSED", "READY"].includes(this.ports.capture().state)
    )
      throw new Error("Stop the current session before starting another.");
    const input = record(value);
    exactKeys(input, ["capture", "sharing"]);
    const sharing = choices(input.sharing),
      capture = record(input.capture);
    const consent = record(capture.consent);
    this.starting = true;
    const generation = ++this.generation;
    const owner = this.ports.owner();
    this.message = null;
    this.publish();
    try {
      if (consent.microphone || consent.systemAudio)
        await this.ports.speechReady();
      if (generation !== this.generation)
        throw new Error("Start was cancelled.");
      await this.ports.prepare(input.capture as PrepareCapture);
      if (generation !== this.generation)
        throw new Error("Start was cancelled.");
      this.managedSession = this.ports.capture().sessionId;
      await this.ports.start();
      if (
        generation !== this.generation ||
        this.ports.capture().sessionId !== this.managedSession ||
        this.ports.capture().state !== "ACTIVE"
      )
        throw new Error("Start was cancelled.");
      this.autoEpoch = this.ports.capture().epoch;
      if (consent.microphone || consent.systemAudio)
        await this.ports.enableSpeech();
      if (
        generation !== this.generation ||
        this.ports.capture().state !== "ACTIVE"
      )
        throw new Error("Start was cancelled.");
      // Local listening remains useful when sign-in is still required.
      if (sharing.transcript || sharing.screen) {
        try {
          if (owner !== this.ports.owner())
            throw new Error(
              "Connection or mode changed while starting. Allow sharing again for this session.",
            );
          await this.authorise(sharing);
        } catch (error) {
          this.message =
            error instanceof Error
              ? error.message
              : "Connect ChatGPT to allow sharing.";
        }
      }
    } catch (error) {
      if (generation === this.generation) this.ports.stop();
      throw error;
    } finally {
      this.starting = false;
      this.publish();
    }
  }
  async authorise(value: unknown): Promise<void> {
    const sharing = choices(value),
      capture = this.ports.capture();
    if (
      !this.managedSession ||
      capture.sessionId !== this.managedSession ||
      capture.state !== "ACTIVE"
    )
      throw new Error("Start listening before allowing session sharing.");
    if (
      sharing.transcript &&
      !capture.consent?.microphone &&
      !capture.consent?.systemAudio
    )
      throw new Error("No audio source is authorised for this session.");
    if (sharing.screen && !capture.consent?.screen)
      throw new Error("No screen is authorised for this session.");
    this.revoke(null);
    if (!sharing.transcript && !sharing.screen) return;
    const generation = this.generation,
      epoch = capture.epoch,
      binding = this.ports.binding(false),
      permissionEpoch = this.requestEpoch;
    await this.ports.ready();
    if (
      generation !== this.generation ||
      permissionEpoch !== this.requestEpoch ||
      this.ports.capture().epoch !== epoch ||
      this.ports.capture().state !== "ACTIVE" ||
      binding !== this.ports.binding(false)
    )
      throw new Error("Session or connection changed. Allow sharing again.");
    this.grant = {
      ...sharing,
      sessionId: capture.sessionId!,
      binding: this.ports.binding(),
      expiresAt: this.now() + lifetime,
      deadline: this.monotonic() + lifetime,
    };
    this.timer = setTimeout(
      () =>
        this.revoke(
          "Sharing permission expired after 24 hours. Allow it again to keep asking.",
        ),
      lifetime,
    );
    this.message = null;
    this.publish();
  }
  revoke(
    message:
      string | null = "ChatGPT sharing is off. Local listening can continue.",
  ): void {
    this.grant = undefined;
    this.preview = null;
    this.requestEpoch++;
    this.queued = undefined;
    // Automatic answers belong to the permission they were turned on under.
    this.stopAuto();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.answering()) {
      this.assistant.cancel();
      this.assistant.discardReview();
    }
    this.message = message;
    this.publish();
  }
  stop(): void {
    this.generation++;
    this.managedSession = null;
    this.autoEpoch = -1;
    this.askedAbout = undefined;
    this.revoke("Session stopped. Sharing permission was cleared.");
  }
  context(): ContextReview | null {
    this.observe();
    if (this.preview && this.now() - this.preview.createdAt > 120_000)
      this.preview = null;
    return this.preview ? structuredClone(this.preview) : null;
  }
  /**
   * Opts this session in or out of answering new questions as they are heard.
   * It never widens what is shared: it needs the transcript permission already
   * granted, ends with it, and is off again for the next session.
   */
  setAuto(value: unknown): void {
    const input = record(value);
    exactKeys(input, ["enabled"]);
    if (typeof input.enabled !== "boolean")
      throw new Error("Choose whether automatic answers are on.");
    this.reconcile();
    if (!input.enabled) {
      this.stopAuto();
      this.publish();
      return;
    }
    const grant = this.grant;
    if (!grant?.transcript || !this.valid(grant))
      throw new Error(
        "Automatic answers need an active session with transcript sharing allowed.",
      );
    this.auto = true;
    this.autoCount = 0;
    // Only questions heard from now on are answered without being asked.
    this.autoSkip = this.heardNow()?.id;
    this.message = null;
    this.publish();
  }
  private stopAuto(): void {
    this.auto = false;
    this.autoSkip = undefined;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = undefined;
  }
  private autoAnswer(): void {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = undefined;
    const grant = this.grant;
    if (!this.auto || !grant?.transcript || !this.valid(grant)) return;
    const heard = this.heard();
    if (
      !heard ||
      heard.id === this.autoSkip ||
      this.now() - heard.endMs > AUTO_FRESH_MS
    )
      return;
    // An answer in progress is never interrupted. This runs again when it ends.
    if (this.answering() || this.assistant.inFlight) return;
    const wait = this.autoAt + AUTO_INTERVAL_MS - this.monotonic();
    if (wait > 0) {
      this.autoTimer = setTimeout(() => this.observe(), wait);
      return;
    }
    if (this.autoCount >= AUTO_LIMIT) {
      this.stopAuto();
      this.message = `Automatic answers paused after ${AUTO_LIMIT} in this session. Turn them on again to continue.`;
      return;
    }
    this.autoSkip = heard.id;
    this.autoAt = this.monotonic();
    this.autoCount++;
    void this.ask({ question: "" }, true).catch(() => {});
  }
  async ask(value: unknown, automatic = false): Promise<void> {
    const input = record(value);
    exactKeys(input, ["question"]);
    if (typeof input.question !== "string" || input.question.length > 6000)
      throw new Error("Ask a question of at most 6,000 characters.");
    this.reconcile();
    const typed = input.question.trim();
    if (this.preparing) {
      // The same trigger twice is one request. A different question waits for
      // the one being prepared and then replaces it.
      if (!automatic && typed !== this.preparingQuestion) this.queued = typed;
      return;
    }
    const grant = this.grant;
    // A typed question is useful on its own. Without a valid sharing grant it
    // is sent as text only, with no transcript or screen.
    const textOnly =
      !!typed && !isHelpRequest(typed) && (!grant || !this.valid(grant));
    try {
      if (!textOnly && (!grant || !this.valid(grant)))
        throw new Error(
          this.ports.capture().state === "PAUSED"
            ? "Resume listening before asking from the conversation."
            : "Start listening and allow ChatGPT sharing for this session.",
        );
      const running = this.assistant.inFlight;
      if (running) {
        if (automatic) return;
        if (running.requestId !== this.requestId)
          throw new Error(
            "An answer is already in progress. Cancel it before asking again.",
          );
        if (
          running.question === typed &&
          this.now() - running.startedAt < REPEAT_MS
        )
          return;
      }
      this.preparing = true;
      this.preparingQuestion = typed;
      this.message = null;
      // The conversation has moved on: the newest request replaces the answer
      // still being written instead of being refused.
      if (running) this.assistant.cancel();
      if (!automatic) this.ports.interruptAutomatic();
      const epoch = this.requestEpoch,
        captureEpoch = this.ports.capture().epoch,
        binding = this.ports.binding(false);
      const valid = textOnly
        ? () =>
            epoch === this.requestEpoch && this.ports.binding(false) === binding
        : () =>
            this.valid(grant!) &&
            epoch === this.requestEpoch &&
            captureEpoch === this.ports.capture().epoch;
      this.publish();
      const transcript = !textOnly && grant!.transcript;
      // Include the words just spoken, not only already-final lines. They are
      // finalised while the provider connection is checked, not after it.
      await Promise.all([
        this.ports.ready(),
        transcript ? this.ports.settleSpeech() : undefined,
      ]);
      if (!valid())
        throw new Error(
          "Sharing or session changed. Ask again after allowing sharing.",
        );
      const capture = this.ports.capture();
      const scope = textOnly ? { transcript: false, screen: false } : grant!;
      // The model reads the transcript itself; a heuristic detected question
      // is not substituted for the user's request because it can pick the
      // wrong sentence or speaker.
      await this.assistant.requestFromSession(
        {
          question: typed,
          options: {
            ...DEFAULT_CONTEXT,
            history: true,
            recentSeconds: SESSION_CONTEXT.seconds,
            transcriptChars: SESSION_CONTEXT.transcriptChars,
            totalChars: SESSION_CONTEXT.totalChars,
            microphone: scope.transcript && !!capture.consent?.microphone,
            systemAudio: scope.transcript && !!capture.consent?.systemAudio,
            screenshot: scope.screen && !!capture.consent?.screen,
          },
        },
        valid,
        (review) => {
          this.preview = review;
          this.requestId = review.requestId;
        },
      );
      // "Help with this moment" covers the question that was just heard.
      if (transcript && (!typed || isHelpRequest(typed)))
        this.askedAbout = this.heardNow()?.id ?? this.askedAbout;
    } catch (error) {
      // Nobody asked for an automatic answer, so its failure is not reported.
      if (automatic) return;
      this.message =
        error instanceof Error
          ? error.message
          : "Could not ask from the conversation.";
      throw error;
    } finally {
      this.preparing = false;
      this.preparingQuestion = undefined;
      const next = this.queued;
      this.queued = undefined;
      if (next !== undefined) void this.ask({ question: next }).catch(() => {});
      this.publish();
    }
  }
}
