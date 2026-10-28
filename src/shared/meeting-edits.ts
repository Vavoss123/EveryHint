import type { ActionStatus } from "./meetings";
import { boundedText, meetingId } from "./meetings";
import { exactKeys, record } from "./validation";
export interface UserActionEdit {
  id: string | null;
  text: string;
  owner: string | null;
  deadline: string | null;
  status: ActionStatus;
}
export interface UserDecisionEdit {
  id: string | null;
  text: string;
}
export interface MeetingEdit {
  id: string;
  expectedRevision: number;
  title?: string;
  notes?: string;
  tags?: string[];
  overview?: string;
  topics?: string[];
  points?: string[];
  outstanding?: string[];
  nextSteps?: string[];
  actions?: UserActionEdit[];
  decisions?: UserDecisionEdit[];
}
export function parseMeetingEdit(value: unknown): MeetingEdit {
  const input = record(value);
  exactKeys(input, [
    "id",
    "expectedRevision",
    "title",
    "notes",
    "tags",
    "overview",
    "topics",
    "points",
    "outstanding",
    "nextSteps",
    "actions",
    "decisions",
  ]);
  meetingId(input.id);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 1
  )
    throw new Error("Reload this meeting before editing.");
  for (const [field, max] of [
    ["title", 200],
    ["notes", 40000],
    ["overview", 4000],
  ] as const)
    if (input[field] !== undefined)
      boundedText(input[field], max, field !== "title");
  for (const [field, count, max] of [
    ["tags", 20, 50],
    ["topics", 30, 1000],
    ["points", 30, 1000],
    ["outstanding", 30, 1000],
    ["nextSteps", 30, 1000],
  ] as const) {
    if (input[field] !== undefined) {
      if (
        !Array.isArray(input[field]) ||
        (input[field] as unknown[]).length > count
      )
        throw new Error("Too many meeting notes/tags.");
      for (const text of input[field] as unknown[])
        boundedText(text, max, false);
    }
  }
  for (const field of ["actions", "decisions"] as const)
    if (input[field] !== undefined) {
      if (
        !Array.isArray(input[field]) ||
        (input[field] as unknown[]).length > 100
      )
        throw new Error("Too many action items or decisions.");
      const seen = new Set<string>();
      for (const item of input[field] as unknown[]) {
        const row = record(item);
        exactKeys(
          row,
          field === "actions"
            ? ["id", "text", "owner", "deadline", "status"]
            : ["id", "text"],
        );
        if (row.id !== null) {
          meetingId(row.id);
          if (seen.has(row.id as string))
            throw new Error("Duplicate meeting item ID.");
          seen.add(row.id as string);
        }
        boundedText(row.text, 2000, false);
        if (field === "actions") {
          if (row.owner !== null) boundedText(row.owner, 200, false);
          if (row.deadline !== null) boundedText(row.deadline, 200, false);
          if (
            !["open", "in-progress", "completed", "cancelled"].includes(
              row.status as string,
            )
          )
            throw new Error("Choose an action-item status.");
        }
      }
    }
  return structuredClone(input) as unknown as MeetingEdit;
}
