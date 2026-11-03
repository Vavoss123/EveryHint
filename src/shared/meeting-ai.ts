import type {
  MeetingAction,
  MeetingDecision,
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
  /** AI-suggested title, used for meetings that still have a generic title. */
  title?: string;
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
  summary: `Write clear, useful notes of this conversation, the way a sharp human note-taker would. Excerpts are in time order; source "microphone" is usually the user and "systemAudio" is usually the other people on a call, and speech recognition may contain mistakes. Return ONLY one JSON object with these keys: title (a short, specific title for the conversation, at most 8 words), overview (one item: two to four sentences on what the conversation was about and how it ended), topics (the main subjects discussed, each one sentence on what was said about it), points (important facts, numbers, answers and opinions worth remembering), decisions (what was agreed), actions (tasks someone took on), outstanding (open questions and unresolved issues), nextSteps (what happens next). Each item is ${evidenceSchema}: evidence holds one or two references whose quote is copied word for word from that excerpt (at least 12 characters), or [] when no single quote fits. uncertainty is "explicit" when clearly stated and "uncertain" when proposed or ambiguous. Actions also have owner and deadline (each a string stated in the transcript, otherwise null) and status "open". Use up to 10 items per list and leave a list empty rather than padding it. Write in plain language with no reference IDs in the text. Never invent facts, names, owners, deadlines or commitments.`,
  ask: "Answer the user's question about this conversation using its transcript excerpts and saved notes, plus earlier turns of this chat. Be direct, specific and concise; use short bullets when they help, and quote briefly when exact wording matters. Do not include excerpt reference IDs. If the conversation does not contain the answer, say so plainly and mention what was discussed instead. When asked to draft something, such as a follow-up email or a reply, write it directly. Do not invent decisions, participants, commitments, owners or dates. Source \"microphone\" is usually the user and \"systemAudio\" is usually the other people.",
  "follow-up":
    "Draft an editable follow-up email using only the selected meeting context. Include a brief recap, supported decisions/agreed actions and next steps; distinguish proposals and unknowns. Do not invent recipients, addresses, owners, deadlines or commitments. Start with a subject line; leave recipients empty. Cite supporting excerpt refs where useful. You cannot send an email or open applications.",
  "action-summary":
    "Summarise only actions explicitly agreed in the selected meeting excerpts. Cite excerpt refs. Show Unassigned and Not specified for missing owners/deadlines; distinguish proposals/uncertainty and never invent completion status or commitments.",
};
