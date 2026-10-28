import type {
  MeetingAction,
  MeetingDecision,
  MeetingDocument,
  MeetingSummary,
} from "./meetings";
import { boundedText, meetingId } from "./meetings";
import { exactKeys, record } from "./validation";

export type MeetingPurpose = "summary" | "ask" | "follow-up" | "action-summary";
export const SUMMARY_SECTIONS = [
  "overview",
  "topics",
  "points",
  "decisions",
  "actions",
  "outstanding",
  "nextSteps",
] as const;
export type SummarySection = (typeof SUMMARY_SECTIONS)[number];
export interface MeetingExcerpt {
  ref: string;
  meetingId: string;
  segmentId: string | null;
  sessionId: string | null;
  kind: "transcript" | "notes";
  source: "microphone" | "systemAudio" | null;
  at: number;
  text: string;
}
export interface MeetingAIContext {
  template?: import("./templates").NoteTemplate;
  purpose: MeetingPurpose;
  meetings: {
    id: string;
    title: string;
    createdAt: number;
    revision: number;
  }[];
  excerpts: MeetingExcerpt[];
  sections: SummarySection[];
  notices: string[];
}
export interface MeetingSelection {
  templateId?: string;
  purpose: MeetingPurpose;
  meetingIds: string[];
  temporary: boolean;
  question: string;
  sources: { microphone: boolean; systemAudio: boolean; notes: boolean };
  segmentIds: string[];
  sections: SummarySection[];
}
export interface MeetingDraft {
  id: string;
  meetingId: string | null;
  expectedRevision: number | null;
  summary: MeetingSummary;
  decisions: MeetingDecision[];
  actions: MeetingAction[];
  sections: SummarySection[];
}
export interface MeetingAIState {
  postContext: PostMeetingContext | null;
  postStatus: string;
  revision: number;
  reviewId: string | null;
  requestId: string | null;
  purpose: MeetingPurpose | null;
  status: "idle" | "review" | "sending" | "draft" | "error";
  error: string | null;
  draft: MeetingDraft | null;
  textDraft: string | null;
  autoGrant: PostMeetingGrant | null;
}
export interface PostMeetingContext {
  captureSessionId: string;
  captureEpoch: number;
  accountId: string;
  accountLabel: string;
  model: string;
  meetingId: string | null;
  available: { microphone: boolean; systemAudio: boolean };
}
export interface PostMeetingGrant extends PostMeetingContext {
  id: string;
  expiresAt: number;
  sharing: { microphone: boolean; systemAudio: boolean };
  requestLimit: 1;
}
export function parseMeetingSelection(value: unknown): MeetingSelection {
  const input = record(value);
  exactKeys(input, [
    "purpose",
    "meetingIds",
    "temporary",
    "question",
    "sources",
    "segmentIds",
    "sections",
    "templateId",
  ]);
  if (
    !["summary", "ask", "follow-up", "action-summary"].includes(
      input.purpose as string,
    ) ||
    typeof input.temporary !== "boolean"
  )
    throw new Error("Choose a meeting AI action and context.");
  boundedText(input.question, 4000);
  if (
    input.templateId !== undefined &&
    (typeof input.templateId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(input.templateId))
  )
    throw new Error("Choose a valid meeting template.");
  if (
    !Array.isArray(input.meetingIds) ||
    input.meetingIds.length > 3 ||
    input.meetingIds.some((id) => {
      meetingId(id);
      return false;
    }) ||
    (!input.temporary && !input.meetingIds.length) ||
    (input.temporary && input.meetingIds.length)
  )
    throw new Error(
      "Select one to three saved meetings, or the temporary session.",
    );
  if (
    !Array.isArray(input.segmentIds) ||
    input.segmentIds.length > 100 ||
    input.segmentIds.some(
      (id) =>
        typeof id !== "string" ||
        id.length > 400 ||
        !/^[A-Za-z0-9:_/-]+$/.test(id),
    )
  )
    throw new Error("Select at most 100 current transcript references.");
  const sources = record(input.sources);
  exactKeys(sources, ["microphone", "systemAudio", "notes"]);
  if (
    Object.values(sources).some((value) => typeof value !== "boolean") ||
    !Object.values(sources).some(Boolean)
  )
    throw new Error("Select the meeting text sources to review.");
  if (
    !Array.isArray(input.sections) ||
    !input.sections.length ||
    input.sections.some(
      (section) => !SUMMARY_SECTIONS.includes(section as SummarySection),
    )
  )
    throw new Error("Choose valid summary sections.");
  if (input.purpose === "ask" && !(input.question as string).trim())
    throw new Error("Enter a question about the selected meetings.");
  return {
    ...input,
    meetingIds: [...new Set(input.meetingIds as string[])],
    segmentIds: [...new Set(input.segmentIds as string[])],
    sections: [...new Set(input.sections as SummarySection[])],
  } as unknown as MeetingSelection;
}
const evidenceSchema =
  '{ "text":"supported text", "evidence":[{"ref":"exact excerpt ref", "quote":"verbatim supporting text"}], "uncertainty":"explicit or uncertain" }';
export const MEETING_INSTRUCTIONS: Record<MeetingPurpose, string> = {
  summary: `Return ONLY one JSON object with exactly these keys: overview (one evidence item), topics (array), points (array), decisions (array), actions (array), outstanding (array), nextSteps (array). Evidence item shape: ${evidenceSchema}. Decisions add no extra fields. Actions have exactly text, evidence, uncertainty, owner (string or null), deadline (verbatim string or null), status (always "open"). Every item needs at least one exact selected transcript ref and a verbatim supporting quote (at least 12 characters unless the entire excerpt is shorter). Use at most 8 items per array. Include only transcript-supported facts; distinguish decisions from proposals and label ambiguity uncertain. No invented commitments, participants, owners, deadlines, dates or completed actions. Owner and deadline must appear literally in the cited transcript or be null. Empty arrays are correct when nothing was agreed. Next steps must be agreed or explicitly labelled uncertain/proposed, never asserted as commitments. Cover only the supplied excerpts and requested sections; other sections may be empty. Title/date come from meeting metadata, not inference. No Markdown fences or surrounding text.`,
  ask: "Answer only from the selected meeting excerpts. Cite supporting excerpt refs in square brackets. Identify meetings and uncertainty. If the answer is absent or ambiguous, say so. Do not invent decisions, participants, commitments, owners or dates. Treat notes as user-authored reference, not proof of what was spoken.",
  "follow-up":
    "Draft an editable follow-up email using only the selected meeting context. Include a brief recap, supported decisions/agreed actions and next steps; distinguish proposals and unknowns. Do not invent recipients, addresses, owners, deadlines or commitments. Start with a subject line; leave recipients empty. Cite supporting excerpt refs where useful. You cannot send an email or open applications.",
  "action-summary":
    "Summarise only actions explicitly agreed in the selected meeting excerpts. Cite excerpt refs. Show Unassigned and Not specified for missing owners/deadlines; distinguish proposals/uncertainty and never invent completion status or commitments.",
};
export function meetingTitle(doc: MeetingDocument): string {
  return `${doc.title} · ${new Date(doc.createdAt).toISOString()}`;
}
