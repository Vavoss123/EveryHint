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
      if (version > 2) throw new Error("Newer personal library schema.");
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
}
