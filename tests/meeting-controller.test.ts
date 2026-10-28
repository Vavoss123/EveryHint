import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { MeetingController } from "../src/main/meetings/controller";
import { MeetingDatabase } from "../src/main/meetings/database";
import { MeetingPreferencesStore } from "../src/main/meetings/preferences";
import { historyProfile } from "../src/main/meetings/keys";
import type { MeetingStore } from "../src/main/meetings/store";
import { CaptureSessionController } from "../src/main/session";
import type { SessionSnapshot } from "../src/shared/contracts";
import type { TranscriptEvent } from "../src/shared/transcription";
import { DEFAULT_MEETING_QUERY } from "../src/shared/meetings";
import { backend, consent } from "./helpers";
const instances: {
  root: string;
  controller: MeetingController;
  databases: Set<MeetingDatabase>;
}[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "everyhint-p8-recorder-")),
    databases = new Set<MeetingDatabase>(),
    profile = historyProfile(root, "account-a"),
    key = randomBytes(32);
  let capture: SessionSnapshot = new CaptureSessionController(
    backend(),
    () => 3000,
    () => {},
  ).value;
  const events: TranscriptEvent[] = [];
  const factory = vi.fn(async (selected: string): Promise<MeetingStore> => {
    const db = new MeetingDatabase(
      join(root, `${selected}.sqlite`),
      key,
      selected,
    );
    databases.add(db);
    return {
      isCurrent: (id, revision) => {
        try {
          return databases.has(db) && db.get(id).revision === revision;
        } catch {
          return false;
        }
      },
      contextSegments: async (...args) => db.contextSegments(...args),
      findTranscript: async (...args) => db.findTranscript(...args),
      speakerLabels: async (...args) => db.speakerLabels(...args),
      create: async (...args) => db.create(...args),
      get: async (...args) => db.get(...args),
      update: async (...args) => db.update(...args),
      begin: async (...args) => db.begin(...args),
      append: async (...args) => db.append(...args),
      finish: async (...args) => db.finish(...args),
      transcript: async (...args) => db.transcript(...args),
      list: async (...args) => db.list(...args),
      delete: async (...args) => db.delete(...args),
      deleteAll: async () => db.deleteAll(),
      retention: async (...args) => db.retention(...args),
      clearTranscript: async (...args) => db.clearTranscript(...args),
      recover: async (...args) => db.recover(...args),
      close: async () => {
        if (databases.delete(db)) db.close();
      },
    };
  });
  const controller = new MeetingController(
    () => ({ capture, events }),
    factory,
    new MeetingPreferencesStore(join(root, "preferences")),
    () => {},
  );
  controller.switchProfile(profile, "Account A history");
  const start = (id = "capture-a") => {
    capture = {
      ...capture,
      state: "ACTIVE",
      sessionId: id,
      epoch: capture.epoch + 1,
      consent: {
        ...consent,
        screen: false,
        microphone: true,
        systemAudio: false,
      },
    };
    capture.sources.microphone.state = "CAPTURING";
    controller.observe(capture, events);
  };
  const emit = (patch: Partial<TranscriptEvent> = {}) => {
    events.push({
      id: "utterance-a",
      sessionId: capture.sessionId!,
      source: "microphone",
      startMs: Date.now() - 1000,
      endMs: Date.now() - 100,
      text: "We decided to release on Thursday.",
      state: "final",
      model: "tiny.en",
      ...patch,
    });
    controller.observe(capture, events);
  };
  const configure = (autoSave = false) =>
    controller.configure({
      settings: { enabled: true, autoSave, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
  const stop = async () => {
    capture = { ...capture, state: "STOPPED", sessionId: null, consent: null };
    controller.observe(capture, events);
    await controller.flush();
  };
  const result = {
    root,
    profile,
    controller,
    databases,
    factory,
    start,
    emit,
    configure,
    stop,
    capture: () => capture,
  };
  instances.push(result);
  return result;
}
afterEach(() => {
  for (const s of instances.splice(0)) {
    s.controller.lock();
    for (const db of s.databases) db.close();
    s.databases.clear();
    rmSync(s.root, { recursive: true, force: true });
  }
});
describe("P8.1 opt-in transcript persistence and lifecycle", () => {
  it("leaves ordinary temporary sessions entirely in memory without opening a database", () => {
    const s = setup();
    s.start();
    s.emit();
    expect(s.controller.value.saving).toBe(false);
    expect(s.factory).not.toHaveBeenCalled();
    expect(existsSync(join(s.root, `${s.profile}.sqlite`))).toBe(false);
  });
  it("requires separate persistence/retention acknowledgement and the current capture UUID", async () => {
    const s = setup();
    s.start();
    await expect(
      s.controller.saveCapture({
        sessionId: "capture-a",
        title: "Meeting",
        acknowledged: true,
      }),
    ).rejects.toThrow(/Enable/);
    await expect(
      s.controller.configure({
        settings: { enabled: true, autoSave: false, retentionDays: 30 },
        acknowledged: false,
        applyRetention: true,
      }),
    ).rejects.toThrow(/Acknowledge/);
    await s.configure();
    await expect(
      s.controller.saveCapture({
        sessionId: "capture-a",
        title: "Meeting",
        acknowledged: false,
      }),
    ).rejects.toThrow(/Explicitly/);
    await expect(
      s.controller.saveCapture({
        sessionId: "old-capture",
        title: "Meeting",
        acknowledged: true,
      }),
    ).rejects.toThrow(/freshly/);
    expect(s.factory).not.toHaveBeenCalled();
  });
  it("saves retained and new final consented text, deduplicates partial updates and ends on Stop", async () => {
    const s = setup();
    await s.configure();
    s.start();
    s.emit();
    s.emit({ id: "provisional", state: "partial" });
    s.emit({ id: "private-system", source: "systemAudio" });
    const doc = await s.controller.saveCapture({
      sessionId: "capture-a",
      title: "Release planning",
      acknowledged: true,
    });
    expect(doc.segmentCount).toBe(1);
    s.emit({ id: "final-two", text: "Alice will prepare the checklist." });
    await s.controller.flush();
    expect((await s.controller.requireStore().get(doc.id)).segmentCount).toBe(
      2,
    );
    await s.stop();
    expect(s.controller.value.saving).toBe(false);
    expect((await s.controller.requireStore().get(doc.id)).status).toBe(
      "ended",
    );
    expect(s.capture().state).toBe("STOPPED");
  });
  it("automatically saves only new authorised audio sessions after explicit profile-specific opt-in", async () => {
    const s = setup();
    await s.configure(true);
    s.start();
    await vi.waitFor(() => expect(s.controller.value.saving).toBe(true));
    s.emit();
    await s.controller.flush();
    const id = s.controller.value.activeMeetingId!;
    expect((await s.controller.requireStore().get(id)).segmentCount).toBe(1);
    await s.stop();
    expect(s.capture().state).toBe("STOPPED");
  });
  it("reopening/resume selection does not acquire capture and only a fresh authorised run appends", async () => {
    const s = setup();
    await s.configure();
    s.start();
    s.emit();
    const doc = await s.controller.saveCapture({
      sessionId: "capture-a",
      title: "Meeting",
      acknowledged: true,
    });
    await s.stop();
    await s.controller.resume({ id: doc.id, acknowledged: true });
    expect(s.capture().state).toBe("STOPPED");
    expect(s.controller.value.saving).toBe(false);
    s.start("capture-b");
    await vi.waitFor(() => expect(s.controller.value.saving).toBe(true));
    s.emit({ id: "second-run", sessionId: "capture-b" });
    await s.controller.flush();
    await s.stop();
    const resumed = await s.controller.requireStore().get(doc.id);
    expect(resumed.runs.map((run) => run.sessionId)).toEqual([
      "capture-a",
      "capture-b",
    ]);
    expect(resumed.segmentCount).toBe(2);
  });
  it("locks and isolates account switches without transferring active capture to a new history profile", async () => {
    const s = setup();
    await s.configure(true);
    s.start();
    await vi.waitFor(() => expect(s.controller.value.saving).toBe(true));
    s.emit();
    await s.controller.flush();
    const old = s.controller.value.activeMeetingId!;
    s.controller.switchProfile(
      historyProfile(s.root, "account-b"),
      "Account B history",
    );
    s.emit({ id: "not-saved" });
    expect(s.controller.value.locked).toBe(true);
    expect(s.controller.value.saving).toBe(false);
    await s.controller.unlock();
    expect(
      (await s.controller.requireStore().list({ ...DEFAULT_MEETING_QUERY }))
        .items,
    ).toEqual([]);
    await expect(s.controller.requireStore().get(old)).rejects.toThrow(
      /not available/,
    );
  });
  it("stops persistence visibly on invalid writes without stopping or silently retrying capture", async () => {
    const s = setup();
    await s.configure();
    s.start();
    const doc = await s.controller.saveCapture({
      sessionId: "capture-a",
      title: "Meeting",
      acknowledged: true,
    });
    s.emit({ startMs: Infinity });
    await expect(s.controller.flush()).rejects.toThrow(/Invalid final/);
    expect(s.controller.value.saving).toBe(false);
    expect(s.controller.value.error).toContain("Invalid final");
    expect(s.capture().state).toBe("ACTIVE");
    expect((await s.controller.requireStore().get(doc.id)).segmentCount).toBe(
      0,
    );
  });
  it("rejects stale and cross-profile IDs and disables further persistence when history is switched off", async () => {
    const s = setup();
    await s.configure();
    s.start();
    const doc = await s.controller.saveCapture({
      sessionId: "capture-a",
      title: "Meeting",
      acknowledged: true,
    });
    await s.controller.configure({
      settings: { enabled: false, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    s.emit();
    await s.controller.flush();
    expect(s.controller.value.saving).toBe(false);
    expect((await s.controller.requireStore().get(doc.id)).status).toBe(
      "ended",
    );
    await expect(
      s.controller.resume({ id: "unknown", acknowledged: false }),
    ).rejects.toThrow(/Acknowledge/);
  });
});
