import { randomUUID } from "node:crypto";
import { exactKeys, record } from "../../shared/validation";
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

export const MAX_MEETING_CONTEXT_CHARS = 12000;
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
  const terms = new Set(
    selection.question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [],
  );
  candidates.sort((a, b) => {
    const score = (excerpt: MeetingExcerpt) =>
      [...terms].filter((term) => excerpt.text.toLowerCase().includes(term))
        .length;
    return score(b) - score(a) || b.at - a.at;
  });
  if (selection.sources.notes && selection.purpose !== "summary")
    for (const doc of documents)
      if (doc.notes.trim())
        candidates.unshift({
          ref: `${doc.id}/notes`,
          meetingId: doc.id,
          segmentId: null,
          sessionId: null,
          kind: "notes",
          source: null,
          at: doc.updatedAt,
          text: doc.notes,
        });
  const excerpts: MeetingExcerpt[] = [];
  let chars = 0;
  for (const candidate of candidates) {
    if (excerpts.length >= 100) break;
    const left = MAX_MEETING_CONTEXT_CHARS - chars;
    if (left < 40) break;
    const text = candidate.text.slice(0, left);
    if (JSON.stringify([...excerpts, { ...candidate, text }]).length > 14500)
      break;
    excerpts.push({ ...candidate, text });
    chars += text.length;
  }
  if (
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
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
  let input: Record<string, unknown>;
  try {
    input = record(JSON.parse(trimmed));
  } catch {
    throw new Error(
      "The provider did not return a valid structured meeting draft. Nothing was saved; review the response or request regeneration explicitly.",
    );
  }
  exactKeys(input, [
    "overview",
    "topics",
    "points",
    "decisions",
    "actions",
    "outstanding",
    "nextSteps",
  ]);
  const byRef = new Map(
    context.excerpts
      .filter((excerpt) => excerpt.kind === "transcript")
      .map((excerpt) => [excerpt.ref, excerpt]),
  );
  function evidence(value: unknown): Evidence[] {
    if (!Array.isArray(value) || !value.length || value.length > 8)
      throw new Error(
        "Every generated claim needs selected transcript evidence.",
      );
    return value.map((item) => {
      const ref = record(item);
      exactKeys(ref, ["ref", "quote"]);
      const excerpt = byRef.get(ref.ref as string),
        quote = boundedText(ref.quote, 1000, false);
      if (
        !excerpt ||
        quote.trim().length < Math.min(12, excerpt.text.trim().length) ||
        !excerpt.text.includes(quote)
      )
        throw new Error(
          "Generated evidence did not match the selected transcript. Nothing was saved.",
        );
      return { ref: ref.ref as string, quote };
    });
  }
  function item(value: unknown, action = false): EvidenceText {
    const row = record(value);
    exactKeys(
      row,
      action
        ? ["text", "evidence", "uncertainty", "owner", "deadline", "status"]
        : ["text", "evidence", "uncertainty"],
    );
    if (row.uncertainty !== "explicit" && row.uncertainty !== "uncertain")
      throw new Error("Generated claims must state uncertainty.");
    return {
      text: boundedText(row.text, 2000, false),
      evidence: evidence(row.evidence),
      uncertainty: row.uncertainty,
      authorship: "ai",
    };
  }
  function array(value: unknown): unknown[] {
    if (!Array.isArray(value) || value.length > 12)
      throw new Error("Invalid meeting draft section.");
    return value;
  }
  const decisions = array(input.decisions).map((value) => {
    const claim = item(value);
    return {
      ...claim,
      id: randomUUID(),
      at: byRef.get(claim.evidence[0]!.ref)!.at,
    };
  });
  const actions = array(input.actions).map((value) => {
    const row = record(value),
      claim = item(value, true),
      quotes = claim.evidence.map((ref) => ref.quote).join("\n");
    function explicit(value: unknown): string | null {
      if (value === null) return null;
      const text = boundedText(value, 200, false);
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        "iu",
      ).test(quotes)
        ? text
        : null;
    }
    if (row.status !== "open")
      throw new Error("Generated action items must begin Open until reviewed.");
    return {
      ...claim,
      id: randomUUID(),
      owner: explicit(row.owner),
      deadline: explicit(row.deadline),
      status: "open" as const,
    };
  });
  return {
    id: randomUUID(),
    meetingId: context.meetings.length === 1 ? context.meetings[0]!.id : null,
    expectedRevision:
      context.meetings.length === 1 ? context.meetings[0]!.revision : null,
    sections: context.sections,
    summary: {
      ...(context.template
        ? { template: structuredClone(context.template) }
        : {}),
      overview: item(input.overview),
      topics: array(input.topics).map((value) => item(value)),
      points: array(input.points).map((value) => item(value)),
      outstanding: array(input.outstanding).map((value) => item(value)),
      nextSteps: array(input.nextSteps).map((value) => item(value)),
      model,
      generatedAt: now,
    },
    decisions,
    actions,
  };
}
