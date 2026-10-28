import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PersonalDatabase } from "../src/main/personal/database";
import { MeetingKeys } from "../src/main/meetings/keys";
import { MeetingCipher } from "../src/main/meetings/crypto";
import { defaultConfig } from "../src/shared/modes";
import { PersonalController } from "../src/main/personal/controller";
import type { PersonalStore } from "../src/main/personal/store";
import { deferred } from "./helpers";
const profile = "d".repeat(64);
const file = () =>
  join(mkdtempSync(join(tmpdir(), "everyhint-p9-storage-")), "personal.sqlite");
describe("P9 storage migration and account boundaries", () => {
  it("fails closed on a missing existing key, without replacing it", async () => {
    const entry = {
      getSecret: vi.fn(async () => null),
      setSecret: vi.fn(),
      deleteCredential: vi.fn(),
    };
    await expect(
      new MeetingKeys(() => entry).load(profile, true),
    ).rejects.toThrow("no replacement");
    expect(entry.setSecret).not.toHaveBeenCalled();
  });
  it("preserves corrupt files", () => {
    const path = file(),
      bytes = Buffer.from("Corrupt synthetic encrypted library.");
    writeFileSync(path, bytes);
    expect(() => new PersonalDatabase(path, randomBytes(32), profile)).toThrow(
      "preserved",
    );
    expect(readFileSync(path)).toEqual(bytes);
  });
  it("refuses a newer schema without changing its rows", () => {
    const path = file(),
      key = randomBytes(32);
    new PersonalDatabase(path, key, profile).close();
    const sqlite = new DatabaseSync(path);
    sqlite.exec("PRAGMA user_version=999");
    sqlite.close();
    const before = readFileSync(path);
    expect(() => new PersonalDatabase(path, key, profile)).toThrow("preserved");
    expect(readFileSync(path)).toEqual(before);
  });
  it("migrates authenticated schema-1 storage and config-1 preferences", () => {
    const path = file(),
      key = randomBytes(32),
      cipher = new MeetingCipher(key, profile),
      sqlite = new DatabaseSync(path);
    const { templates, defaultTemplateId, ...legacy } = defaultConfig();
    void templates;
    void defaultTemplateId;
    sqlite.exec(
      "CREATE TABLE config(id INTEGER PRIMARY KEY, payload BLOB NOT NULL) STRICT; PRAGMA user_version=1;",
    );
    sqlite
      .prepare("INSERT INTO config VALUES(1,?)")
      .run(
        cipher.seal(
          {
            ...legacy,
            version: 1,
            activeModeId: "coding",
            defaultModeId: "coding",
            outputLanguage: "French",
          },
          "personal/config",
        ),
      );
    sqlite.close();
    cipher.close();
    const db = new PersonalDatabase(path, key, profile);
    expect(db.config()).toMatchObject({
      version: 2,
      defaultModeId: "coding",
      outputLanguage: "French",
    });
    expect(db.config().templates).toHaveLength(4);
    expect(db.documents()).toEqual([]);
    db.close();
  });
  it("authenticates document metadata before use", () => {
    const path = file(),
      key = randomBytes(32);
    const db = new PersonalDatabase(path, key, profile);
    db.import(
      {
        id: "test",
        name: "Private marker",
        type: "txt",
        bytes: 30,
        importedAt: 1,
        updatedAt: 1,
        enabled: true,
        status: "ready",
        notices: [],
        sectionCount: 1,
      },
      {
        sections: [
          {
            id: "s0",
            heading: "Text",
            page: null,
            text: "The approved prototype is Thursday.",
          },
        ],
        partial: false,
        notices: [],
      },
    );
    db.close();
    const sqlite = new DatabaseSync(path);
    const payload = Buffer.from(
      sqlite.prepare("SELECT payload FROM documents").get()!
        .payload as Uint8Array,
    );
    payload[payload.length - 1]! ^= 1;
    sqlite.prepare("UPDATE documents SET payload=?").run(payload);
    sqlite.close();
    const reopened = new PersonalDatabase(path, key, profile);
    expect(() => reopened.documents()).toThrow("authenticated");
    reopened.close();
  });
  it("does not publish old-profile config or metadata after delayed unlock", async () => {
    const gate = deferred<unknown>();
    const store = {
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      call: vi.fn(async (method: string) =>
        method === "config" ? defaultConfig() : gate.promise,
      ),
    };
    const controller = new PersonalController(
      () => store as unknown as PersonalStore,
      vi.fn(),
      vi.fn(),
    );
    controller.switchProfile(profile);
    const work = controller.command({
      scopeId: controller.value.scopeId,
      value: { type: "unlock" },
    });
    await vi.waitFor(() =>
      expect(store.call).toHaveBeenCalledWith("documents"),
    );
    controller.switchProfile("e".repeat(64));
    gate.resolve([{ id: "old-private-document" }]);
    await expect(work).rejects.toThrow("Profile changed");
    expect(controller.value.documents).toEqual([]);
    expect(controller.value.unlocked).toBe(false);
  });
  it("rejects renderer paths and arbitrary document bytes", async () => {
    const controller = new PersonalController(vi.fn(), vi.fn(), vi.fn());
    controller.switchProfile(profile);
    await expect(
      controller.command({
        scopeId: controller.value.scopeId,
        value: { type: "import", path: "C:/private.txt" },
      }),
    ).rejects.toThrow();
  });
});
