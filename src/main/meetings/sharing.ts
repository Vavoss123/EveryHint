import { open, unlink } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import type {
  MeetingDocument,
  MeetingSegment,
  EvidenceText,
} from "../../shared/meetings";
import {
  EXPORT_FORMATS,
  meetingEmailURL,
  parseMeetingShare,
  type MeetingCopyInput,
  type MeetingExportInput,
  type MeetingExportFormat,
} from "../../shared/meeting-sharing";
import type { MeetingController } from "./controller";
import type { MeetingStore } from "./store";

const stamp = (at: number) => new Date(at).toISOString();
const evidence = (item: EvidenceText) =>
  `${item.text}\n  [${item.authorship === "ai" ? "AI-generated; review required" : "User-authored/edited"}; ${item.uncertainty}]${item.evidence.map((source) => `\n  Source: ${source.ref}\n  Quote: ${source.quote}`).join("")}`;
const escaped = (value: string) =>
  value.replace(/([\\`*_{}[\]<>#!|])/g, "\\$1");
export function readableSummary(
  doc: MeetingDocument,
  includeNotes = false,
): string {
  const lines = [
    doc.title,
    `Date: ${stamp(doc.startedAt ?? doc.createdAt)}`,
    `Status: ${doc.status} | Duration: ${(doc.durationMs / 60000).toFixed(1)} minutes`,
    `Updated: ${stamp(doc.updatedAt)}`,
    "",
    "Scope: selected saved text only. AI-generated claims require review; supporting quotes are not independent fact verification.",
  ];
  if (doc.summary?.template) {
    lines.push("", `Template: ${doc.summary.template.name}`);
    for (const section of doc.summary.template.sections) {
      lines.push("", section.heading);
      if (section.source === "actions") lines.push(actionText(doc));
      else {
        const items =
          section.source === "decisions"
            ? doc.decisions
            : section.source === "overview"
              ? doc.summary.overview
                ? [doc.summary.overview]
                : []
              : doc.summary[section.source];
        lines.push(
          ...(items.length
            ? items.map((item) => evidence(item))
            : ["No supported content saved for this section."]),
        );
      }
    }
    if (includeNotes && doc.notes) lines.push("", "MANUAL NOTES", doc.notes);
    if (doc.tags.length) lines.push("", `Tags: ${doc.tags.join(", ")}`);
    return lines.join("\n") + "\n";
  }
  if (doc.summary?.overview)
    lines.push("", "OVERVIEW", evidence(doc.summary.overview));
  for (const [field, label] of [
    ["topics", "DISCUSSION TOPICS"],
    ["points", "IMPORTANT POINTS"],
    ["outstanding", "OUTSTANDING QUESTIONS"],
    ["nextSteps", "SUGGESTED NEXT STEPS"],
  ] as const)
    if (doc.summary?.[field].length)
      lines.push(
        "",
        label,
        ...doc.summary[field].map((item) => `- ${evidence(item)}`),
      );
  lines.push(
    "",
    "DECISIONS",
    ...(doc.decisions.length
      ? doc.decisions.map(
          (item) =>
            `- ${evidence(item)}${item.at === null ? "" : `\n  At: ${stamp(item.at)}`}`,
        )
      : ["No decisions saved."]),
    "",
    "ACTION ITEMS",
    actionText(doc),
  );
  if (includeNotes && doc.notes) lines.push("", "MANUAL NOTES", doc.notes);
  if (doc.tags.length) lines.push("", `Tags: ${doc.tags.join(", ")}`);
  return lines.join("\n") + "\n";
}
export function actionText(doc: MeetingDocument): string {
  return doc.actions.length
    ? doc.actions
        .map(
          (item) =>
            `- ${evidence(item)}\n  Owner: ${item.owner ?? "Unassigned"} | Deadline: ${item.deadline ?? "Not specified"} | Status: ${item.status}`,
        )
        .join("\n")
    : "No agreed action items saved.";
}
export function transcriptText(segment: MeetingSegment): string {
  return `[${stamp(segment.startMs)} – ${stamp(segment.endMs)}] ${segment.source === "microphone" ? "Microphone" : "System audio (identity unknown)"}${segment.speakerLabel ? ` | User label: ${segment.speakerLabel}` : ""}\nReference: ${segment.meetingId}/${segment.sessionId}/${segment.id}\n${segment.text}\n\n`;
}
export async function* exportMeeting(
  store: MeetingStore,
  doc: MeetingDocument,
  format: MeetingExportFormat,
): AsyncGenerator<string> {
  if (format === "summary-txt") {
    yield readableSummary(doc);
    return;
  }
  if (format === "notes-md") {
    yield `# ${escaped(doc.title)}\n\nDate: ${stamp(doc.startedAt ?? doc.createdAt)}  \nStatus: ${doc.status}  \nDuration: ${(doc.durationMs / 60000).toFixed(1)} minutes\n\n## Notes and intelligence\n\n${escaped(readableSummary(doc, true))}\n`;
    return;
  }
  if (format === "meeting-json")
    yield `${JSON.stringify({ format: "EveryHint meeting export", version: 1, exportedAt: Date.now(), meeting: doc }).slice(0, -1)},"segments":[`;
  else
    yield `${doc.title}\nFinal transcript · ${doc.segmentCount} segments\nMicrophone/system labels do not identify participants. Capture segments remain separate.\n\n`;
  let offset: number | null = 0,
    first = true,
    count = 0;
  while (offset !== null) {
    const page = await store.transcript(doc.id, offset, 100);
    for (const segment of page.segments) {
      count++;
      if (format === "meeting-json") {
        yield `${first ? "" : ","}${JSON.stringify(segment)}`;
        first = false;
      } else yield transcriptText(segment);
    }
    offset = page.nextOffset;
  }
  if (count !== doc.segmentCount)
    throw Error(
      "The transcript changed during export. Reopen it and try again.",
    );
  if (format === "meeting-json") yield "]}\n";
}
export class MeetingSharing {
  private busy = false;
  constructor(
    private readonly meetings: MeetingController,
    private readonly ports: {
      choose: (
        suggested: string,
        extension: string,
        label: string,
      ) => Promise<string | null>;
      clipboard: (text: string) => void;
      email: (url: string) => Promise<void>;
    },
  ) {}
  private async snapshot(value: unknown, field: "format" | "kind") {
    const input = parseMeetingShare(value, field),
      store = this.meetings.requireStore(),
      scope = this.meetings.value.scopeId,
      doc = await store.get(input.id);
    if (doc.revision !== input.expectedRevision)
      throw Error("This meeting changed. Reload it before sharing.");
    const valid = () =>
      !this.meetings.value.locked &&
      this.meetings.value.scopeId === scope &&
      store.isCurrent(doc.id, doc.revision);
    if (!valid()) throw Error("Meeting sharing scope changed.");
    return { input, store, doc, valid };
  }
  async export(
    value: unknown,
  ): Promise<{ cancelled: boolean; name: string | null; bytes: number }> {
    if (this.busy)
      throw Error("Finish the current export or sharing action first.");
    this.busy = true;
    let file: Awaited<ReturnType<typeof open>> | undefined,
      path: string | undefined,
      created = false;
    try {
      const {
          input: parsed,
          store,
          doc,
          valid,
        } = await this.snapshot(value, "format"),
        input = parsed as MeetingExportInput,
        format = EXPORT_FORMATS[input.format],
        safeTitle =
          doc.title
            .replace(/[<>:"/\\|?*]|\p{Cc}/gu, "_")
            .slice(0, 80)
            .replace(/[. ]+$/g, "") || "meeting";
      const chosen = await this.ports.choose(
        `EveryHint - ${safeTitle}.${format.extension}`,
        format.extension,
        format.label,
      );
      if (chosen === null) return { cancelled: true, name: null, bytes: 0 };
      if (!valid())
        throw Error(
          "History/meeting changed while the save dialog was open. Nothing was exported.",
        );
      if (
        !isAbsolute(chosen) ||
        chosen.startsWith("\\\\.\\") ||
        chosen.startsWith("\\\\?\\")
      )
        throw Error("Choose a regular file in the save dialog.");
      path = chosen;
      try {
        file = await open(path, "wx", 0o600);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw Error(
            "That file already exists. Choose a new filename; existing exports are preserved.",
            { cause: error },
          );
        throw Error("The chosen export file could not be created.", {
          cause: error,
        });
      }
      let bytes = 0;
      for await (const chunk of exportMeeting(store, doc, input.format)) {
        if (!valid())
          throw Error(
            "The meeting/profile changed during export. The incomplete new export was removed.",
          );
        await file.writeFile(chunk, "utf8");
        bytes += Buffer.byteLength(chunk);
      }
      if (!valid()) throw Error("The meeting/profile changed during export.");
      await file.sync();
      await file.close();
      file = undefined;
      if (!valid())
        throw Error(
          "The meeting/profile changed while the file was being saved.",
        );
      created = false;
      return { cancelled: false, name: basename(path), bytes };
    } catch (error) {
      if (file) {
        await file.close().catch(() => {});
      }
      if (created && path) {
        try {
          await unlink(path);
        } catch {
          throw Error(
            "Export failed and its incomplete plaintext file could not be removed. Remove the file you selected in the save dialog manually.",
          );
        }
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async copy(value: unknown): Promise<void> {
    if (this.busy)
      throw Error("Finish the current export or sharing action first.");
    this.busy = true;
    try {
      const {
          input: parsed,
          store,
          doc,
          valid,
        } = await this.snapshot(value, "kind"),
        input = parsed as MeetingCopyInput;
      let text =
        input.kind === "summary"
          ? readableSummary(doc)
          : input.kind === "actions"
            ? actionText(doc)
            : "";
      if (input.kind === "transcript")
        for await (const chunk of exportMeeting(store, doc, "transcript-txt")) {
          text += chunk;
          if (text.length > 1_000_000)
            throw Error(
              "This transcript is too large for clipboard sharing. Use the streaming text export instead.",
            );
          if (!valid())
            throw Error("The meeting/profile changed before copying.");
        }
      if (!valid()) throw Error("The meeting/profile changed before copying.");
      this.ports.clipboard(text);
    } finally {
      this.busy = false;
    }
  }
  async email(value: unknown): Promise<void> {
    const url = meetingEmailURL(value);
    await this.ports.email(url);
  }
}
