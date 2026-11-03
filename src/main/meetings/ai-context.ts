import { randomUUID } from "node:crypto";
import { record } from "../../shared/validation";
import {
  boundedText,
  type Evidence,
  type EvidenceText,
  type MeetingDocument,
  type MeetingSegment,
} from "../../shared/meetings";
import type {
  MeetingAIContext,
  MeetingDraft,
  MeetingSelection,
  MeetingExcerpt,
} from "../../shared/meeting-ai";

export const MAX_MEETING_CONTEXT_CHARS = 30000;
export const MAX_SUMMARY_CONTEXT_CHARS = 60000;
/** Saved AI notes as plain text, so questions can use them. */
export function summaryText(
  doc: Pick<MeetingDocument, "summary" | "decisions" | "actions">,
): string {
  const lines: string[] = [];
  const section = (title: string, items: { text: string }[]) => {
    if (items.length)
      lines.push(title + ":", ...items.map((item) => "- " + item.text));
  };
  if (doc.summary?.overview)
    lines.push("Summary: " + doc.summary.overview.text);
  section("Topics", doc.summary?.topics ?? []);
  section("Key points", doc.summary?.points ?? []);
  section("Decisions", doc.decisions);
  section(
    "Action items",
    doc.actions.map((action) => ({
      text: [action.text, action.owner, action.deadline]
        .filter(Boolean)
        .join(" · "),
    })),
  );
  section("Open questions", doc.summary?.outstanding ?? []);
  section("Next steps", doc.summary?.nextSteps ?? []);
  return lines.length ? "AI notes:\n" + lines.join("\n") : "";
}
export function excerptReference(segment: MeetingSegment): string {
  return `${segment.meetingId}/${segment.sessionId}/${segment.id}`;
}
export function buildMeetingContext(
  documents: MeetingDocument[],
  segments: readonly MeetingSegment[],
  selection: MeetingSelection,
): MeetingAIContext {
  const allowed = new Set(documents.map((doc) => doc.id)),
    selected = new Set(selection.segmentIds),
    notices: string[] = [];
  const candidates: MeetingExcerpt[] = segments
    .filter(
      (segment) =>
        segment.state === "final" &&
        allowed.has(segment.meetingId) &&
        selection.sources[segment.source] &&
        (!selected.size || selected.has(excerptReference(segment))),
    )
    .map((segment) => ({
      ref: excerptReference(segment),
      meetingId: segment.meetingId,
      segmentId: segment.id,
      sessionId: segment.sessionId,
      kind: "transcript",
      source: segment.source,
      at: segment.startMs,
      text: segment.text,
    }));
  if (
    selected.size &&
    [...selected].some(
      (ref) => !candidates.some((excerpt) => excerpt.ref === ref),
    )
  )
    throw new Error(
      "A selected excerpt is unavailable, excluded or from a different meeting. Select current references again.",
    );
  // Summaries cover the whole meeting; questions favour relevant excerpts.
  const limits =
    selection.purpose === "summary"
      ? { count: 1500, chars: MAX_SUMMARY_CONTEXT_CHARS }
      : { count: 600, chars: MAX_MEETING_CONTEXT_CHARS };
  const total = candidates.reduce((sum, c) => sum + c.text.length, 0);
  let thinned = false;
  if (selection.purpose === "summary" || total <= limits.chars) {
    candidates.sort((a, b) => a.at - b.at || a.ref.localeCompare(b.ref));
    // Too long to include whole: keep an even spread across the timeline.
    if (total > limits.chars) {
      const keep = Math.max(
        1,
        Math.floor((limits.chars / total) * candidates.length),
      );
      const step = candidates.length / keep;
      const spread = Array.from(
        { length: keep },
        (_, k) => candidates[Math.floor(k * step)]!,
      );
      candidates.splice(0, candidates.length, ...spread);
      thinned = true;
    }
  } else {
    const terms = new Set(
      selection.question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [],
    );
    const score = (excerpt: MeetingExcerpt) =>
      [...terms].filter((term) => excerpt.text.toLowerCase().includes(term))
        .length;
    candidates.sort((a, b) => score(b) - score(a) || b.at - a.at);
  }
  if (selection.sources.notes && selection.purpose !== "summary")
    for (const doc of documents) {
      const notes = [
        doc.notes.trim() ? `Your notes:\n${doc.notes.trim()}` : "",
        summaryText(doc),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (notes)
        candidates.unshift({
          ref: `${doc.id}/notes`,
          meetingId: doc.id,
          segmentId: null,
          sessionId: null,
          kind: "notes",
          source: null,
          at: doc.updatedAt,
          text: notes,
        });
    }
  const excerpts: MeetingExcerpt[] = [];
  let chars = 0,
    serialized = 2;
  for (const candidate of candidates) {
    if (excerpts.length >= limits.count) break;
    const left = limits.chars - chars;
    if (left < 40) break;
    const excerpt = { ...candidate, text: candidate.text.slice(0, left) };
    const size = JSON.stringify(excerpt).length + 1;
    if (serialized + size > limits.chars * 1.4) break;
    excerpts.push(excerpt);
    chars += excerpt.text.length;
    serialized += size;
  }
  if (
    thinned ||
    excerpts.length < candidates.length ||
    excerpts.some(
      (excerpt) =>
        excerpt.text.length <
        (candidates.find((candidate) => candidate.ref === excerpt.ref)?.text
          .length ?? 0),
    )
  )
    notices.push(
      "Only a bounded selection of available excerpts is included; this is not necessarily the full meeting. Review the exact text below.",
    );
  if (
    !excerpts.length ||
    excerpts
      .map((excerpt) => excerpt.text)
      .join(" ")
      .trim().length < 20
  )
    throw new Error(
      "No meaningful selected meeting text is available. No remote request was prepared.",
    );
  if (
    selection.purpose === "summary" &&
    !excerpts.some((excerpt) => excerpt.kind === "transcript")
  )
    throw new Error(
      "A grounded summary requires selected final transcript text.",
    );
  if (selection.temporary)
    notices.push(
      "Temporary session: only currently retained final text is available. No meeting is saved by this request.",
    );
  notices.push(
    "Generated claims require your review. Exact supporting quotes do not establish semantic accuracy. Manual edits are never overwritten automatically.",
  );
  return {
    purpose: selection.purpose,
    meetings: documents.map(({ id, title, createdAt, revision }) => ({
      id,
      title,
      createdAt,
      revision,
    })),
    excerpts: excerpts.sort(
      (a, b) => a.at - b.at || a.ref.localeCompare(b.ref),
    ),
    sections: selection.sections,
    notices,
  };
}
export function parseMeetingDraft(
  text: string,
  context: MeetingAIContext,
  model: string | null,
  now: number,
): MeetingDraft {
  if (text.length > 32000)
    throw new Error("Meeting draft exceeded the response limit.");
  // Accept a fenced block or surrounding prose around the JSON object.
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1");
  const first = trimmed.indexOf("{"),
    last = trimmed.lastIndexOf("}");
  let input: Record<string, unknown>;
  try {
    input = record(JSON.parse(trimmed.slice(first, last + 1)));
  } catch {
    throw new Error(
      "The AI did not return notes in the expected format. Nothing was saved; try generating the notes again.",
    );
  }
  const byRef = new Map(
    context.excerpts
      .filter((excerpt) => excerpt.kind === "transcript")
      .map((excerpt) => [excerpt.ref, excerpt]),
  );
  const transcript = context.excerpts
    .filter((excerpt) => excerpt.kind === "transcript")
    .map((excerpt) => excerpt.text)
    .join("\n");
  // Quotes must be verbatim from their excerpt; unverifiable ones are dropped
  // rather than discarding the whole draft.
  function evidence(value: unknown): Evidence[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const ref = (item as Record<string, unknown>).ref,
        quote = (item as Record<string, unknown>).quote;
      const excerpt = typeof ref === "string" ? byRef.get(ref) : undefined;
      if (!excerpt || typeof quote !== "string") return [];
      const exact = quote.trim().slice(0, 1000);
      return exact.length >= Math.min(12, excerpt.text.trim().length) &&
        excerpt.text.includes(exact)
        ? [{ ref: excerpt.ref, quote: exact }]
        : [];
    });
  }
  function item(value: unknown): EvidenceText | null {
    if (typeof value === "string") value = { text: value };
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    if (typeof row.text !== "string" || !row.text.trim()) return null;
    return {
      text: boundedText(row.text.trim(), 2000, false),
      evidence: evidence(row.evidence),
      uncertainty: row.uncertainty === "uncertain" ? "uncertain" : "explicit",
      authorship: "ai",
    };
  }
  function list(value: unknown): EvidenceText[] {
    return Array.isArray(value)
      ? value
          .slice(0, 12)
          .map((entry) => item(entry))
          .filter((entry): entry is EvidenceText => entry !== null)
      : [];
  }
  // An owner or deadline is kept only when it is stated in the transcript.
  function stated(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) return null;
    const text = value.trim().slice(0, 200);
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(transcript)
      ? text
      : null;
  }
  const decisions = list(input.decisions).map((claim) => ({
    ...claim,
    id: randomUUID(),
    at: claim.evidence[0] ? byRef.get(claim.evidence[0].ref)!.at : null,
  }));
  const actions = (Array.isArray(input.actions) ? input.actions : [])
    .slice(0, 12)
    .flatMap((value) => {
      const claim = item(value);
      if (!claim) return [];
      const row = value as Record<string, unknown>;
      return [
        {
          ...claim,
          id: randomUUID(),
          owner: stated(row.owner),
          deadline: stated(row.deadline),
          status: "open" as const,
        },
      ];
    });
  const summary = {
    overview: item(input.overview),
    topics: list(input.topics),
    points: list(input.points),
    outstanding: list(input.outstanding),
    nextSteps: list(input.nextSteps),
  };
  if (
    !summary.overview &&
    !decisions.length &&
    !actions.length &&
    !Object.values(summary).some((v) => Array.isArray(v) && v.length)
  )
    throw new Error("The AI returned empty notes. Nothing was saved.");
  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim().replace(/\s+/g, " ").slice(0, 120)
      : undefined;
  return {
    id: randomUUID(),
    ...(title ? { title } : {}),
    meetingId: context.meetings.length === 1 ? context.meetings[0]!.id : null,
    expectedRevision:
      context.meetings.length === 1 ? context.meetings[0]!.revision : null,
    sections: context.sections,
    summary: {
      ...(context.template
        ? { template: structuredClone(context.template) }
        : {}),
      ...summary,
      model,
      generatedAt: now,
    },
    decisions,
    actions,
  };
}
