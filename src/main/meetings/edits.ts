import { randomUUID } from "node:crypto";
import type { MeetingEdit } from "../../shared/meeting-edits";
import type {
  EvidenceText,
  MeetingDocument,
  MeetingSummary,
} from "../../shared/meetings";

export function editMeeting(
  current: MeetingDocument,
  input: MeetingEdit,
): MeetingDocument {
  if (current.id !== input.id || current.revision !== input.expectedRevision)
    throw new Error(
      "This meeting changed. Reload before saving; your draft was not overwritten.",
    );
  const doc = structuredClone(current),
    edited = new Set(doc.editedSections);
  if (input.title !== undefined) doc.title = input.title.trim();
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.tags !== undefined)
    doc.tags = [
      ...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
    ];
  const user = (text: string, previous?: EvidenceText): EvidenceText => ({
    text,
    evidence: previous?.evidence ?? [],
    uncertainty: previous?.uncertainty ?? "uncertain",
    authorship: "user",
  });
  const summary: MeetingSummary = doc.summary ?? {
    overview: null,
    topics: [],
    points: [],
    outstanding: [],
    nextSteps: [],
    model: null,
    generatedAt: 0,
  };
  if (
    input.overview !== undefined &&
    input.overview !== (summary.overview?.text ?? "")
  ) {
    summary.overview = input.overview.trim()
      ? user(input.overview, summary.overview ?? undefined)
      : null;
    edited.add("overview");
    doc.summary = summary;
  }
  for (const field of ["topics", "points", "outstanding", "nextSteps"] as const)
    if (
      input[field] !== undefined &&
      JSON.stringify(input[field]) !==
        JSON.stringify(summary[field].map((item) => item.text))
    ) {
      summary[field] = input[field]!.map((text) => {
        const prior = summary[field].find((item) => item.text === text);
        return prior ?? user(text);
      });
      edited.add(field);
      doc.summary = summary;
    }
  if (input.actions !== undefined) {
    const before = doc.actions.map(({ id, text, owner, deadline, status }) => ({
      id,
      text,
      owner,
      deadline,
      status,
    }));
    if (JSON.stringify(before) !== JSON.stringify(input.actions)) {
      doc.actions = input.actions.map((action) => {
        const previous = doc.actions.find((item) => item.id === action.id);
        if (
          previous &&
          previous.text === action.text &&
          previous.owner === action.owner &&
          previous.deadline === action.deadline &&
          previous.status === action.status
        )
          return previous;
        return {
          ...user(action.text, previous),
          id: previous?.id ?? randomUUID(),
          owner: action.owner,
          deadline: action.deadline,
          status: action.status,
        };
      });
      edited.add("actions");
    }
  }
  if (input.decisions !== undefined) {
    const before = doc.decisions.map(({ id, text }) => ({ id, text }));
    if (JSON.stringify(before) !== JSON.stringify(input.decisions)) {
      doc.decisions = input.decisions.map((decision) => {
        const previous = doc.decisions.find((item) => item.id === decision.id);
        if (previous && previous.text === decision.text) return previous;
        return {
          ...user(decision.text, previous),
          id: previous?.id ?? randomUUID(),
          at: previous?.at ?? null,
        };
      });
      edited.add("decisions");
    }
  }
  doc.editedSections = [...edited];
  return doc;
}
