import type {
  EvidenceText,
  MeetingDocument,
  MeetingSegment,
} from "../../shared/meetings";
import type {
  KnowledgeDocument,
  KnowledgeSection,
} from "../../shared/knowledge";
import type { MemoryRecord, MemoryType, Person } from "../../shared/workspace";
import { opaqueId } from "../google/calendar";

/** Literal extraction only. It never reads temporary sessions or calls a model. */
export function meetingMemories(
  doc: MeetingDocument,
  segments: MeetingSegment[],
  people: Person[],
  now: number,
): MemoryRecord[] {
  if (doc.status !== "ended" && doc.status !== "interrupted")
    throw new Error("Choose an ended, explicitly saved meeting.");
  const source: MemoryRecord["source"] = {
    kind: "meeting",
    id: doc.id,
    revision: doc.revision,
    title: doc.title,
  };
  const personIds = people
    .filter((p) => p.meetingIds.includes(doc.id))
    .map((p) => p.id);
  const rows: MemoryRecord[] = [];
  function add(
    type: MemoryType,
    key: string,
    description: string,
    quote: string,
    ref: string,
    done = false,
  ) {
    if (!description.trim() || !quote.trim()) return;
    rows.push({
      id: opaqueId("memory", doc.id, type, key),
      type,
      description: description.slice(0, 800),
      quote: quote.slice(0, 1000),
      ref,
      source,
      createdAt: now,
      updatedAt: now,
      lastVerifiedAt: now,
      personIds,
      topics: doc.tags.slice(0, 10),
      status: done ? "done" : "open",
      review: "pending",
      authorship: "extracted",
    });
  }
  function evidenced(
    type: MemoryType,
    key: string,
    value: EvidenceText,
    done = false,
  ) {
    if (value.uncertainty !== "explicit") return;
    const evidence = value.evidence.find(
      (e) =>
        e.quote.trim() &&
        segments.some(
          (s) =>
            (e.ref === s.id ||
              e.ref === `${s.meetingId}/${s.sessionId}/${s.id}`) &&
            s.text.includes(e.quote),
        ),
    );
    if (evidence)
      add(type, key, value.text, evidence.quote, evidence.ref, done);
    else if (value.authorship === "user")
      add(
        type,
        key,
        value.text,
        value.text,
        `meeting:${doc.id}:${type}:${key}`,
        done,
      );
  }
  for (const d of doc.decisions.slice(0, 20)) evidenced("decision", d.id, d);
  for (const a of doc.actions.slice(0, 20))
    evidenced(
      "action",
      a.id,
      a,
      a.status === "completed" || a.status === "cancelled",
    );
  for (const [i, t] of (doc.summary?.topics ?? []).slice(0, 8).entries())
    evidenced("topic", String(i), t);
  for (const [i, t] of (doc.summary?.outstanding ?? []).slice(0, 8).entries())
    evidenced("commitment", String(i), t);
  for (const [i, t] of (doc.summary?.nextSteps ?? []).slice(0, 8).entries())
    evidenced("follow-up", String(i), t);
  if (doc.notes.trim())
    add("note", "notes", doc.notes, doc.notes, `meeting:${doc.id}:notes`);
  return rows;
}

export function documentMemories(
  doc: KnowledgeDocument,
  sections: KnowledgeSection[],
  now: number,
): MemoryRecord[] {
  if (!doc.enabled)
    throw new Error("Enable this knowledge document before extracting memory.");
  return sections
    .filter((s) => s.text.trim())
    .slice(0, 8)
    .map((s) => ({
      id: opaqueId("memory", doc.id, s.id),
      type: "project",
      description: s.text.slice(0, 800),
      quote: s.text.slice(0, 1000),
      ref: `doc:${doc.id}:${s.id}`,
      source: {
        kind: "document",
        id: doc.id,
        revision: doc.updatedAt,
        sectionId: s.id,
        title: doc.name,
      },
      createdAt: now,
      updatedAt: now,
      lastVerifiedAt: now,
      personIds: [],
      topics: [s.heading || doc.name].map((t) => t.slice(0, 100)),
      status: "open",
      review: "pending",
      authorship: "extracted",
    }));
}
