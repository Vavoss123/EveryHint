import { randomUUID } from "node:crypto";
import { exactKeys, record } from "../../shared/validation";
import {
  SUMMARY_SECTIONS,
  type PostMeetingContext,
  type PostMeetingGrant,
} from "../../shared/meeting-ai";
import type { SessionSnapshot } from "../../shared/contracts";
import { AssistantController } from "../ai/controller";
import { MeetingAIController } from "./ai";
import { MeetingController } from "./controller";

export class PostMeetingNotes {
  private grant: PostMeetingGrant | null = null;
  private permit: { grant: PostMeetingGrant; epoch: number | null } | null =
    null;
  private deadline = 0;
  private ending = false;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private status = "Automatic post-meeting notes are off.";
  constructor(
    private readonly ai: MeetingAIController,
    private readonly meetings: MeetingController,
    private readonly assistant: AssistantController,
    private readonly capture: () => SessionSnapshot,
    private readonly connection: () => {
      accountId: string | null;
      accountLabel: string;
      transcribing: boolean;
    },
    private readonly changed: () => void,
    private readonly now: () => number = Date.now,
    private readonly monotonic: () => number = () => performance.now(),
  ) {}
  get context(): PostMeetingContext | null {
    const capture = this.capture(),
      route = this.assistant.routing,
      connection = this.connection();
    if (
      capture.state !== "ACTIVE" ||
      !capture.sessionId ||
      !capture.consent?.acknowledged ||
      !connection.transcribing ||
      route.selected !== "codex" ||
      route.auth !== "chatgpt" ||
      !route.ready ||
      !route.model ||
      !connection.accountId
    )
      return null;
    return {
      captureSessionId: capture.sessionId,
      captureEpoch: capture.epoch,
      accountId: connection.accountId,
      accountLabel: connection.accountLabel.slice(0, 160),
      model: route.model,
      meetingId: this.meetings.value.activeMeetingId,
      available: {
        microphone: Boolean(
          capture.consent.microphone &&
            capture.sources.microphone.state === "CAPTURING" &&
            !capture.sources.microphone.muted,
        ),
        systemAudio: Boolean(
          capture.consent.systemAudio &&
            capture.sources.systemAudio.state === "CAPTURING",
        ),
      },
    };
  }
  get value() {
    return {
      autoGrant: this.grant ? structuredClone(this.grant) : null,
      postContext: this.context,
      postStatus: this.status,
    };
  }
  get enabled(): boolean {
    return Boolean(this.grant);
  }
  authorise(value: unknown): void {
    const input = record(value);
    exactKeys(input, [
      "acknowledged",
      "expected",
      "sharing",
      "minutes",
      "requestLimit",
    ]);
    if (input.acknowledged !== true)
      throw new Error(
        "Acknowledge separate automatic remote processing on End meeting.",
      );
    if (this.grant || this.permit)
      throw new Error(
        "Cancel the previous post-meeting permission before authorising again.",
      );
    const context = this.context;
    if (!context)
      throw new Error(
        "Start authorised audio/transcription and select a connected ChatGPT plan model first.",
      );
    const expected = record(input.expected);
    exactKeys(expected, [
      "captureSessionId",
      "captureEpoch",
      "accountId",
      "accountLabel",
      "model",
      "meetingId",
      "available",
    ]);
    const available = record(expected.available);
    exactKeys(available, ["microphone", "systemAudio"]);
    if (JSON.stringify(expected) !== JSON.stringify(context))
      throw new Error(
        "The post-meeting source/account/model preview changed; review it again.",
      );
    const sharing = record(input.sharing);
    exactKeys(sharing, ["microphone", "systemAudio"]);
    if (
      typeof sharing.microphone !== "boolean" ||
      typeof sharing.systemAudio !== "boolean" ||
      (!sharing.microphone && !sharing.systemAudio) ||
      (sharing.microphone && !context.available.microphone) ||
      (sharing.systemAudio && !context.available.systemAudio)
    )
      throw new Error(
        "Choose only available authorised final transcript sources.",
      );
    if (
      !Number.isInteger(input.minutes) ||
      (input.minutes as number) < 1 ||
      (input.minutes as number) > 60 ||
      input.requestLimit !== 1
    )
      throw new Error(
        "Post-meeting permission allows one attempt and expires within 1–60 minutes.",
      );
    this.deadline = this.monotonic() + (input.minutes as number) * 60000;
    this.grant = {
      ...context,
      id: randomUUID(),
      expiresAt: this.now() + (input.minutes as number) * 60000,
      sharing: {
        microphone: sharing.microphone,
        systemAudio: sharing.systemAudio,
      },
      requestLimit: 1,
    };
    const id = this.grant.id;
    this.expiry = setTimeout(
      () => {
        if (this.grant?.id === id || this.permit?.grant.id === id)
          this.revoke("Post-meeting permission expired; renew explicitly.");
      },
      (input.minutes as number) * 60000,
    );
    this.expiry.unref();
    this.status =
      "One automatic draft is authorised only for deliberate End meeting. Capture Stop/Pause, expiry or account/source changes revoke it. Draft saving remains manual.";
    this.changed();
  }
  private fresh(grant: PostMeetingGrant): boolean {
    return this.now() < grant.expiresAt && this.monotonic() < this.deadline;
  }
  private canEnd(): boolean {
    const grant = this.grant,
      context = this.context;
    return Boolean(
      grant &&
        context &&
        this.fresh(grant) &&
        context.captureSessionId === grant.captureSessionId &&
        context.captureEpoch === grant.captureEpoch &&
        context.accountId === grant.accountId &&
        context.model === grant.model &&
        context.meetingId === grant.meetingId &&
        (!grant.sharing.microphone || context.available.microphone) &&
        (!grant.sharing.systemAudio || context.available.systemAudio),
    );
  }
  private permitted(id: string): boolean {
    const permit = this.permit,
      capture = this.capture(),
      route = this.assistant.routing;
    return Boolean(
      permit &&
        permit.grant.id === id &&
        permit.epoch !== null &&
        capture.state === "STOPPED" &&
        capture.epoch === permit.epoch &&
        this.fresh(permit.grant) &&
        this.connection().accountId === permit.grant.accountId &&
        route.selected === "codex" &&
        route.auth === "chatgpt" &&
        route.ready &&
        route.model === permit.grant.model,
    );
  }
  observe(): void {
    if (this.ending) return;
    if (this.grant && !this.canEnd())
      this.revoke(
        "Capture, transcription, account, model, persistence association or expiry changed. No post-meeting request will run.",
      );
    if (this.permit) {
      if (["draft", "error"].includes(this.ai.value.status)) {
        this.permit = null;
        this.clearTimer();
        this.status =
          this.ai.value.status === "draft"
            ? "Automatic draft finished. Review and save selected sections explicitly; no further attempt is authorised."
            : "Automatic notes failed; no retry or paid fallback was made.";
        this.changed();
      } else if (!this.permitted(this.permit.grant.id))
        this.revoke("The automatic notes scope changed. No retry was made.");
    }
  }
  async end(stop: () => void): Promise<string | null> {
    const savedId = this.meetings.value.activeMeetingId,
      grant = this.canEnd() ? this.grant : null;
    this.grant = null;
    this.ending = true;
    this.permit = grant ? { grant, epoch: null } : null;
    try {
      stop();
      if (this.permit) this.permit.epoch = this.capture().epoch;
    } finally {
      this.ending = false;
    }
    await this.meetings.flush();
    if (!grant) {
      this.clearTimer();
      this.status =
        "Meeting ended without automatic remote notes. Generate a reviewed draft when you choose.";
      this.changed();
      return savedId;
    }
    const valid = () => this.permitted(grant.id);
    try {
      if (!valid())
        throw new Error("Post-meeting permission changed before preparation.");
      if (
        this.assistant.value.responses.some((response) =>
          ["sending", "generating"].includes(response.status),
        ) ||
        this.assistant.value.review
      )
        throw new Error(
          "Another review/request is active. No automatic notes attempt was queued.",
        );
      this.status =
        "Preparing one authorised automatic notes attempt; no retry or paid fallback.";
      this.changed();
      const segmentIds = savedId
        ? (await this.meetings.requireStore().contextSegments(savedId, []))
            .filter(
              (segment) =>
                segment.sessionId === grant.captureSessionId &&
                grant.sharing[segment.source],
            )
            .map(
              (segment) =>
                `${segment.meetingId}/${segment.sessionId}/${segment.id}`,
            )
        : [];
      if (savedId && !segmentIds.length)
        throw new Error(
          "No meaningful final transcript from this authorised capture segment is available.",
        );
      if (
        !savedId &&
        this.ai.temporaryDocument?.id !== `temporary-${grant.captureSessionId}`
      )
        throw new Error(
          "No retained temporary transcript from this authorised capture segment is available.",
        );
      const reviewId = await this.ai.prepare(
        {
          purpose: "summary",
          meetingIds: savedId ? [savedId] : [],
          temporary: !savedId,
          question: "",
          sources: { ...grant.sharing, notes: false },
          segmentIds,
          sections: [...SUMMARY_SECTIONS],
        },
        true,
        valid,
      );
      if (!valid())
        throw new Error(
          "Permission changed before automatic notes transmission.",
        );
      await this.ai.ask({ reviewId, acknowledged: true }, valid);
    } catch (error) {
      this.permit = null;
      this.clearTimer();
      this.status =
        error instanceof Error
          ? `${error.message} No automatic retry occurred.`
          : "Post-meeting notes failed without retry.";
      this.changed();
    }
    return savedId;
  }
  revoke(reason = "Automatic post-meeting notes permission cancelled."): void {
    const working = Boolean(this.permit);
    this.grant = null;
    this.permit = null;
    this.clearTimer();
    this.status = reason;
    if (working) this.ai.cancel(reason);
    this.changed();
  }
  private clearTimer(): void {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = undefined;
  }
  dispose(): void {
    this.revoke("Application closed; post-meeting permission was not saved.");
  }
}
