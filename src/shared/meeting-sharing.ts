import { boundedText, meetingId } from "./meetings";
import { exactKeys, record } from "./validation";
export type MeetingExportFormat =
  | "transcript-txt"
  | "notes-md"
  | "meeting-json"
  | "summary-txt";
export type MeetingCopyKind = "summary" | "actions" | "transcript";
export interface MeetingShareInput {
  id: string;
  expectedRevision: number;
  acknowledged: boolean;
}
export interface MeetingExportInput extends MeetingShareInput {
  format: MeetingExportFormat;
}
export interface MeetingCopyInput extends MeetingShareInput {
  kind: MeetingCopyKind;
}
export interface MeetingEmailInput {
  to: string;
  subject: string;
  body: string;
  acknowledged: boolean;
}
export const EXPORT_FORMATS: Record<
  MeetingExportFormat,
  { label: string; extension: string }
> = {
  "transcript-txt": { label: "Plain text transcript", extension: "txt" },
  "notes-md": { label: "Markdown notes", extension: "md" },
  "meeting-json": { label: "Structured meeting JSON", extension: "json" },
  "summary-txt": { label: "Readable meeting summary", extension: "txt" },
};
export function parseMeetingShare(
  value: unknown,
  field: "format" | "kind",
): MeetingExportInput | MeetingCopyInput {
  const input = record(value);
  exactKeys(input, ["id", "expectedRevision", "acknowledged", field]);
  meetingId(input.id);
  if (input.acknowledged !== true)
    throw Error(
      "Acknowledge creating an unencrypted export or clipboard copy.",
    );
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 1
  )
    throw Error("Reload this meeting before sharing.");
  if (
    field === "format"
      ? !Object.hasOwn(EXPORT_FORMATS, input.format as string)
      : !["summary", "actions", "transcript"].includes(input.kind as string)
  )
    throw Error("Choose an available meeting export or copy format.");
  return { ...input } as unknown as MeetingExportInput | MeetingCopyInput;
}
export function meetingEmailURL(value: unknown): string {
  const input = record(value);
  exactKeys(input, ["to", "subject", "body", "acknowledged"]);
  if (input.acknowledged !== true)
    throw Error(
      "Approve handing this exact draft to your external email application first.",
    );
  const to = boundedText(input.to, 500),
    subject = boundedText(input.subject, 200),
    body = boundedText(input.body, 32000, false);
  if (/\p{Cc}/u.test(to + subject))
    throw Error("Recipients and subject cannot contain header controls.");
  const recipients = to.trim()
    ? to.split(",").map((value) => value.trim())
    : [];
  if (
    recipients.length > 5 ||
    recipients.some(
      (value) =>
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(
          value,
        ),
    )
  )
    throw Error(
      "Enter up to five explicit email addresses separated by commas, or leave recipients blank.",
    );
  const url = `mailto:${recipients.map((value) => encodeURIComponent(value)).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (url.length > 1800)
    throw Error(
      "This draft exceeds the conservative email-client link limit. Copy the complete draft into your email app instead; no text was truncated.",
    );
  return url;
}
