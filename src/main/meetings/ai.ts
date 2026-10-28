import type { SessionSnapshot } from "../../shared/contracts";
import type { TranscriptEvent } from "../../shared/transcription";
import type { AssistantSnapshot } from "../../shared/ai";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import {
  SUMMARY_SECTIONS,
  parseMeetingSelection,
  type MeetingAIContext,
  type MeetingAIState,
  type MeetingSelection,
  type SummarySection,
} from "../../shared/meeting-ai";
import {
  meetingId,
  type MeetingDocument,
  type MeetingSegment,
  type MeetingSummary,
} from "../../shared/meetings";
import { exactKeys, record } from "../../shared/validation";
import { AssistantController } from "../ai/controller";
import { MeetingController } from "./controller";
import { buildMeetingContext, parseMeetingDraft } from "./ai-context";
import type { MeetingStore } from "./store";

interface Binding {
  id: string;
  context: MeetingAIContext;
  valid: () => boolean;
  profile: MeetingStore | null;
  accountId: string;
  temporary: boolean;
  automatic: boolean;
}
export class MeetingAIController {
  private state: MeetingAIState = {
    revision: 0,
    reviewId: null,
    requestId: null,
    purpose: null,
    status: "idle",
    error: null,
    draft: null,
    textDraft: null,
    autoGrant: null,
    postContext: null,
    postStatus: "Automatic post-meeting notes are off.",
  };
  private generation = 0;
  private temporaryCutoff = 0;
  private binding: Binding | undefined;
  constructor(
    private readonly assistant: AssistantController,
    private readonly meetings: MeetingController,
    private readonly sources: () => {
      capture: SessionSnapshot;
      events: readonly TranscriptEvent[];
    },
    private readonly connection: () => { accountId: string | null },
    private readonly changed: () => void,
    private readonly now: () => number = Date.now,
  ) {}
  get value(): MeetingAIState {
    return structuredClone(this.state);
  }
  get revision(): number {
    return this.state.revision;
  }
  get status(): MeetingAIState["status"] {
    return this.state.status;
  }
  private publish(): void {
    this.state.revision++;
    this.changed();
  }
  get temporaryDocument(): MeetingDocument | null {
    const { capture, events } = this.sources(),
      sessionId = capture.sessionId ?? events.at(-1)?.sessionId;
    const finals = events.filter(
      (event) =>
        event.sessionId === sessionId &&
        event.state === "final" &&
        event.startMs >= this.temporaryCutoff,
    );
    if (!sessionId || !finals.length) return null;
    const started = Math.floor(
        Math.min(...finals.map((event) => event.startMs)),
      ),
      ended = Math.floor(Math.max(...finals.map((event) => event.endMs)));
    return {
      id: `temporary-${sessionId}`,
      title: "Temporary session (retained text only)",
      createdAt: started,
      startedAt: started,
      endedAt: capture.state === "ACTIVE" ? null : ended,
      durationMs: Math.max(0, ended - started),
      status: capture.state === "ACTIVE" ? "active" : "ended",
      runs: [],
      notes: "",
      summary: null,
      actions: [],
      decisions: [],
      tags: [],
      editedSections: [],
      updatedAt: ended,
      revision: 0,
      segmentCount: finals.length,
    };
  }
  private async context(selection: MeetingSelection): Promise<{
    context: MeetingAIContext;
    store: MeetingStore | null;
    valid: () => boolean;
  }> {
    if (selection.temporary) {
      const doc = this.temporaryDocument;
      if (!doc)
        throw new Error("No retained temporary transcript is available.");
      const segments = this.temporarySegments;
      const context = buildMeetingContext([doc], segments, selection);
      const valid = () => {
        const current = this.temporaryDocument;
        if (current?.id !== doc.id) return false;
        const events = this.sources().events;
        return context.excerpts.every((excerpt) =>
          events.some(
            (event) =>
              event.id === excerpt.segmentId &&
              event.sessionId === excerpt.sessionId &&
              event.state === "final" &&
              event.source === excerpt.source &&
              event.text.startsWith(excerpt.text),
          ),
        );
      };
      return { context, store: null, valid };
    }
    const store = this.meetings.requireStore(),
      documents = await Promise.all(
        selection.meetingIds.map((id) => store.get(id)),
      );
    const segments = (
      await Promise.all(
        documents.map((doc) =>
          store.contextSegments(
            doc.id,
            selection.segmentIds.filter((ref) => ref.startsWith(`${doc.id}/`)),
          ),
        ),
      )
    ).flat();
    const context = buildMeetingContext(documents, segments, selection);
    if (
      documents.reduce((sum, doc) => sum + doc.segmentCount, 0) >
      segments.length
    )
      context.notices.unshift(
        "Context selection considers at most the latest 100 final segments per meeting unless you explicitly select older transcript references. Other discussion may be omitted.",
      );
    const valid = () => {
      try {
        return (
          this.meetings.requireStore() === store &&
          documents.every((doc) => store.isCurrent(doc.id, doc.revision))
        );
      } catch {
        return false;
      }
    };
    return { context, store, valid };
  }
  async prepare(
    value: unknown,
    automatic = false,
    permit?: () => boolean,
  ): Promise<string> {
    const selection = parseMeetingSelection(value),
      routing = this.assistant.routing,
      accountId = this.connection().accountId;
    if (
      routing.selected !== "codex" ||
      routing.auth !== "chatgpt" ||
      !routing.ready ||
      !routing.model ||
      !accountId
    )
      throw new Error(
        "Connect ChatGPT plan usage, refresh models and explicitly choose an available model before meeting AI.",
      );
    if (automatic && !permit)
      throw new Error(
        "Automatic post-meeting notes require their separate current-session permission.",
      );
    this.cancel("A new meeting AI review was chosen.");
    const generation = this.generation;
    const selected = await this.context(selection);
    const valid = () =>
      generation === this.generation &&
      selected.valid() &&
      this.connection().accountId === accountId &&
      this.assistant.routing.selected === "codex" &&
      this.assistant.routing.model === routing.model &&
      (!permit || permit());
    const question =
      selection.question.trim() ||
      (selection.purpose === "summary"
        ? "Generate grounded meeting notes from the selected final transcript excerpts."
        : selection.purpose === "follow-up"
          ? "Draft an editable follow-up email from the selected meeting excerpts; leave recipients unspecified."
          : "Summarise the agreed action items in the selected meeting excerpts.");
    await this.assistant.prepare(
      {
        question,
        options: {
          ...DEFAULT_CONTEXT,
          microphone: false,
          systemAudio: false,
          screenshot: false,
          history: false,
        },
      },
      automatic,
      { context: selected.context, valid },
    );
    const review = this.assistant.value.review;
    if (!review?.meetingContext || !valid())
      throw new Error("The meeting review changed during preparation.");
    this.binding = {
      id: review.requestId,
      context: selected.context,
      valid,
      profile: selected.store,
      accountId,
      temporary: selection.temporary,
      automatic,
    };
    this.state.reviewId = review.requestId;
    this.state.requestId = null;
    this.state.purpose = selection.purpose;
    this.state.status = "review";
    this.state.error = null;
    this.publish();
    return review.requestId;
  }
  async ask(value: unknown, permit?: () => boolean): Promise<void> {
    const input = record(value);
    exactKeys(input, ["reviewId", "acknowledged"]);
    const binding = this.binding;
    if (
      !binding ||
      input.reviewId !== binding.id ||
      input.acknowledged !== true ||
      !binding.valid() ||
      binding.automatic !== Boolean(permit)
    )
      throw new Error(
        "Review the selected meeting text and acknowledge its remote transfer again.",
      );
    this.state.reviewId = null;
    this.state.requestId = binding.id;
    this.state.status = "sending";
    this.state.error = null;
    this.publish();
    try {
      await this.assistant.ask(input, permit);
    } catch (error) {
      this.state.requestId = null;
      this.state.status = "error";
      this.state.error =
        error instanceof Error
          ? error.message
          : "Meeting request could not start.";
      this.publish();
      throw error;
    }
  }
  assistantChanged(snapshot: AssistantSnapshot): void {
    const binding = this.binding,
      id = this.state.requestId;
    if (!binding || !id) return;
    const response = snapshot.responses.find(
      (response) => response.requestId === id,
    );
    if (!response) {
      this.cancel(
        "The assistant conversation changed; meeting work was cancelled.",
      );
      return;
    }
    if (response.status === "sending" || response.status === "generating")
      return;
    this.state.requestId = null;
    if (response.status !== "completed" || !binding.valid()) {
      this.state.status = "error";
      this.state.error =
        response.error?.message ??
        "The selected meeting/profile changed. No result was saved; review current context.";
      this.publish();
      return;
    }
    try {
      if (binding.context.purpose === "summary") {
        const draft = parseMeetingDraft(
          response.text,
          binding.context,
          response.model,
          this.now(),
        );
        if (binding.temporary) {
          draft.meetingId = null;
          draft.expectedRevision = null;
        }
        this.state.draft = draft;
        this.state.textDraft = null;
      } else {
        this.state.textDraft = response.text;
        this.state.draft = null;
      }
      this.state.status = "draft";
      this.state.error = null;
    } catch (error) {
      this.state.status = "error";
      this.state.error =
        error instanceof Error
          ? error.message
          : "The generated draft was invalid. Nothing was saved.";
    }
    this.publish();
  }
  async apply(value: unknown): Promise<MeetingDocument> {
    const input = record(value);
    exactKeys(input, [
      "draftId",
      "meetingId",
      "expectedRevision",
      "sections",
      "overwriteManual",
    ]);
    const draft = this.state.draft,
      binding = this.binding;
    if (
      !draft ||
      !binding ||
      draft.id !== input.draftId ||
      draft.meetingId !== meetingId(input.meetingId) ||
      draft.expectedRevision !== input.expectedRevision ||
      binding.profile !== this.meetings.requireStore() ||
      binding.accountId !== this.connection().accountId
    )
      throw new Error(
        "This draft belongs to a different or changed meeting/profile. Nothing was saved.",
      );
    if (
      !Array.isArray(input.sections) ||
      !input.sections.length ||
      input.sections.some(
        (section) =>
          !SUMMARY_SECTIONS.includes(section as SummarySection) ||
          !draft.sections.includes(section as SummarySection),
      ) ||
      typeof input.overwriteManual !== "boolean"
    )
      throw new Error("Choose the generated sections to save.");
    if (!this.meetings.value.preferences.enabled)
      throw new Error(
        "Enable authorised meeting persistence before saving generated content.",
      );
    const store = this.meetings.requireStore(),
      doc = await store.get(draft.meetingId!);
    if (
      this.binding !== binding ||
      this.state.draft !== draft ||
      this.meetings.value.locked ||
      store !== this.meetings.requireStore() ||
      binding.accountId !== this.connection().accountId
    )
      throw new Error(
        "The meeting/profile changed while applying the draft. Nothing was applied.",
      );
    if (doc.revision !== input.expectedRevision)
      throw new Error(
        "The meeting changed after this draft. Reload/review before applying; manual edits were not overwritten.",
      );
    const sections = [...new Set(input.sections)] as SummarySection[];
    if (
      input.overwriteManual !== true &&
      sections.some(
        (section) =>
          doc.editedSections.includes(section) ||
          (section === "actions" &&
            doc.actions.some((action) => action.authorship === "user")) ||
          (section === "decisions" &&
            doc.decisions.some((decision) => decision.authorship === "user")),
      )
    )
      throw new Error(
        "Some selected sections contain manual edits. Keep them or explicitly acknowledge replacing those sections.",
      );
    const summary: MeetingSummary = doc.summary ?? {
      overview: null,
      topics: [],
      points: [],
      outstanding: [],
      nextSteps: [],
      model: draft.summary.model,
      generatedAt: draft.summary.generatedAt,
    };
    for (const section of sections) {
      if (section === "actions") doc.actions = structuredClone(draft.actions);
      else if (section === "decisions")
        doc.decisions = structuredClone(draft.decisions);
      else if (section === "overview")
        summary.overview = structuredClone(draft.summary.overview);
      else summary[section] = structuredClone(draft.summary[section]);
    }
    summary.model = draft.summary.model;
    summary.generatedAt = draft.summary.generatedAt;
    doc.summary = summary;
    doc.editedSections = doc.editedSections.filter(
      (section) => !sections.includes(section as SummarySection),
    );
    const saved = await store.update(
      doc,
      doc.revision,
      this.meetings.value.preferences.retentionDays,
    );
    if (
      this.binding !== binding ||
      this.state.draft !== draft ||
      this.meetings.value.locked ||
      store !== this.meetings.requireStore() ||
      binding.accountId !== this.connection().accountId
    )
      throw new Error(
        "The meeting/profile changed while saving. Reopen its committed state; no old-profile result was returned.",
      );
    this.state.draft = null;
    this.state.status = "idle";
    this.publish();
    return saved;
  }
  cancel(
    reason = "Meeting AI cancelled. Already transmitted data cannot be recalled.",
  ): void {
    const binding = this.binding,
      id = this.state.requestId;
    this.binding = undefined;
    this.generation++;
    this.state.reviewId = null;
    this.state.requestId = null;
    this.state.draft = null;
    this.state.textDraft = null;
    this.state.status = "idle";
    this.state.error = null;
    if (
      id &&
      this.assistant.value.responses.some(
        (response) =>
          response.requestId === id &&
          ["sending", "generating"].includes(response.status),
      )
    )
      this.assistant.cancel();
    if (binding?.id === this.assistant.value.review?.requestId)
      this.assistant.discardReview();
    void reason;
    this.publish();
  }
  get temporarySegments(): MeetingSegment[] {
    const doc = this.temporaryDocument;
    return doc
      ? this.sources()
          .events.filter(
            (event) =>
              `temporary-${event.sessionId}` === doc.id &&
              event.state === "final" &&
              event.startMs >= this.temporaryCutoff,
          )
          .map((event) => ({ ...event, meetingId: doc.id }))
      : [];
  }
  async attachRetainedDraft(document: MeetingDocument): Promise<void> {
    const draft = this.state.draft,
      binding = this.binding;
    if (
      !draft ||
      !binding?.temporary ||
      binding.accountId !== this.connection().accountId
    )
      return;
    const store = this.meetings.requireStore(),
      old = binding.context.meetings[0]!.id;
    const convert = (ref: string) =>
      ref.startsWith(`${old}/`)
        ? `${document.id}${ref.slice(old.length)}`
        : ref;
    const refs = binding.context.excerpts.map((excerpt) =>
      convert(excerpt.ref),
    );
    const segments = await store.contextSegments(document.id, refs);
    if (
      this.binding !== binding ||
      this.state.draft !== draft ||
      this.meetings.value.locked ||
      store !== this.meetings.requireStore() ||
      binding.accountId !== this.connection().accountId ||
      !store.isCurrent(document.id, document.revision)
    )
      return;
    if (
      segments.length !== refs.length ||
      binding.context.excerpts.some(
        (excerpt) =>
          !segments.some(
            (segment) =>
              `${segment.meetingId}/${segment.sessionId}/${segment.id}` ===
                convert(excerpt.ref) && segment.text.startsWith(excerpt.text),
          ),
      )
    )
      return;
    const next = structuredClone(draft);
    next.meetingId = document.id;
    next.expectedRevision = document.revision;
    const evidence = (item: {
      evidence: import("../../shared/meetings").Evidence[];
    }) => {
      item.evidence = item.evidence.map((value) => ({
        ...value,
        ref: convert(value.ref),
      }));
    };
    if (next.summary.overview) evidence(next.summary.overview);
    for (const field of [
      "topics",
      "points",
      "outstanding",
      "nextSteps",
    ] as const)
      next.summary[field].forEach(evidence);
    next.actions.forEach(evidence);
    next.decisions.forEach(evidence);
    binding.profile = store;
    binding.temporary = false;
    binding.context.meetings = [
      {
        id: document.id,
        title: document.title,
        createdAt: document.createdAt,
        revision: document.revision,
      },
    ];
    binding.context.excerpts = binding.context.excerpts.map((excerpt) => ({
      ...excerpt,
      meetingId: document.id,
      ref: convert(excerpt.ref),
    }));
    this.state.draft = next;
    this.publish();
  }
  resetProfile(): void {
    this.temporaryCutoff = this.now();
    this.cancel(
      "History/account/lifecycle scope changed; earlier temporary context is excluded.",
    );
  }
}
