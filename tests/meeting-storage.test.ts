import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { MeetingDatabase } from "../src/main/meetings/database";
import { MeetingCipher } from "../src/main/meetings/crypto";
import { historyProfile, MeetingKeys } from "../src/main/meetings/keys";
import { MeetingPreferencesStore } from "../src/main/meetings/preferences";
import {
  DEFAULT_MEETING_QUERY,
  DEFAULT_MEETINGS,
} from "../src/shared/meetings";
import type { TranscriptEvent } from "../src/shared/transcription";

const roots: string[] = [],
  opened: MeetingDatabase[] = [];
const profile = historyProfile("C:/isolated-history-test", "account-a");
function setup() {
  const root = mkdtempSync(join(tmpdir(), "everyhint-p8-storage-"));
  roots.push(root);
  const file = join(root, "history.sqlite"),
    key = randomBytes(32);
  let now = 1793196000000;
  const db = new MeetingDatabase(file, key, profile, () => now);
  opened.push(db);
  return {
    root,
    file,
    key,
    db,
    setNow: (value: number) => {
      now = value;
    },
    now: () => now,
  };
}
const segment = (
  now: number,
  patch: Partial<TranscriptEvent> = {},
): TranscriptEvent => ({
  id: "utterance-1",
  sessionId: "capture-a",
  source: "microphone",
  state: "final",
  startMs: now - 1500.5,
  endMs: now - 500.5,
  text: "Private marker: launch the release on Thursday; Alice will prepare the checklist.",
  model: "tiny.en",
  ...patch,
});
function begin(s: ReturnType<typeof setup>) {
  const doc = s.db.create("Confidential meeting title", 30);
  return s.db.begin(
    doc.id,
    {
      sessionId: "capture-a",
      startedAt: s.now() - 2000,
      endedAt: null,
      sources: [
        { kind: "microphone", name: "Private device label", id: "default" },
        { kind: "systemAudio", name: "Private playback label", id: null },
      ],
    },
    30,
  );
}
function close(db: MeetingDatabase) {
  opened.splice(opened.indexOf(db), 1);
  db.close();
}
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("P8.1 actual SQLite authenticated local persistence", () => {
  it("clears its copied key if SQLite cannot open the file at all", () => {
    const s = setup(),
      close = vi.spyOn(MeetingCipher.prototype, "close");
    expect(() => new MeetingDatabase(s.root, s.key, profile)).toThrow(
      /preserved/,
    );
    expect(close).toHaveBeenCalledOnce();
  });
  it("encrypts title/device/transcript/notes/tags and journal artifacts before storage; reopens with the same key", () => {
    const s = setup(),
      doc = begin(s);
    s.db.append(doc.id, "capture-a", [segment(s.now())], 30);
    const updated = s.db.get(doc.id);
    updated.notes = "Sensitive manual note marker";
    updated.tags = ["Private-tag-marker"];
    s.db.update(updated, updated.revision, 30);
    close(s.db);
    for (const file of readdirSync(s.root)) {
      const bytes = readFileSync(join(s.root, file));
      for (const text of [
        doc.title,
        "Private device label",
        "Private marker",
        "Sensitive manual note marker",
        "Private-tag-marker",
      ])
        expect(bytes.includes(Buffer.from(text))).toBe(false);
    }
    const reopened = new MeetingDatabase(s.file, s.key, profile, s.now);
    opened.push(reopened);
    expect(reopened.get(doc.id).notes).toContain("Sensitive manual");
    expect(reopened.transcript(doc.id).segments[0]!.text).toContain(
      "launch the release",
    );
  });
  it("rejects wrong keys/profile bindings and ciphertext or row-metadata tampering", () => {
    const s = setup(),
      doc = begin(s);
    s.db.append(doc.id, "capture-a", [segment(s.now())], 30);
    close(s.db);
    expect(() => new MeetingDatabase(s.file, randomBytes(32), profile)).toThrow(
      /preserved/,
    );
    expect(
      () =>
        new MeetingDatabase(
          s.file,
          s.key,
          historyProfile("C:/isolated-history-test", "account-b"),
        ),
    ).toThrow(/preserved/);
    const raw = new DatabaseSync(s.file);
    const row = raw
      .prepare("SELECT payload FROM meetings WHERE id=?")
      .get(doc.id)!;
    const bytes = Buffer.from(row.payload as Uint8Array);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    raw.prepare("UPDATE meetings SET payload=? WHERE id=?").run(bytes, doc.id);
    raw.close();
    const reopened = new MeetingDatabase(s.file, s.key, profile);
    opened.push(reopened);
    expect(() => reopened.get(doc.id)).toThrow(/authenticated/);
  });
  it("uses independent nonces and authenticates record identifiers before returning plaintext", () => {
    const cipher = new MeetingCipher(randomBytes(32), profile),
      value = { text: "sensitive" };
    const first = cipher.seal(value, "record-a"),
      second = cipher.seal(value, "record-a");
    expect(first).not.toEqual(second);
    expect(cipher.open(first, "record-a")).toEqual(value);
    expect(() => cipher.open(first, "record-b")).toThrow(/authenticated/);
    const altered = first.slice();
    altered[14] = altered[14]! ^ 1;
    expect(() => cipher.open(altered, "record-a")).toThrow(/authenticated/);
    cipher.close();
  });
  it("persists only final current-session segments, deduplicates IDs, keeps provenance and chronological fractional timestamps", () => {
    const s = setup(),
      doc = begin(s),
      event = segment(s.now());
    expect(
      s.db.append(
        doc.id,
        "capture-a",
        [
          event,
          event,
          segment(s.now(), {
            id: "early",
            source: "systemAudio",
            startMs: s.now() - 1900.25,
            endMs: s.now() - 1600.25,
          }),
          segment(s.now(), { id: "partial", state: "partial" }),
          segment(s.now(), { id: "old", sessionId: "other" }),
        ],
        30,
      ),
    ).toBe(2);
    expect(s.db.append(doc.id, "capture-a", [event], 30)).toBe(0);
    const page = s.db.transcript(doc.id, 0, 1);
    expect(page.segments[0]!.id).toBe("early");
    expect(page.segments[0]!.source).toBe("systemAudio");
    expect(page.segments[0]!.startMs).toBe(s.now() - 1900.25);
    expect(page.nextOffset).toBe(1);
    expect(s.db.get(doc.id).segmentCount).toBe(2);
  });
  it("rolls back a failed final batch atomically without duplicate or partial metadata", () => {
    const s = setup(),
      doc = begin(s);
    expect(() =>
      s.db.append(
        doc.id,
        "capture-a",
        [
          segment(s.now()),
          segment(s.now(), { id: "invalid", startMs: Infinity }),
        ],
        30,
      ),
    ).toThrow(/Invalid final/);
    expect(s.db.get(doc.id).segmentCount).toBe(0);
    expect(s.db.transcript(doc.id).segments).toEqual([]);
  });
  it("survives an abruptly exited SQLite transaction and recovers active meetings without resuming capture", () => {
    const s = setup(),
      doc = begin(s);
    s.db.append(doc.id, "capture-a", [segment(s.now())], 30);
    close(s.db);
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec("BEGIN IMMEDIATE; DELETE FROM segments; UPDATE meetings SET status='tampered'");process.exit(0);`,
        s.file,
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    s.setNow(s.now() + 86400000);
    const reopened = new MeetingDatabase(s.file, s.key, profile, s.now);
    opened.push(reopened);
    expect(reopened.recover(30)).toBe(1);
    expect(reopened.get(doc.id).status).toBe("interrupted");
    expect(reopened.get(doc.id).durationMs).toBeLessThan(5000);
    expect(reopened.transcript(doc.id).segments).toHaveLength(1);
  });
  it("migrates version one transactionally, rolls back migration failures and refuses future schemas", () => {
    const s = setup();
    close(s.db);
    let raw = new DatabaseSync(s.file);
    raw.exec(
      "DROP INDEX meetings_updated; DROP INDEX meetings_expiry; DROP INDEX segments_time; PRAGMA user_version=1;",
    );
    raw.close();
    const original = DatabaseSync.prototype.exec;
    const spy = vi
      .spyOn(DatabaseSync.prototype, "exec")
      .mockImplementation(function (this: DatabaseSync, sql: string) {
        if (sql.includes("CREATE INDEX"))
          throw new Error("Injected migration interruption");
        return original.call(this, sql);
      });
    expect(() => new MeetingDatabase(s.file, s.key, profile)).toThrow(
      /preserved/,
    );
    spy.mockRestore();
    raw = new DatabaseSync(s.file);
    expect(raw.prepare("PRAGMA user_version").get()!.user_version).toBe(1);
    raw.close();
    const migrated = new MeetingDatabase(s.file, s.key, profile);
    opened.push(migrated);
    close(migrated);
    raw = new DatabaseSync(s.file);
    expect(raw.prepare("PRAGMA user_version").get()!.user_version).toBe(2);
    raw.exec("PRAGMA user_version=99");
    raw.close();
    const before = readFileSync(s.file);
    expect(() => new MeetingDatabase(s.file, s.key, profile)).toThrow(
      /preserved/,
    );
    expect(readFileSync(s.file)).toEqual(before);
  });
  it("preserves corrupt databases rather than silently resetting history", () => {
    const s = setup();
    close(s.db);
    const corrupted = readFileSync(s.file);
    corrupted.fill(0, 0, 16);
    writeFileSync(s.file, corrupted);
    const before = readFileSync(s.file);
    expect(() => new MeetingDatabase(s.file, s.key, profile)).toThrow();
    expect(readFileSync(s.file)).toEqual(before);
  });
  it("uses optimistic revisions so a stale editor cannot overwrite newer notes or transcripts", () => {
    const s = setup(),
      doc = s.db.create("Meeting", 30),
      stale = structuredClone(doc);
    doc.notes = "User correction";
    s.db.update(doc, doc.revision, 30);
    stale.notes = "Old draft";
    expect(() => s.db.update(stale, stale.revision, 30)).toThrow(
      /not overwritten/,
    );
    expect(s.db.get(doc.id).notes).toBe("User correction");
  });
  it("applies selected retention and cascading deletion to transcript and generated derivatives", () => {
    const s = setup(),
      doc = begin(s);
    s.db.append(doc.id, "capture-a", [segment(s.now())], 7);
    s.db.finish(doc.id, "capture-a", false, 7);
    s.setNow(s.now() + 8 * 86400000);
    expect(s.db.retention(null)).toBe(0);
    expect(s.db.retention(7)).toBe(1);
    expect(() => s.db.get(doc.id)).toThrow(/not available/);
    expect(s.db.list({ ...DEFAULT_MEETING_QUERY }).items).toEqual([]);
    const second = s.db.create("Delete all", null);
    s.db.deleteAll();
    expect(() => s.db.get(second.id)).toThrow(/not available/);
  });
  it("clears saved transcript and generated derivatives while preserving manual notes", () => {
    const s = setup(),
      doc = begin(s);
    s.db.append(doc.id, "capture-a", [segment(s.now())], 30);
    expect(() => s.db.clearTranscript(doc.id, 30)).toThrow(/End/);
    s.db.finish(doc.id, "capture-a", false, 30);
    const edited = s.db.get(doc.id);
    edited.notes = "User notes survive";
    s.db.update(edited, edited.revision, 30);
    const cleared = s.db.clearTranscript(doc.id, 30);
    expect(cleared.notes).toBe("User notes survive");
    expect(cleared.segmentCount).toBe(0);
    expect(s.db.transcript(doc.id).segments).toEqual([]);
  });
  it("paginates metadata without loading every transcript", () => {
    const s = setup();
    for (let i = 0; i < 31; i++) s.db.create(`Meeting ${i}`, null);
    const first = s.db.list({ ...DEFAULT_MEETING_QUERY });
    expect(first.items).toHaveLength(25);
    expect(first.nextOffset).toBe(25);
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, offset: 25 }).items,
    ).toHaveLength(6);
  });
});
describe("P8.1 OS-key strategy and nonsecret profile preferences", () => {
  it("creates/verifies a 32-byte OS key only for new history and never replaces a lost existing key", async () => {
    let secret: number[] | null = null;
    const set = vi.fn(async (bytes: Uint8Array) => {
      secret = Array.from(bytes);
    });
    const keys = new MeetingKeys(() => ({
      getSecret: async () => secret,
      setSecret: set,
      deleteCredential: async () => true,
    }));
    const key = await keys.load(profile, false);
    expect(key).toHaveLength(32);
    expect(await keys.load(profile, true)).toEqual(key);
    secret = null;
    await expect(keys.load(profile, true)).rejects.toThrow(/no replacement/);
    expect(set).toHaveBeenCalledOnce();
    key.fill(0);
  });
  it("fails closed on credential read/write/verification errors", async () => {
    const keys = new MeetingKeys(() => ({
      getSecret: async () => null,
      setSecret: async () => {},
      deleteCredential: async () => false,
    }));
    await expect(keys.load(profile, false)).rejects.toThrow(/no replacement/);
    const denied = new MeetingKeys(() => ({
      getSecret: async () => {
        throw Error("Denied");
      },
      setSecret: async () => {},
      deleteCredential: async () => false,
    }));
    await expect(denied.load(profile, false)).rejects.toThrow(
      /Windows credential/,
    );
  });
  it("isolates installations/accounts/local-only and persists only chosen nonsecret settings", () => {
    expect(historyProfile("C:/first", "a")).not.toBe(
      historyProfile("C:/second", "a"),
    );
    expect(historyProfile("C:/first", "a")).not.toBe(
      historyProfile("C:/first", "b"),
    );
    expect(historyProfile("C:/first", "a")).not.toBe(
      historyProfile("C:/first", null),
    );
    const root = mkdtempSync(join(tmpdir(), "everyhint-p8-preferences-"));
    roots.push(root);
    const prefs = new MeetingPreferencesStore(root);
    expect(prefs.read(profile)).toEqual(DEFAULT_MEETINGS);
    prefs.write(profile, { enabled: true, autoSave: true, retentionDays: 90 });
    expect(prefs.read(profile).autoSave).toBe(true);
    expect(prefs.read(historyProfile(root, "other"))).toEqual(DEFAULT_MEETINGS);
    expect(() =>
      prefs.write(profile, {
        enabled: false,
        autoSave: true,
        retentionDays: 30,
      }),
    ).toThrow();
    expect(() => prefs.read("../outside")).toThrow();
  });
});
