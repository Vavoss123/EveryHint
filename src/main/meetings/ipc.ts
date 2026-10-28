import {
  boundedText,
  meetingId,
  parseMeetingQuery,
  type EvidenceText,
  type MeetingDocument,
} from "../../shared/meetings";
import { parseMeetingEdit } from "../../shared/meeting-edits";
import { exactKeys, record } from "../../shared/validation";
import { editMeeting } from "./edits";
import type { MeetingController } from "./controller";
import type { MeetingAIController } from "./ai";
import type { PostMeetingNotes } from "./post-notes";
import type { MeetingSharing } from "./sharing";

export function registerMeetingIPC(ports: {
  handle: (channel: string, action: (input: unknown) => unknown) => void;
  meetings: MeetingController;
  ai: MeetingAIController;
  post: PostMeetingNotes;
  sharing: MeetingSharing;
  snapshotAI: () => import("../../shared/meeting-ai").MeetingAIState;
  stop: () => void;
  cancelContent: () => void;
  revokeLive: () => void;
  changed: () => void;
}): void {
  const { handle, meetings, ai, post } = ports;
  const none = (value: unknown) => {
    if (value !== undefined)
      throw new Error("This meeting command takes no payload.");
  };
  function scoped(
    name: string,
    action: (value: unknown) => unknown,
    changesScope = false,
  ) {
    handle(`everyhint:meetings-${name}`, async (value) => {
      const envelope = record(value);
      exactKeys(envelope, ["scopeId", "input"]);
      if (envelope.scopeId !== meetings.value.scopeId)
        throw new Error(
          "The history profile changed. Refresh the view before continuing.",
        );
      const result = await action(envelope.input);
      if (!changesScope && envelope.scopeId !== meetings.value.scopeId)
        throw new Error(
          "History was locked or its profile changed during the operation. No old-profile content was returned.",
        );
      return result;
    });
  }
  handle("everyhint:meetings-state", (value) => {
    none(value);
    return meetings.value;
  });
  handle("everyhint:meeting-ai-state", (value) => {
    none(value);
    return ports.snapshotAI();
  });
  scoped("unlock", (value) => {
    none(value);
    return meetings.unlock();
  });
  scoped("export", (value) => ports.sharing.export(value));
  scoped("copy", (value) => ports.sharing.copy(value));
  scoped("email", (value) => ports.sharing.email(value));
  scoped("reference", async (value) => {
    const input = record(value);
    exactKeys(input, ["id", "ref"]);
    const segments = await meetings
      .requireStore()
      .contextSegments(meetingId(input.id), [
        boundedText(input.ref, 400, false),
      ]);
    if (!segments[0])
      throw new Error("The supporting transcript was removed or expired.");
    return segments[0];
  });
  scoped(
    "lock",
    (value) => {
      none(value);
      ports.cancelContent();
      meetings.lock();
    },
    true,
  );
  scoped("configure", async (value) => {
    post.revoke(
      "Meeting retention/persistence settings changed; remote permission was revoked.",
    );
    await meetings.configure(value);
    ports.changed();
  });
  scoped("create", async (value) => {
    const input = record(value);
    exactKeys(input, ["title", "acknowledged"]);
    if (input.acknowledged !== true)
      throw new Error("Acknowledge creating a locally saved meeting.");
    return meetings.create(boundedText(input.title, 200, false));
  });
  scoped("save-session", async (value) => {
    const doc = await meetings.saveRetained(value);
    await ai.attachRetainedDraft(doc);
    ports.changed();
    return doc;
  });
  scoped("list", (value) =>
    meetings.requireStore().list(parseMeetingQuery(value)),
  );
  scoped("find-transcript", (value) => {
    const input = record(value);
    exactKeys(input, ["id", "query", "offset"]);
    if (
      !Number.isSafeInteger(input.offset) ||
      (input.offset as number) < 0 ||
      (input.offset as number) > 20000
    )
      throw new Error("Invalid transcript search cursor.");
    return meetings
      .requireStore()
      .findTranscript(
        meetingId(input.id),
        boundedText(input.query, 200, false),
        input.offset as number,
      );
  });
  scoped("get", (value) => {
    const input = record(value);
    exactKeys(input, ["id"]);
    return meetings.requireStore().get(meetingId(input.id));
  });
  scoped("transcript", (value) => {
    const input = record(value);
    exactKeys(input, ["id", "offset"]);
    if (
      !Number.isSafeInteger(input.offset) ||
      (input.offset as number) < 0 ||
      (input.offset as number) > 20000
    )
      throw new Error("Invalid transcript page.");
    return meetings
      .requireStore()
      .transcript(meetingId(input.id), input.offset as number, 100);
  });
  scoped("temporary", (value) => {
    none(value);
    return { document: ai.temporaryDocument, segments: ai.temporarySegments };
  });
  scoped("edit", async (value) => {
    const input = parseMeetingEdit(value),
      store = meetings.requireStore(),
      current = await store.get(input.id),
      next = editMeeting(current, input);
    const saved = await store.update(
      next,
      input.expectedRevision,
      meetings.value.preferences.retentionDays,
    );
    ports.changed();
    return saved;
  });
  scoped("speaker-labels", async (value) => {
    const input = record(value);
    exactKeys(input, ["id", "expectedRevision", "labels"]);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      !Array.isArray(input.labels) ||
      input.labels.length > 100
    )
      throw new Error(
        "Choose current segments and user-provided speaker labels.",
      );
    const labels = input.labels.map((value) => {
      const label = record(value);
      exactKeys(label, ["ref", "label"]);
      return {
        ref: boundedText(label.ref, 400, false),
        label: boundedText(label.label, 80),
      };
    });
    const saved = await meetings
      .requireStore()
      .speakerLabels(
        meetingId(input.id),
        input.expectedRevision as number,
        labels,
        meetings.value.preferences.retentionDays,
      );
    ports.changed();
    return saved;
  });
  scoped("operation", async (value) => {
    const input = record(value);
    exactKeys(input, ["id", "expectedRevision", "action", "acknowledged"]);
    if (input.acknowledged !== true)
      throw new Error("Confirm this local data deletion explicitly.");
    const id = meetingId(input.id),
      store = meetings.requireStore(),
      doc = await store.get(id);
    if (doc.revision !== input.expectedRevision)
      throw new Error(
        "The meeting changed. Review its current data before deleting.",
      );
    if (doc.status === "active" || meetings.value.activeMeetingId === id)
      throw new Error(
        "End the active saved meeting before deleting its content.",
      );
    if (
      !["delete", "clear-transcript", "clear-generated"].includes(
        input.action as string,
      )
    )
      throw new Error("Choose an available local deletion action.");
    ports.cancelContent();
    if (input.action === "delete") {
      await store.delete(id);
      if (meetings.value.pendingResumeId === id) meetings.cancelResume();
    } else if (input.action === "clear-transcript")
      await store.clearTranscript(id, meetings.value.preferences.retentionDays);
    else {
      if (doc.summary) {
        const keep = (items: EvidenceText[]) =>
          items.filter((item) => item.authorship === "user");
        doc.summary = {
          ...doc.summary,
          overview:
            doc.summary.overview?.authorship === "user"
              ? doc.summary.overview
              : null,
          topics: keep(doc.summary.topics),
          points: keep(doc.summary.points),
          outstanding: keep(doc.summary.outstanding),
          nextSteps: keep(doc.summary.nextSteps),
          model: null,
        };
      }
      doc.actions = doc.actions.filter(
        (action) => action.authorship === "user",
      );
      doc.decisions = doc.decisions.filter(
        (decision) => decision.authorship === "user",
      );
      await store.update(
        doc,
        doc.revision,
        meetings.value.preferences.retentionDays,
      );
    }
    ports.changed();
  });
  scoped("delete-all", async (value) => {
    const input = record(value);
    exactKeys(input, ["acknowledged"]);
    if (input.acknowledged !== true)
      throw new Error(
        "Explicitly confirm deletion of all meetings in this local history profile.",
      );
    if (meetings.value.saving)
      throw new Error("End the active saved meeting first.");
    ports.cancelContent();
    await meetings.requireStore().deleteAll();
    meetings.cancelResume();
    ports.changed();
  });
  scoped("resume", (value) => meetings.resume(value));
  scoped("cancel-resume", (value) => {
    none(value);
    meetings.cancelResume();
  });
  scoped("end", async (value) => {
    none(value);
    const id = await post.end(ports.stop);
    ports.changed();
    return id;
  });
  scoped("ai-prepare", async (value) => {
    post.revoke(
      "A reviewed meeting request was chosen instead of automatic post-meeting notes.",
    );
    ports.revokeLive();
    return ai.prepare(value);
  });
  scoped("ai-ask", (value) => {
    ports.revokeLive();
    return ai.ask(value);
  });
  scoped("ai-apply", async (value) => {
    const saved = await ai.apply(value);
    ports.changed();
    return saved;
  });
  scoped("ai-cancel", (value) => {
    none(value);
    post.revoke();
    ai.cancel();
  });
  scoped("post-authorise", (value) => post.authorise(value));
  scoped("post-cancel", (value) => {
    none(value);
    post.revoke();
  });
}
export function hasGeneratedContent(doc: MeetingDocument): boolean {
  return Boolean(
    doc.summary ||
      doc.actions.some((item) => item.authorship === "ai") ||
      doc.decisions.some((item) => item.authorship === "ai"),
  );
}
