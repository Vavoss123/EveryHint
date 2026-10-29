import type { ContextReview } from "../../shared/ai";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import type { PrepareCapture, SessionSnapshot } from "../../shared/contracts";
import type { ListenSnapshot, SharingChoices } from "../../shared/listen";
import type {
  TranscriptionSnapshot,
  TranscriptEvent,
} from "../../shared/transcription";
import { exactKeys, record } from "../../shared/validation";
import type { AssistantController } from "../ai/controller";
import { detectQuestion } from "../intelligence/question";

const lifetime = 60 * 60_000;
interface Ports {
  capture(): SessionSnapshot;
  speech(): TranscriptionSnapshot;
  prepare(input: PrepareCapture): Promise<void>;
  start(): void | Promise<void>;
  stop(): void;
  enableSpeech(): Promise<void>;
  speechReady(): Promise<void>;
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
export function latestQuestion(
  events: readonly TranscriptEvent[],
): string | null {
  const context = events
    .map((e) => e.text)
    .join(" ")
    .slice(-6000);
  for (const event of [...events].reverse()) {
    const score = detectQuestion(event.text, context);
    if (score?.complete && score.confidence >= 0.75 && score.relevance >= 0.65)
      return score.text;
  }
  return null;
}
export class ListenController {
  private managedSession: string | null = null;
  private grant: Grant | undefined;
  private generation = 0;
  private requestEpoch = 0;
  private autoEpoch = -1;
  private inactiveEpoch = -1;
  private starting = false;
  private preparing = false;
  private message: string | null = null;
  private preview: ContextReview | null = null;
  private requestId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private lastState = "";
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
      phase:
        capture.state === "PAUSED"
          ? "paused"
          : capture.state === "ERROR" ||
              (this.managedSession && speech.state === "ERROR")
            ? "error"
            : this.starting ||
                (this.managedSession &&
                  capture.state === "ACTIVE" &&
                  (capture.consent?.microphone ||
                    capture.consent?.systemAudio) &&
                  speech.state !== "LISTENING")
              ? speech.state === "PAUSED" && !this.starting
                ? "transcription-paused"
                : "starting"
              : this.managedSession && capture.state === "ACTIVE"
                ? "listening"
                : "idle",
      sharing: this.grant
        ? {
            transcript: this.grant.transcript,
            screen: this.grant.screen,
            expiresAt: this.grant.expiresAt,
          }
        : null,
      busy: this.preparing,
      message: this.message,
      latestQuestion: latestQuestion(
        recentFinals(capture, speech.events, this.now()).filter((e) =>
          this.assistant.allowsTranscript(e.id),
        ),
      ),
    };
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
      this.publish();
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
      if (
        this.inactiveEpoch !== capture.epoch &&
        (this.preparing ||
          (this.requestId &&
            ["sending", "generating"].includes(
              this.assistant.requestState(this.requestId) ?? "",
            )))
      ) {
        this.inactiveEpoch = capture.epoch;
        this.requestEpoch++;
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
    this.publish();
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
          "Sharing permission expired. Allow it again to ask ChatGPT.",
        ),
      lifetime,
    );
    this.message = null;
    this.publish();
  }
  revoke(
    message:
      | string
      | null = "ChatGPT sharing is off. Local listening can continue.",
  ): void {
    this.grant = undefined;
    this.preview = null;
    this.requestEpoch++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (
      this.preparing ||
      (this.requestId &&
        ["sending", "generating"].includes(
          this.assistant.requestState(this.requestId) ?? "",
        ))
    ) {
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
    this.revoke("Session stopped. Sharing permission was cleared.");
  }
  context(): ContextReview | null {
    this.observe();
    if (this.preview && this.now() - this.preview.createdAt > 120_000)
      this.preview = null;
    return this.preview ? structuredClone(this.preview) : null;
  }
  async ask(value: unknown): Promise<void> {
    const input = record(value);
    exactKeys(input, ["question"]);
    if (typeof input.question !== "string" || input.question.length > 6000)
      throw new Error("Ask a question of at most 6,000 characters.");
    this.observe();
    if (this.preparing) return;
    const grant = this.grant;
    try {
      if (!grant || !this.valid(grant))
        throw new Error(
          this.ports.capture().state === "PAUSED"
            ? "Resume listening before asking from the conversation."
            : "Start listening and allow ChatGPT sharing for this session.",
        );
      if (
        this.assistant.value.responses.some((r) =>
          ["sending", "generating"].includes(r.status),
        )
      )
        throw new Error(
          "An answer is already in progress. Cancel it before asking again.",
        );
      this.ports.interruptAutomatic();
      this.preparing = true;
      this.message = null;
      const epoch = this.requestEpoch,
        captureEpoch = this.ports.capture().epoch;
      const valid = () =>
        this.valid(grant) &&
        epoch === this.requestEpoch &&
        captureEpoch === this.ports.capture().epoch;
      this.publish();
      await this.ports.ready();
      if (!valid())
        throw new Error(
          "Sharing or session changed. Ask again after allowing sharing.",
        );
      const capture = this.ports.capture();
      const events = grant.transcript
        ? recentFinals(capture, this.ports.speech().events, this.now()).filter(
            (e) => this.assistant.allowsTranscript(e.id),
          )
        : [];
      const detected = latestQuestion(events);
      await this.assistant.requestFromSession(
        {
          question: input.question.trim() || detected || "",
          options: {
            ...DEFAULT_CONTEXT,
            history: false,
            recentSeconds: 120,
            microphone: grant.transcript && !!capture.consent?.microphone,
            systemAudio: grant.transcript && !!capture.consent?.systemAudio,
            screenshot: grant.screen && !!capture.consent?.screen,
          },
        },
        valid,
        (review) => {
          this.preview = review;
          this.requestId = review.requestId;
        },
      );
    } catch (error) {
      this.message =
        error instanceof Error
          ? error.message
          : "Could not ask from the conversation.";
      throw error;
    } finally {
      this.preparing = false;
      this.publish();
    }
  }
}
