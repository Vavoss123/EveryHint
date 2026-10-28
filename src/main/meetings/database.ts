import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { MeetingCipher } from "./crypto";
import {
  meetingId,
  type MeetingDocument,
  type MeetingRun,
  type MeetingSegment,
  type MeetingQuery,
  type MeetingPage,
  type MeetingListItem,
  type TranscriptPage,
} from "../../shared/meetings";
import type { TranscriptEvent } from "../../shared/transcription";

const SCHEMA_VERSION = 2;
type Row = Record<string, string | number | null | Uint8Array>;
export class MeetingDatabase {
  private db: DatabaseSync;
  private cipher: MeetingCipher;
  private searchState: { signature: string; ids: string[] } | null = null;
  constructor(
    path: string,
    key: Uint8Array,
    profile: string,
    private readonly now: () => number = Date.now,
  ) {
    this.cipher = new MeetingCipher(key, profile);
    try {
      this.db = new DatabaseSync(path, {
        timeout: 2000,
        enableForeignKeyConstraints: true,
        allowExtension: false,
      });
    } catch (error) {
      this.cipher.close();
      throw new Error(
        "History file could not be opened. Existing data was preserved.",
        { cause: error },
      );
    }
    try {
      if (
        (this.db.prepare("PRAGMA quick_check").get() as Row).quick_check !==
        "ok"
      )
        throw new Error("Corrupt history.");
      const version = Number(
        (this.db.prepare("PRAGMA user_version").get() as Row).user_version,
      );
      if (version > SCHEMA_VERSION) throw new Error("Newer history schema.");
      if (version > 0) {
        const existing = this.db
          .prepare("SELECT value FROM secrets WHERE id='key-check'")
          .get() as Row | undefined;
        if (
          !existing ||
          this.cipher.open<string>(
            existing.value as Uint8Array,
            "key-check",
          ) !== "EveryHint history key verified"
        )
          throw new Error("Wrong history key.");
      }
      this.db.exec(
        "PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF;",
      );
      if (version < SCHEMA_VERSION) this.migrate(version);
      const check = this.db
        .prepare("SELECT value FROM secrets WHERE id='key-check'")
        .get() as Row | undefined;
      if (check) {
        if (
          this.cipher.open<string>(check.value as Uint8Array, "key-check") !==
          "EveryHint history key verified"
        )
          throw new Error("Wrong history key.");
      } else {
        if (
          (this.db.prepare("SELECT count(*) AS n FROM meetings").get() as Row)
            .n !== 0
        )
          throw new Error("Missing history key check.");
        this.db
          .prepare("INSERT INTO secrets(id,value) VALUES('key-check',?)")
          .run(this.cipher.seal("EveryHint history key verified", "key-check"));
      }
    } catch {
      this.db.close();
      this.cipher.close();
      throw new Error(
        "History could not be opened safely (key, corruption or schema problem). The database was preserved; no reset was performed.",
      );
    }
  }
  private migrate(version: number): void {
    this.transaction(() => {
      if (version < 1)
        this.db.exec(`
        CREATE TABLE secrets(id TEXT PRIMARY KEY, value BLOB NOT NULL) STRICT;
        CREATE TABLE meetings(id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL, started INTEGER, ended INTEGER, status TEXT NOT NULL, revision INTEGER NOT NULL, expiry INTEGER, payload BLOB NOT NULL) STRICT;
        CREATE TABLE segments(meeting TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, session TEXT NOT NULL, id TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(meeting,session,id)) STRICT;
        PRAGMA user_version=1;
      `);
      if (version < 2)
        this.db.exec(
          `CREATE INDEX IF NOT EXISTS meetings_updated ON meetings(updated,id); CREATE INDEX IF NOT EXISTS meetings_expiry ON meetings(expiry); CREATE INDEX IF NOT EXISTS segments_time ON segments(meeting,start,session,id); PRAGMA user_version=2;`,
        );
    });
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = run();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private decode(row: Row): MeetingDocument {
    const doc = this.cipher.open<MeetingDocument>(
      row.payload as Uint8Array,
      `meeting/${row.id}/${row.revision}`,
    );
    if (
      doc.id !== row.id ||
      doc.revision !== row.revision ||
      doc.updatedAt !== row.updated ||
      doc.createdAt !== row.created ||
      doc.status !== row.status ||
      doc.startedAt !== row.started ||
      doc.endedAt !== row.ended
    )
      throw new Error("History metadata authentication failed.");
    return doc;
  }
  get(id: string): MeetingDocument {
    const row = this.db
      .prepare("SELECT * FROM meetings WHERE id=?")
      .get(meetingId(id)) as Row | undefined;
    if (!row)
      throw new Error("This meeting is not available in the unlocked profile.");
    return this.decode(row);
  }
  private write(doc: MeetingDocument, retentionDays: number | null): void {
    this.db
      .prepare(
        "UPDATE meetings SET updated=?,started=?,ended=?,status=?,revision=?,expiry=?,payload=? WHERE id=?",
      )
      .run(
        doc.updatedAt,
        doc.startedAt,
        doc.endedAt,
        doc.status,
        doc.revision,
        retentionDays === null
          ? null
          : doc.updatedAt + retentionDays * 86400000,
        this.cipher.seal(doc, `meeting/${doc.id}/${doc.revision}`),
        doc.id,
      );
  }
  create(title: string, retentionDays: number | null): MeetingDocument {
    if (!title.trim() || title.length > 200)
      throw new Error("Enter a meeting title of at most 200 characters.");
    if (
      Number(
        (this.db.prepare("SELECT count(*) AS n FROM meetings").get() as Row).n,
      ) >= 10000
    )
      throw new Error(
        "History has reached 10,000 meetings. Export/delete records before saving more.",
      );
    const now = this.now(),
      id = randomUUID();
    const doc: MeetingDocument = {
      id,
      title: title.trim(),
      createdAt: now,
      startedAt: null,
      endedAt: null,
      durationMs: 0,
      status: "draft",
      runs: [],
      notes: "",
      summary: null,
      actions: [],
      decisions: [],
      tags: [],
      editedSections: [],
      updatedAt: now,
      revision: 1,
      segmentCount: 0,
    };
    this.db
      .prepare("INSERT INTO meetings VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        now,
        now,
        null,
        null,
        "draft",
        1,
        retentionDays === null ? null : now + retentionDays * 86400000,
        this.cipher.seal(doc, `meeting/${id}/1`),
      );
    return doc;
  }
  update(
    doc: MeetingDocument,
    expectedRevision: number,
    retentionDays: number | null,
  ): MeetingDocument {
    return this.transaction(() => {
      const current = this.get(doc.id);
      if (current.revision !== expectedRevision)
        throw new Error(
          "This meeting changed. Reload before saving; your edits were not overwritten.",
        );
      const next = {
        ...doc,
        createdAt: current.createdAt,
        revision: current.revision + 1,
        updatedAt: this.now(),
      };
      this.write(next, retentionDays);
      return next;
    });
  }
  begin(
    id: string,
    run: MeetingRun,
    retentionDays: number | null,
  ): MeetingDocument {
    const doc = this.get(id);
    if (doc.status === "active")
      throw new Error("This meeting already has an active capture segment.");
    if (doc.runs.some((previous) => previous.sessionId === run.sessionId))
      throw new Error(
        "Capture session was already associated with this meeting.",
      );
    if (doc.runs.length >= 100)
      throw new Error("This meeting reached its 100 capture-segment limit.");
    doc.runs.push(run);
    doc.startedAt ??= run.startedAt;
    doc.endedAt = null;
    doc.status = "active";
    return this.update(doc, doc.revision, retentionDays);
  }
  append(
    id: string,
    sessionId: string,
    events: TranscriptEvent[],
    retentionDays: number | null,
  ): number {
    if (events.length > 100)
      throw new Error("Too many transcript segments in one write.");
    return this.transaction(() => {
      const doc = this.get(id);
      if (
        doc.status !== "active" ||
        !doc.runs.some(
          (run) => run.sessionId === sessionId && run.endedAt === null,
        )
      )
        throw new Error(
          "This capture segment is not authorised for persistence.",
        );
      let count = 0;
      for (const event of events) {
        if (
          event.state !== "final" ||
          event.sessionId !== sessionId ||
          !["microphone", "systemAudio"].includes(event.source) ||
          !event.text.trim()
        )
          continue;
        if (
          !doc.runs
            .find((run) => run.sessionId === sessionId)
            ?.sources.some((source) => source.kind === event.source)
        )
          throw new Error(
            "The transcript source was not authorised for this saved capture segment.",
          );
        meetingId(event.id);
        meetingId(event.sessionId);
        if (
          event.text.length > 8000 ||
          !Number.isFinite(event.startMs) ||
          !Number.isFinite(event.endMs) ||
          event.startMs < 0 ||
          event.startMs > event.endMs ||
          event.endMs > this.now() + 1000
        )
          throw new Error("Invalid final transcript segment.");
        const duplicate = this.db
          .prepare(
            "SELECT 1 AS found FROM segments WHERE meeting=? AND session=? AND id=?",
          )
          .get(id, sessionId, event.id);
        if (duplicate) continue;
        if (doc.segmentCount + count >= 20000)
          throw new Error(
            "Meeting reached 20,000 transcript segments; persistence stopped.",
          );
        const segment: MeetingSegment = { ...event, meetingId: id };
        this.db
          .prepare("INSERT INTO segments VALUES(?,?,?,?,?,?)")
          .run(
            id,
            sessionId,
            event.id,
            Math.floor(event.startMs),
            Math.floor(event.endMs),
            this.cipher.seal(segment, `segment/${id}/${sessionId}/${event.id}`),
          );
        count++;
      }
      if (count) {
        doc.segmentCount += count;
        doc.revision++;
        doc.updatedAt = this.now();
        this.write(doc, retentionDays);
      }
      return count;
    });
  }
  finish(
    id: string,
    sessionId: string,
    interrupted: boolean,
    retentionDays: number | null,
    at = this.now(),
  ): MeetingDocument {
    const doc = this.get(id),
      run = doc.runs.find((item) => item.sessionId === sessionId);
    if (!run || run.endedAt !== null) return doc;
    run.endedAt = Math.max(run.startedAt, at);
    doc.status = interrupted ? "interrupted" : "ended";
    doc.endedAt = run.endedAt;
    doc.durationMs = doc.runs.reduce(
      (sum, item) =>
        sum + Math.max(0, (item.endedAt ?? this.now()) - item.startedAt),
      0,
    );
    return this.update(doc, doc.revision, retentionDays);
  }
  recover(retentionDays: number | null): number {
    const rows = this.db
      .prepare("SELECT id FROM meetings WHERE status='active'")
      .all() as Row[];
    for (const row of rows) {
      const doc = this.get(row.id as string);
      for (const run of doc.runs)
        if (run.endedAt === null)
          this.finish(
            doc.id,
            run.sessionId,
            true,
            retentionDays,
            doc.updatedAt,
          );
    }
    return rows.length;
  }
  transcript(id: string, offset = 0, limit = 100): TranscriptPage {
    this.get(id);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw new Error("Invalid transcript page.");
    const rows = this.db
      .prepare(
        "SELECT * FROM segments WHERE meeting=? ORDER BY start,session,id LIMIT ? OFFSET ?",
      )
      .all(id, limit + 1, offset) as Row[];
    return {
      segments: rows
        .slice(0, limit)
        .map((row) =>
          this.cipher.open<MeetingSegment>(
            row.payload as Uint8Array,
            `segment/${id}/${row.session}/${row.id}`,
          ),
        ),
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  }
  contextSegments(id: string, refs: string[]): MeetingSegment[] {
    this.get(id);
    if (refs.length > 100)
      throw new Error("Select at most 100 transcript references.");
    const rows: Row[] = refs.length
      ? refs
          .map((ref) => {
            const [owner, session, segment, ...extra] = ref.split("/");
            if (owner !== id || !session || !segment || extra.length)
              throw new Error("Invalid selected meeting reference.");
            return this.db
              .prepare(
                "SELECT * FROM segments WHERE meeting=? AND session=? AND id=?",
              )
              .get(id, meetingId(session), meetingId(segment)) as
              | Row
              | undefined;
          })
          .filter((row): row is Row => Boolean(row))
      : (this.db
          .prepare(
            "SELECT * FROM segments WHERE meeting=? ORDER BY start DESC,session,id LIMIT 100",
          )
          .all(id) as Row[]);
    return rows
      .map((row) =>
        this.cipher.open<MeetingSegment>(
          row.payload as Uint8Array,
          `segment/${id}/${row.session}/${row.id}`,
        ),
      )
      .sort((a, b) => a.startMs - b.startMs);
  }
  findTranscript(
    id: string,
    query: string,
    offset: number,
  ): TranscriptPage & { scanned: number } {
    const doc = this.get(id);
    if (
      !query.trim() ||
      query.length > 200 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 20000
    )
      throw new Error("Choose a bounded transcript search.");
    const rows = this.db
        .prepare(
          "SELECT * FROM segments WHERE meeting=? ORDER BY start,session,id LIMIT 1000 OFFSET ?",
        )
        .all(id, offset) as Row[],
      segments: MeetingSegment[] = [];
    let scanned = 0;
    for (const row of rows) {
      const segment = this.cipher.open<MeetingSegment>(
        row.payload as Uint8Array,
        `segment/${id}/${row.session}/${row.id}`,
      );
      scanned++;
      if (
        `${segment.text} ${segment.speakerLabel ?? ""}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      )
        segments.push(segment);
      if (segments.length >= 30) break;
    }
    return {
      segments,
      scanned,
      nextOffset: offset + scanned < doc.segmentCount ? offset + scanned : null,
    };
  }
  list(query: MeetingQuery): MeetingPage {
    if (query.query.trim() || query.tag?.trim()) return this.search(query);
    const sort =
      query.sort === "oldest"
        ? "COALESCE(started,created) ASC,id ASC"
        : "COALESCE(started,created) DESC,id ASC";
    const rows = this.db
      .prepare(
        `SELECT * FROM meetings WHERE (? IS NULL OR COALESCE(started,created)>=?) AND (? IS NULL OR COALESCE(started,created)<=?) AND (?='all' OR status=?) ORDER BY ${sort} LIMIT 26 OFFSET ?`,
      )
      .all(
        query.from,
        query.from,
        query.to,
        query.to,
        query.status,
        query.status,
        query.offset,
      ) as Row[];
    const items = rows.slice(0, 25).map((row) => this.item(this.decode(row)));
    if (query.sort === "title")
      items.sort((a, b) => a.title.localeCompare(b.title));
    return {
      items,
      nextOffset: rows.length > 25 ? query.offset + 25 : null,
      scanned: items.length,
      partial: false,
    };
  }
  private search(query: MeetingQuery): MeetingPage {
    const signature = JSON.stringify({ ...query, offset: 0 }),
      stride = 20001;
    if (!query.offset) {
      const sort =
        query.sort === "oldest"
          ? "COALESCE(started,created) ASC,id ASC"
          : "COALESCE(started,created) DESC,id ASC";
      const ids = (
        this.db
          .prepare(
            `SELECT id FROM meetings WHERE (? IS NULL OR COALESCE(started,created)>=?) AND (? IS NULL OR COALESCE(started,created)<=?) AND (?='all' OR status=?) ORDER BY ${sort} LIMIT 10000`,
          )
          .all(
            query.from,
            query.from,
            query.to,
            query.to,
            query.status,
            query.status,
          ) as Row[]
      ).map((row) => row.id as string);
      this.searchState = { signature, ids };
    }
    if (!this.searchState || this.searchState.signature !== signature)
      throw new Error(
        "The local search changed or expired. Run it again from the beginning.",
      );
    const needle = query.query.trim().toLocaleLowerCase(),
      tag = query.tag?.trim().toLocaleLowerCase() ?? "",
      items: MeetingListItem[] = [];
    let meetingOffset = Math.floor(query.offset / stride),
      segmentOffset = query.offset % stride,
      scanned = 0,
      visited = 0,
      chars = 0;
    const snippet = (text: string) => {
      const at = Math.max(0, text.toLocaleLowerCase().indexOf(needle));
      return text.slice(Math.max(0, at - 50), at + 170);
    };
    while (
      meetingOffset < this.searchState.ids.length &&
      visited < 25 &&
      scanned < 1000 &&
      chars < 4_000_000
    ) {
      const id = this.searchState.ids[meetingOffset]!,
        row = this.db.prepare("SELECT * FROM meetings WHERE id=?").get(id) as
          | Row
          | undefined;
      if (!row) {
        meetingOffset++;
        segmentOffset = 0;
        continue;
      }
      const doc = this.decode(row);
      visited++;
      if (tag && !doc.tags.some((value) => value.toLocaleLowerCase() === tag)) {
        meetingOffset++;
        segmentOffset = 0;
        continue;
      }
      const metadata = [
        doc.title,
        ...doc.tags,
        doc.notes,
        doc.summary?.overview?.text ?? "",
        ...Object.values(doc.summary ?? {}).flatMap((value) =>
          Array.isArray(value)
            ? value.map((item) => (item as { text?: string }).text ?? "")
            : [],
        ),
        ...doc.decisions.map((item) => item.text),
        ...doc.actions.map((item) =>
          [item.text, item.owner, item.deadline, item.status]
            .filter(Boolean)
            .join(" "),
        ),
      ].join("\n");
      chars += metadata.length;
      if (!needle || metadata.toLocaleLowerCase().includes(needle)) {
        items.push({
          ...this.item(doc),
          snippet: needle ? snippet(metadata) : undefined,
        });
        meetingOffset++;
        segmentOffset = 0;
        continue;
      }
      let matched = false,
        finished = false;
      while (scanned < 1000 && chars < 4_000_000) {
        const rows = this.db
          .prepare(
            "SELECT * FROM segments WHERE meeting=? ORDER BY start,session,id LIMIT 100 OFFSET ?",
          )
          .all(id, segmentOffset) as Row[];
        if (!rows.length) {
          finished = true;
          break;
        }
        for (const segmentRow of rows) {
          const segment = this.cipher.open<MeetingSegment>(
            segmentRow.payload as Uint8Array,
            `segment/${id}/${segmentRow.session}/${segmentRow.id}`,
          );
          scanned++;
          segmentOffset++;
          chars += segment.text.length;
          if (
            [segment.text, segment.speakerLabel ?? ""]
              .join(" ")
              .toLocaleLowerCase()
              .includes(needle)
          ) {
            items.push({
              ...this.item(doc),
              snippet: `${segment.source} · ${new Date(segment.startMs).toLocaleTimeString()} · ${snippet(segment.text)}`,
            });
            matched = true;
            break;
          }
          if (scanned >= 1000 || chars >= 4_000_000) break;
        }
        if (matched) break;
        if (rows.length < 100) {
          finished = true;
          break;
        }
      }
      if (matched || finished) {
        meetingOffset++;
        segmentOffset = 0;
      } else break;
    }
    if (query.sort === "title")
      items.sort((a, b) => a.title.localeCompare(b.title));
    const next =
      meetingOffset < this.searchState.ids.length
        ? meetingOffset * stride + segmentOffset
        : null;
    return { items, nextOffset: next, scanned, partial: next !== null };
  }
  private item(doc: MeetingDocument): MeetingListItem {
    return {
      id: doc.id,
      title: doc.title,
      createdAt: doc.createdAt,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      durationMs: doc.durationMs,
      status: doc.status,
      noteStatus: doc.summary?.model
        ? "generated"
        : doc.notes || doc.summary
          ? "manual"
          : "none",
      actionCount: doc.actions.filter(
        (a) => a.status === "open" || a.status === "in-progress",
      ).length,
      segmentCount: doc.segmentCount,
      updatedAt: doc.updatedAt,
      tags: doc.tags,
    };
  }
  delete(id: string): void {
    this.searchState = null;
    this.db.prepare("DELETE FROM meetings WHERE id=?").run(meetingId(id));
  }
  deleteAll(): void {
    this.searchState = null;
    this.transaction(() => this.db.exec("DELETE FROM meetings"));
  }
  retention(days: number | null): number {
    this.searchState = null;
    return this.transaction(() => {
      this.db
        .prepare(
          "UPDATE meetings SET expiry=CASE WHEN ? IS NULL THEN NULL ELSE updated+? END",
        )
        .run(days, days === null ? 0 : days * 86400000);
      return Number(
        this.db
          .prepare(
            "DELETE FROM meetings WHERE expiry IS NOT NULL AND expiry<=? AND status<>'active'",
          )
          .run(this.now()).changes,
      );
    });
  }
  clearTranscript(id: string, retentionDays: number | null): MeetingDocument {
    return this.transaction(() => {
      const doc = this.get(id);
      if (doc.status === "active")
        throw new Error(
          "End this meeting before clearing its saved transcript.",
        );
      this.db.prepare("DELETE FROM segments WHERE meeting=?").run(id);
      doc.segmentCount = 0;
      // Generated derivatives are removed with their supporting transcript.
      doc.summary = null;
      doc.actions = doc.actions.filter((a) => a.authorship === "user");
      doc.decisions = doc.decisions.filter((d) => d.authorship === "user");
      doc.revision++;
      doc.updatedAt = this.now();
      this.write(doc, retentionDays);
      return doc;
    });
  }
  speakerLabels(
    id: string,
    expectedRevision: number,
    labels: { ref: string; label: string }[],
    retentionDays: number | null,
  ): MeetingDocument {
    return this.transaction(() => {
      const doc = this.get(id);
      if (doc.revision !== expectedRevision)
        throw new Error(
          "This meeting changed. Reload before labelling speakers.",
        );
      if (labels.length > 100)
        throw new Error("Label at most 100 segments at once.");
      for (const edit of labels) {
        const [owner, session, segment, ...extra] = edit.ref.split("/");
        if (
          owner !== id ||
          !session ||
          !segment ||
          extra.length ||
          edit.label.length > 80
        )
          throw new Error("Invalid user-provided speaker label.");
        const row = this.db
          .prepare(
            "SELECT * FROM segments WHERE meeting=? AND session=? AND id=?",
          )
          .get(id, meetingId(session), meetingId(segment)) as Row | undefined;
        if (!row)
          throw new Error("This transcript segment is no longer available.");
        const binding = `segment/${id}/${session}/${segment}`,
          value = this.cipher.open<MeetingSegment>(
            row.payload as Uint8Array,
            binding,
          );
        if (edit.label.trim()) value.speakerLabel = edit.label.trim();
        else delete value.speakerLabel;
        this.db
          .prepare(
            "UPDATE segments SET payload=? WHERE meeting=? AND session=? AND id=?",
          )
          .run(this.cipher.seal(value, binding), id, session, segment);
      }
      doc.revision++;
      doc.updatedAt = this.now();
      this.write(doc, retentionDays);
      return doc;
    });
  }
  close(): void {
    this.searchState = null;
    this.db.close();
    this.cipher.close();
  }
}
