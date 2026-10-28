import type { TranscriptEvent } from "./transcription";
import { exactKeys, record } from "./validation";

export type MeetingStatus = "draft" | "active" | "ended" | "interrupted";
export type ActionStatus = "open" | "in-progress" | "completed" | "cancelled";
export type Authorship = "user" | "ai";
export interface MeetingPreferences {
  enabled: boolean;
  autoSave: boolean;
  retentionDays: 7 | 30 | 90 | null;
}
export const DEFAULT_MEETINGS: MeetingPreferences = {
  enabled: false,
  autoSave: false,
  retentionDays: 30,
};
export interface MeetingRun {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  sources: {
    kind: "screen" | "microphone" | "systemAudio";
    name: string;
    id: string | null;
  }[];
}
export interface Evidence {
  ref: string;
  quote: string;
}
export interface EvidenceText {
  text: string;
  evidence: Evidence[];
  uncertainty: "explicit" | "uncertain";
  authorship: Authorship;
}
export interface MeetingDecision extends EvidenceText {
  id: string;
  at: number | null;
}
export interface MeetingAction extends EvidenceText {
  id: string;
  owner: string | null;
  deadline: string | null;
  status: ActionStatus;
}
export interface MeetingSummary {
  overview: EvidenceText | null;
  topics: EvidenceText[];
  points: EvidenceText[];
  outstanding: EvidenceText[];
  nextSteps: EvidenceText[];
  model: string | null;
  generatedAt: number;
}
export interface MeetingDocument {
  id: string;
  title: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number;
  status: MeetingStatus;
  runs: MeetingRun[];
  notes: string;
  summary: MeetingSummary | null;
  actions: MeetingAction[];
  decisions: MeetingDecision[];
  tags: string[];
  editedSections: string[];
  updatedAt: number;
  revision: number;
  segmentCount: number;
}
export interface MeetingSegment extends TranscriptEvent {
  meetingId: string;
  speakerLabel?: string;
}
export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number;
  status: MeetingStatus;
  noteStatus: "none" | "manual" | "generated";
  actionCount: number;
  segmentCount: number;
  updatedAt: number;
  tags: string[];
  snippet?: string;
}
export interface MeetingQuery {
  query: string;
  tag: string;
  from: number | null;
  to: number | null;
  status: MeetingStatus | "all";
  sort: "newest" | "oldest" | "title";
  offset: number;
}
export const DEFAULT_MEETING_QUERY: MeetingQuery = {
  query: "",
  tag: "",
  from: null,
  to: null,
  status: "all",
  sort: "newest",
  offset: 0,
};
export interface MeetingPage {
  items: MeetingListItem[];
  nextOffset: number | null;
  scanned: number;
  partial: boolean;
}
export interface TranscriptPage {
  segments: MeetingSegment[];
  nextOffset: number | null;
}
export interface MeetingState {
  scopeId: string;
  revision: number;
  locked: boolean;
  profileLabel: string;
  preferences: MeetingPreferences;
  activeMeetingId: string | null;
  pendingResumeId: string | null;
  saving: boolean;
  error: string | null;
  status: string;
}
export const meetingId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(value))
    throw new Error("Invalid meeting or segment identifier.");
  return value;
};
export function boundedText(value: unknown, max: number, empty = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim()) ||
    value.includes("\0")
  )
    throw new Error("Invalid or oversized meeting text.");
  return value;
}
export function parseMeetingPreferences(value: unknown): MeetingPreferences {
  const input = record(value);
  exactKeys(input, ["enabled", "autoSave", "retentionDays"]);
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.autoSave !== "boolean" ||
    ![7, 30, 90, null].includes(input.retentionDays as number | null) ||
    (!input.enabled && input.autoSave)
  )
    throw new Error(
      "Choose valid meeting history, auto-save and retention settings.",
    );
  return { ...input } as unknown as MeetingPreferences;
}
export function parseMeetingQuery(value: unknown): MeetingQuery {
  const input = record(value);
  exactKeys(input, Object.keys(DEFAULT_MEETING_QUERY));
  boundedText(input.query, 200);
  boundedText(input.tag, 50);
  for (const key of ["from", "to"])
    if (
      input[key] !== null &&
      (typeof input[key] !== "number" ||
        !Number.isSafeInteger(input[key]) ||
        (input[key] as number) < 0)
    )
      throw new Error("Invalid meeting date filter.");
  if (
    input.from !== null &&
    input.to !== null &&
    (input.from as number) > (input.to as number)
  )
    throw new Error("Start date must precede end date.");
  if (
    !["all", "draft", "active", "ended", "interrupted"].includes(
      input.status as string,
    ) ||
    !["newest", "oldest", "title"].includes(input.sort as string) ||
    !Number.isSafeInteger(input.offset) ||
    (input.offset as number) < 0 ||
    (input.offset as number) > 201_000_000
  )
    throw new Error("Invalid meeting history query.");
  return { ...input } as unknown as MeetingQuery;
}
