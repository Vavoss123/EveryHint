import { DatabaseSync } from "node:sqlite";
import { MeetingCipher } from "../meetings/crypto";
import {
  defaultConfig,
  parseConfig,
  type PersonalConfig,
} from "../../shared/modes";
import { localId, text } from "../../shared/modes";
import type {
  Extraction,
  KnowledgeDocument,
  KnowledgeSection,
} from "../../shared/knowledge";
import { rankSections } from "./retrieval";
import {
  WORKSPACE_KINDS,
  type WorkspaceRow,
  type WorkspaceKind,
  type WorkspaceQuery,
  type MemoryRecord,
} from "../../shared/workspace";

export class PersonalDatabase {
  private db: DatabaseSync;
  private cipher: MeetingCipher;
  constructor(path: string, key: Uint8Array, profile: string) {
    this.cipher = new MeetingCipher(key, profile);
    try {
      this.db = new DatabaseSync(path, {
        timeout: 2000,
        allowExtension: false,
        enableForeignKeyConstraints: true,
      });
    } catch {
      this.cipher.close();
      throw new Error("Personal library could not be opened; data preserved.");
    }
    try {
      if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok")
        throw new Error("Corrupt library.");
      const version = Number(
        this.db.prepare("PRAGMA user_version").get()!.user_version,
      );
      if (version > 3) throw new Error("Newer personal library schema.");
      this.db.exec(
        "PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF;",
      );
      if (!version)
        this.transaction(() => {
          this.db.exec(
            "CREATE TABLE config(id INTEGER PRIMARY KEY CHECK(id=1), payload BLOB NOT NULL) STRICT; PRAGMA user_version=1;",
          );
          this.db
            .prepare("INSERT INTO config VALUES(1, ?)")
            .run(this.cipher.seal(defaultConfig(), "personal/config"));
        });
      this.config();
      if (version < 2)
        this.transaction(() => {
          this.db.exec(
            "CREATE TABLE documents(id TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT; CREATE TABLE sections(document TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, id TEXT NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(document,id)) STRICT; PRAGMA user_version=2;",
          );
        });
      if (version < 3)
        this.transaction(() =>
          this.db.exec(
            "CREATE TABLE workspace(kind TEXT NOT NULL, id TEXT NOT NULL, updated INTEGER NOT NULL, expiry INTEGER, payload BLOB NOT NULL, PRIMARY KEY(kind,id)) STRICT; CREATE INDEX workspace_expiry ON workspace(expiry); PRAGMA user_version=3;",
          ),
        );
    } catch {
      this.close();
      throw new Error(
        "Personal library key, schema or authentication failed. Existing data was preserved.",
      );
    }
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  config(): PersonalConfig {
    const row = this.db.prepare("SELECT payload FROM config WHERE id=1").get();
    if (!row) throw new Error("Missing personal settings authentication.");
    return parseConfig(
      this.cipher.open(row.payload as Uint8Array, "personal/config"),
    );
  }
  save(value: PersonalConfig): void {
    const config = parseConfig(value);
    this.db
      .prepare("UPDATE config SET payload=? WHERE id=1")
      .run(this.cipher.seal(config, "personal/config"));
  }
  documents(): KnowledgeDocument[] {
    return this.db
      .prepare("SELECT id,payload FROM documents ORDER BY rowid DESC LIMIT 100")
      .all()
      .map((row) =>
        this.cipher.open<KnowledgeDocument>(
          row.payload as Uint8Array,
          `personal/doc/${row.id}`,
        ),
      );
  }
  sections(id: string): KnowledgeSection[] {
    localId(id);
    return this.db
      .prepare(
        "SELECT id,payload FROM sections WHERE document=? ORDER BY rowid LIMIT 500",
      )
      .all(id)
      .map((row) =>
        this.cipher.open<KnowledgeSection>(
          row.payload as Uint8Array,
          `personal/section/${id}/${row.id}`,
        ),
      );
  }
  import(document: KnowledgeDocument, extraction: Extraction): void {
    if (this.documents().length >= 100)
      throw new Error("Maximum 100 documents per profile.");
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO documents VALUES(?,?)")
        .run(
          document.id,
          this.cipher.seal(document, `personal/doc/${document.id}`),
        );
      const insert = this.db.prepare("INSERT INTO sections VALUES(?,?,?)");
      for (const section of extraction.sections)
        insert.run(
          document.id,
          section.id,
          this.cipher.seal(
            section,
            `personal/section/${document.id}/${section.id}`,
          ),
        );
    });
  }
  documentChange(id: string, name: string, enabled: boolean): void {
    localId(id);
    name = text(name, 200, "Document name", true);
    if (typeof enabled !== "boolean")
      throw new Error("Choose enabled or disabled.");
    const doc = this.documents().find((d) => d.id === id);
    if (!doc) throw new Error("Document no longer exists.");
    this.db
      .prepare("UPDATE documents SET payload=? WHERE id=?")
      .run(
        this.cipher.seal(
          { ...doc, name, enabled, updatedAt: Date.now() },
          `personal/doc/${id}`,
        ),
        id,
      );
  }
  deleteDocument(id: string): void {
    localId(id);
    this.transaction(() => {
      const config = this.config();
      config.modes.forEach((m) => {
        m.knowledgeIds = m.knowledgeIds.filter((ref) => ref !== id);
      });
      this.save(config);
      this.db.prepare("DELETE FROM documents WHERE id=?").run(id);
    });
  }
  retrieve(query: string, allowed: string[], offset = 0) {
    text(query, 6000, "Search query");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100)
      throw new Error("Invalid search page.");
    const docs = this.documents().filter(
      (d) => d.enabled && allowed.includes(d.id),
    );
    const page = docs.slice(offset, offset + 10);
    return {
      excerpts: rankSections(
        query,
        page.map((document) => ({
          document,
          sections: this.sections(document.id),
        })),
      ),
      nextOffset: offset + 10 < docs.length ? offset + 10 : null,
      scanned: page.length,
    };
  }
  close(): void {
    try {
      this.db.close();
    } finally {
      this.cipher.close();
    }
  }
  workspaceGet(kind: WorkspaceKind, id: string): unknown | null {
    this.workspaceKind(kind);
    localId(id);
    const row = this.db
      .prepare(
        "SELECT payload FROM workspace WHERE kind=? AND id=? AND (expiry IS NULL OR expiry>?)",
      )
      .get(kind, id, Date.now());
    return row
      ? this.cipher.open(row.payload as Uint8Array, `workspace/${kind}/${id}`)
      : null;
  }
  private workspaceKind(kind: WorkspaceKind) {
    if (!WORKSPACE_KINDS.includes(kind))
      throw new Error("Unsupported workspace record.");
  }
  workspaceBatch(
    rows: WorkspaceRow[],
    remove: { kind: WorkspaceKind; id: string }[] = [],
  ): void {
    if (rows.length > 2000 || remove.length > 6000)
      throw new Error("Workspace batch limit exceeded.");
    for (const row of rows) {
      this.workspaceKind(row.kind);
      localId(row.id);
      if (
        !Number.isSafeInteger(row.updatedAt) ||
        (row.expiresAt !== null && !Number.isSafeInteger(row.expiresAt))
      )
        throw new Error("Invalid workspace dates.");
    }
    for (const row of remove) {
      this.workspaceKind(row.kind);
      localId(row.id);
    }
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM workspace WHERE expiry IS NOT NULL AND expiry<=?")
        .run(Date.now());
      const del = this.db.prepare(
          "DELETE FROM workspace WHERE kind=? AND id=?",
        ),
        put = this.db.prepare(
          "INSERT INTO workspace VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET updated=excluded.updated,expiry=excluded.expiry,payload=excluded.payload",
        );
      for (const row of remove) del.run(row.kind, row.id);
      for (const row of rows)
        put.run(
          row.kind,
          row.id,
          row.updatedAt,
          row.expiresAt,
          this.cipher.seal(row.value, `workspace/${row.kind}/${row.id}`),
        );
      const count = Number(
        this.db.prepare("SELECT count(*) AS n FROM workspace").get()!.n,
      );
      if (count > 10000)
        throw new Error("Workspace capacity is 10,000 records.");
    });
  }
  workspaceList(
    kind: WorkspaceKind,
    offset = 0,
    limit = 100,
  ): { id: string; value: unknown }[] {
    this.workspaceKind(kind);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1100
    )
      throw new Error("Invalid workspace page.");
    return this.db
      .prepare(
        "SELECT id,payload FROM workspace WHERE kind=? AND (expiry IS NULL OR expiry>?) ORDER BY updated DESC,id LIMIT ? OFFSET ?",
      )
      .all(kind, Date.now(), limit, offset)
      .map((row) => ({
        id: row.id as string,
        value: this.cipher.open(
          row.payload as Uint8Array,
          `workspace/${kind}/${row.id}`,
        ),
      }));
  }
  workspaceCounts(): Record<string, number> {
    return Object.fromEntries(
      this.db
        .prepare(
          "SELECT kind,count(*) AS n FROM workspace WHERE expiry IS NULL OR expiry>? GROUP BY kind",
        )
        .all(Date.now())
        .map((row) => [row.kind, row.n]),
    );
  }
  workspaceQuery(input: WorkspaceQuery) {
    if (!["event", "person", "memory", "brief"].includes(input.kind))
      throw new Error("Invalid workspace search category.");
    const query = text(input.query, 200, "Search").toLowerCase(),
      rows = this.workspaceList(input.kind, 0, 1000);
    const filtered = rows.filter((row) => {
      if (input.kind === "memory") {
        const memory = row.value as MemoryRecord;
        if (input.personId && !memory.personIds.includes(input.personId))
          return false;
        if (input.meetingId && memory.source.id !== input.meetingId)
          return false;
      }
      return (
        !query ||
        query
          .split(/\s+/)
          .every((term) =>
            JSON.stringify(row.value).toLowerCase().includes(term),
          )
      );
    });
    if (input.kind === "memory" && query) {
      const ranked = rankSections(
        query,
        filtered.map((row) => ({
          document: {
            id: row.id,
            name: (row.value as MemoryRecord).source.title,
            type: "txt",
            bytes: 0,
            importedAt: 0,
            updatedAt: 0,
            enabled: true,
            status: "ready",
            notices: [],
            sectionCount: 1,
          },
          sections: [
            {
              id: "memory",
              heading: (row.value as MemoryRecord).topics.join(" "),
              page: null,
              text:
                (row.value as MemoryRecord).description +
                "\n" +
                (row.value as MemoryRecord).quote +
                "\n" +
                (row.value as MemoryRecord).topics.join(" "),
            },
          ],
        })),
        1200000,
        1000,
      );
      const scores = new Map(ranked.map((row) => [row.documentId, row.score]));
      filtered.sort((a, b) => {
        const score = (row: typeof a) =>
          (scores.get(row.id) ?? 0) +
          ((row.value as MemoryRecord).review === "approved" ? 0.3 : 0) +
          0.1 /
            (1 +
              Math.max(
                0,
                Date.now() - (row.value as MemoryRecord).lastVerifiedAt,
              ) /
                86400000);
        return score(b) - score(a);
      });
    }
    return {
      items: filtered
        .slice(input.offset, input.offset + 25)
        .map((row) => row.value),
      scanned: rows.length,
      nextOffset:
        input.offset + 25 < filtered.length ? input.offset + 25 : null,
    };
  }
}
