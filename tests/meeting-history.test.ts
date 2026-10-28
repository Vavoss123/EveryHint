import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { MeetingDatabase } from "../src/main/meetings/database";
import { editMeeting } from "../src/main/meetings/edits";
import { parseMeetingEdit } from "../src/shared/meeting-edits";
import {
  DEFAULT_MEETING_QUERY,
  parseMeetingQuery,
  type MeetingDocument,
} from "../src/shared/meetings";
import { registerMeetingIPC } from "../src/main/meetings/ipc";
import { MeetingSharing } from "../src/main/meetings/sharing";
import { meetingHarness } from "./meeting-ai-helpers";
import { deferred } from "./helpers";
const roots: string[] = [],
  databases: MeetingDatabase[] = [],
  harnesses: Awaited<ReturnType<typeof meetingHarness>>[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "everyhint-p8-history-")),
    key = randomBytes(32),
    file = join(root, "history.sqlite");
  roots.push(root);
  let now = 1793196000000;
  const db = new MeetingDatabase(file, key, "a".repeat(64), () => now);
  databases.push(db);
  return {
    root,
    file,
    key,
    db,
    now: () => now,
    setNow: (value: number) => {
      now = value;
    },
  };
}
function transcript(s: ReturnType<typeof setup>, count = 3) {
  const doc = s.db.create("Release review", 30);
  s.db.begin(
    doc.id,
    {
      sessionId: "capture-fixture",
      startedAt: s.now() - 5000,
      endedAt: null,
      sources: [
        { kind: "systemAudio", name: "Labelled fixture source", id: null },
      ],
    },
    30,
  );
  for (let i = 0; i < count; i += 100)
    s.db.append(
      doc.id,
      "capture-fixture",
      Array.from({ length: Math.min(100, count - i) }, (_, index) => ({
        id: `utterance-${i + index}`,
        sessionId: "capture-fixture",
        source: "systemAudio" as const,
        state: "final" as const,
        startMs: s.now() - count + i + index,
        endMs: s.now() - count + i + index + 1,
        text:
          i + index === count - 1
            ? "We agreed to publish the orchid release on Thursday."
            : `Ordinary discussion segment ${i + index}.`,
        model: "tiny.en",
      })),
      30,
    );
  return s.db.finish(doc.id, "capture-fixture", false, 30);
}
afterEach(async () => {
  for (const s of harnesses.splice(0)) await s.close();
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
describe("P8.3 bounded encrypted history search and editing", () => {
  it("searches title/tags/manual notes/generated sections/decisions/actions with useful bounded snippets", () => {
    const s = setup(),
      doc = transcript(s);
    doc.notes = "Manual sapphire note.";
    doc.tags = ["Release-Review"];
    doc.summary = {
      overview: {
        text: "Amber overview",
        evidence: [],
        uncertainty: "uncertain",
        authorship: "ai",
      },
      topics: [],
      points: [],
      outstanding: [],
      nextSteps: [],
      model: "fixture",
      generatedAt: s.now(),
    };
    doc.decisions = [
      {
        id: "decision-a",
        text: "Choose the teal branch",
        evidence: [],
        uncertainty: "explicit",
        authorship: "ai",
        at: s.now(),
      },
    ];
    doc.actions = [
      {
        id: "action-a",
        text: "Prepare violet checklist",
        owner: null,
        deadline: null,
        status: "open",
        evidence: [],
        uncertainty: "explicit",
        authorship: "ai",
      },
    ];
    s.db.update(doc, doc.revision, 30);
    for (const query of [
      "release review",
      "release-review",
      "sapphire",
      "amber",
      "teal",
      "violet",
    ]) {
      const page = s.db.list({ ...DEFAULT_MEETING_QUERY, query });
      expect(page.items.map((item) => item.id)).toEqual([doc.id]);
      expect(page.items[0]!.snippet!.toLowerCase()).toContain(query);
      expect(page.items[0]!.snippet!.length).toBeLessThanOrEqual(220);
    }
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, query: "missing" }).items,
    ).toEqual([]);
  });
  it("matches only an exact case-folded tag and applies displayed meeting-date/status filters", () => {
    const s = setup(),
      doc = transcript(s);
    doc.tags = ["Release-Review"];
    s.db.update(doc, doc.revision, 30);
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, tag: "RELEASE-REVIEW" }).items,
    ).toHaveLength(1);
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, tag: "release" }).items,
    ).toEqual([]);
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, query: "orchid", status: "draft" })
        .items,
    ).toEqual([]);
    expect(
      s.db.list({
        ...DEFAULT_MEETING_QUERY,
        query: "orchid",
        from: s.now() + 1,
      }).items,
    ).toEqual([]);
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, to: doc.startedAt! - 1 }).items,
    ).toEqual([]);
    expect(
      s.db
        .list({
          ...DEFAULT_MEETING_QUERY,
          from: doc.startedAt!,
          to: doc.startedAt!,
        })
        .items.map((item) => item.id),
    ).toEqual([doc.id]);
  });
  it("continues deep transcript search beyond 1000 without losing or duplicating a meeting", () => {
    const s = setup(),
      doc = transcript(s, 1105),
      query = { ...DEFAULT_MEETING_QUERY, query: "orchid" };
    const first = s.db.list(query);
    expect(first.items).toEqual([]);
    expect(first.scanned).toBe(1000);
    expect(first.partial).toBe(true);
    const next = s.db.list({ ...query, offset: first.nextOffset! });
    expect(next.items.map((item) => item.id)).toEqual([doc.id]);
    expect(next.scanned).toBe(105);
    expect(next.nextOffset).toBeNull();
    expect(next.items[0]!.snippet).toContain("systemAudio");
  });
  it("bounds matching metadata to 25 meetings per search step and paginates global ordering", () => {
    const s = setup();
    for (let i = 0; i < 31; i++) {
      s.setNow(s.now() + 1);
      s.db.create(`Orchid review ${i}`, 30);
    }
    const query = {
        ...DEFAULT_MEETING_QUERY,
        query: "orchid",
        sort: "oldest" as const,
      },
      first = s.db.list(query),
      next = s.db.list({ ...query, offset: first.nextOffset! });
    expect(first.items).toHaveLength(25);
    expect(next.items).toHaveLength(6);
    expect(
      new Set([...first.items, ...next.items].map((item) => item.id)).size,
    ).toBe(31);
    expect(first.items[0]!.title).toBe("Orchid review 0");
    expect(next.items.at(-1)!.title).toBe("Orchid review 30");
    expect(next.nextOffset).toBeNull();
  });
  it("does not persist a plaintext search index and expires cursors on deletion/restart", () => {
    const s = setup(),
      doc = transcript(s, 1100),
      query = { ...DEFAULT_MEETING_QUERY, query: "orchid" },
      first = s.db.list(query);
    for (const file of readdirSync(s.root))
      expect(
        readFileSync(join(s.root, file)).includes(Buffer.from("orchid")),
      ).toBe(false);
    s.db.delete(doc.id);
    expect(() => s.db.list({ ...query, offset: first.nextOffset! })).toThrow(
      /expired/,
    );
    const reopened = new MeetingDatabase(s.file, s.key, "a".repeat(64), s.now);
    databases.push(reopened);
    expect(() =>
      reopened.list({ ...query, offset: first.nextOffset! }),
    ).toThrow(/expired/);
    expect(reopened.list(query).items).toEqual([]);
  });
  it("searches full transcripts in batches capped at 30 matches and 1000 scans", () => {
    const s = setup(),
      doc = transcript(s, 1100);
    let result = s.db.findTranscript(doc.id, "Ordinary", 0);
    expect(result.segments).toHaveLength(30);
    expect(result.scanned).toBe(30);
    expect(result.nextOffset).toBe(30);
    result = s.db.findTranscript(doc.id, "orchid", 0);
    expect(result.segments).toEqual([]);
    expect(result.nextOffset).toBe(1000);
    result = s.db.findTranscript(doc.id, "orchid", result.nextOffset!);
    expect(result.segments).toHaveLength(1);
    expect(result.nextOffset).toBeNull();
  });
  it("saves only explicit user speaker labels with optimistic versioning and authenticated encryption", () => {
    const s = setup(),
      doc = transcript(s),
      segment = s.db.transcript(doc.id).segments[0]!,
      ref = `${doc.id}/${segment.sessionId}/${segment.id}`;
    expect(segment.speakerLabel).toBeUndefined();
    const updated = s.db.speakerLabels(
      doc.id,
      doc.revision,
      [{ ref, label: "User supplied Alex" }],
      30,
    );
    expect(s.db.contextSegments(doc.id, [ref])[0]!.speakerLabel).toBe(
      "User supplied Alex",
    );
    expect(
      s.db.list({ ...DEFAULT_MEETING_QUERY, query: "User supplied Alex" })
        .items,
    ).toHaveLength(1);
    expect(() =>
      s.db.speakerLabels(doc.id, doc.revision, [{ ref, label: "stale" }], 30),
    ).toThrow(/changed/);
    expect(() =>
      s.db.speakerLabels(
        doc.id,
        updated.revision,
        [
          {
            ref: `other/${segment.sessionId}/${segment.id}`,
            label: "cross meeting",
          },
        ],
        30,
      ),
    ).toThrow(/Invalid/);
    expect(
      readFileSync(s.file).includes(Buffer.from("User supplied Alex")),
    ).toBe(false);
  });
  it("edits manual notes and structured sections while preserving untouched AI evidence/authorship", () => {
    const s = setup(),
      doc = transcript(s),
      claim = {
        text: "Release on Thursday",
        authorship: "ai" as const,
        uncertainty: "explicit" as const,
        evidence: [
          {
            ref: `${doc.id}/capture-fixture/utterance-2`,
            quote: "publish the orchid release on Thursday",
          },
        ],
      };
    doc.summary = {
      overview: claim,
      topics: [],
      points: [],
      outstanding: [],
      nextSteps: [],
      model: "fixture",
      generatedAt: s.now(),
    };
    doc.actions = [
      { ...claim, id: "action-a", owner: null, deadline: null, status: "open" },
    ];
    doc.decisions = [{ ...claim, id: "decision-a", at: s.now() }];
    const changed = editMeeting(
      doc,
      parseMeetingEdit({
        id: doc.id,
        expectedRevision: doc.revision,
        notes: "My manual notes",
        overview: "My corrected recap",
        actions: [
          {
            id: "action-a",
            text: claim.text,
            owner: null,
            deadline: null,
            status: "open",
          },
          {
            id: null,
            text: "My added task",
            owner: null,
            deadline: null,
            status: "in-progress",
          },
        ],
        decisions: [{ id: "decision-a", text: claim.text }],
      }),
    );
    expect(changed.notes).toBe("My manual notes");
    expect(changed.summary!.overview!.authorship).toBe("user");
    expect(changed.summary!.overview!.evidence).toEqual(claim.evidence);
    expect(changed.actions[0]!.authorship).toBe("ai");
    expect(changed.decisions[0]!.authorship).toBe("ai");
    expect(changed.actions[1]!.owner).toBeNull();
    expect(changed.actions[1]!.deadline).toBeNull();
    expect(changed.actions[1]!.authorship).toBe("user");
    expect(changed.editedSections).toEqual(
      expect.arrayContaining(["overview", "actions"]),
    );
    expect(doc.notes).toBe("");
  });
  it("marks explicit status/owner/deadline and decision changes as user corrections", () => {
    const s = setup(),
      doc = transcript(s);
    doc.actions = [
      {
        id: "action-a",
        text: "Prepare checklist",
        owner: null,
        deadline: null,
        status: "open",
        evidence: [],
        uncertainty: "explicit",
        authorship: "ai",
      },
    ];
    doc.decisions = [
      {
        id: "decision-a",
        text: "Choose release",
        at: 123,
        evidence: [],
        uncertainty: "explicit",
        authorship: "ai",
      },
    ];
    const changed = editMeeting(
      doc,
      parseMeetingEdit({
        id: doc.id,
        expectedRevision: doc.revision,
        actions: [
          {
            id: "action-a",
            text: "Prepare checklist",
            owner: "My supplied owner",
            deadline: "My supplied date",
            status: "completed",
          },
        ],
        decisions: [{ id: "decision-a", text: "My corrected decision" }],
      }),
    );
    expect(changed.actions[0]).toMatchObject({
      owner: "My supplied owner",
      deadline: "My supplied date",
      status: "completed",
      authorship: "user",
    });
    expect(changed.decisions[0]).toMatchObject({ at: 123, authorship: "user" });
    expect(() =>
      editMeeting(doc, {
        id: doc.id,
        expectedRevision: doc.revision + 1,
        notes: "stale",
      }),
    ).toThrow(/changed/);
  });
  it("rejects oversized/untrusted edits, duplicate IDs, invalid statuses, date ranges and hidden commands", () => {
    const base = { id: "meeting-a", expectedRevision: 1 };
    for (const change of [
      { title: " " },
      { notes: "a".repeat(40001) },
      {
        actions: [
          {
            id: null,
            text: "x",
            owner: null,
            deadline: null,
            status: "invented",
          },
        ],
      },
      {
        decisions: [
          { id: "a", text: "x" },
          { id: "a", text: "y" },
        ],
      },
      { shell: "powershell" },
    ])
      expect(() => parseMeetingEdit({ ...base, ...change })).toThrow();
    expect(() =>
      parseMeetingQuery({ ...DEFAULT_MEETING_QUERY, from: 5, to: 1 }),
    ).toThrow();
    expect(() =>
      parseMeetingQuery({ ...DEFAULT_MEETING_QUERY, query: "a\0b" }),
    ).toThrow();
  });
});
async function ipcSetup(saved = true) {
  const s = await meetingHarness({ saved });
  harnesses.push(s);
  const routes = new Map<string, (value: unknown) => unknown>(),
    cancel = vi.fn(() => s.ai.cancel()),
    changed = vi.fn(),
    sourcesChanged = vi.fn(async () => {});
  registerMeetingIPC({
    snapshotAI: () => ({ ...s.ai.value, ...s.post.value }),
    handle: (name, action) => {
      routes.set(name, action);
    },
    meetings: s.recorder,
    sharing: new MeetingSharing(s.recorder, {
      choose: async () => null,
      clipboard: vi.fn(),
      email: vi.fn(),
    }),
    ai: s.ai,
    post: s.post,
    stop: s.stop,
    cancelContent: cancel,
    revokeLive: vi.fn(),
    changed,
    sourcesChanged,
  });
  return {
    ...s,
    routes,
    sourcesChanged,
    cancel,
    changed,
    call: (name: string, input: unknown, scope = s.recorder.value.scopeId) =>
      Promise.resolve(
        routes.get(`everyhint:meetings-${name}`)!({ scopeId: scope, input }),
      ),
  };
}
describe("P8.3 trusted route payload/scope and lifecycle guards", () => {
  it("does not run derived-context cleanup in a new profile after an old edit completes", async () => {
    const s = await ipcSetup();
    s.stop();
    await s.recorder.flush();
    const store = s.recorder.requireStore(),
      doc = await store.get(s.saved!.id),
      pending = deferred<MeetingDocument>(),
      update = vi.spyOn(store, "update").mockReturnValueOnce(pending.promise);
    const write = s.call("edit", {
      id: doc.id,
      expectedRevision: doc.revision,
      notes: "Explicit test edit",
    });
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    s.recorder.lock();
    pending.resolve({ ...doc, revision: doc.revision + 1 });
    await expect(write).rejects.toThrow("No old-profile content");
    expect(s.sourcesChanged).not.toHaveBeenCalled();
  });
  it("rejects stale-profile commands before reading or deleting another profile", async () => {
    const s = await ipcSetup(),
      scope = s.recorder.value.scopeId;
    s.recorder.lock();
    await expect(
      s.call("delete-all", { acknowledged: true }, scope),
    ).rejects.toThrow(/profile changed/);
    expect(s.cancel).not.toHaveBeenCalled();
  });
  it("suppresses an old-profile read that completes after a profile switch", async () => {
    const s = await ipcSetup(),
      store = s.recorder.requireStore(),
      pending = deferred<MeetingDocument>();
    vi.spyOn(store, "get").mockReturnValueOnce(pending.promise);
    const read = s.call("get", { id: s.saved!.id });
    s.recorder.lock();
    pending.resolve(s.saved!);
    await expect(read).rejects.toThrow(/No old-profile content/);
  });
  it("requires a current revision plus explicit deletion and blocks deletion during capture", async () => {
    const s = await ipcSetup(),
      base = {
        id: s.saved!.id,
        expectedRevision: s.saved!.revision,
        action: "delete",
        acknowledged: true,
      };
    await expect(
      s.call("operation", { ...base, acknowledged: false }),
    ).rejects.toThrow(/Confirm/);
    await expect(
      s.call("operation", { ...base, expectedRevision: 0 }),
    ).rejects.toThrow(/changed/);
    await expect(s.call("operation", base)).rejects.toThrow(/End/);
    await expect(s.call("delete-all", { acknowledged: true })).rejects.toThrow(
      /End/,
    );
    s.stop();
    await s.recorder.flush();
    const doc = await s.recorder.requireStore().get(s.saved!.id);
    await s.call("operation", { ...base, expectedRevision: doc.revision });
    await expect(s.recorder.requireStore().get(doc.id)).rejects.toThrow();
    expect(s.cancel).toHaveBeenCalledOnce();
  });
  it("clears only AI-generated derivatives while retaining explicit user notes/corrections", async () => {
    const s = await ipcSetup();
    s.stop();
    await s.recorder.flush();
    const store = s.recorder.requireStore(),
      doc = await store.get(s.saved!.id),
      evidence = {
        text: "my content",
        evidence: [],
        uncertainty: "uncertain" as const,
      };
    doc.notes = "Manual notes retained";
    doc.summary = {
      overview: { ...evidence, authorship: "user" },
      topics: [{ ...evidence, authorship: "ai" }],
      points: [],
      outstanding: [],
      nextSteps: [],
      model: "fixture",
      generatedAt: Date.now(),
    };
    doc.actions = [
      {
        ...evidence,
        authorship: "user",
        id: "user-action",
        owner: null,
        deadline: null,
        status: "open",
      },
      {
        ...evidence,
        authorship: "ai",
        id: "ai-action",
        owner: null,
        deadline: null,
        status: "open",
      },
    ];
    const next = await store.update(doc, doc.revision, 30);
    await s.call("operation", {
      id: doc.id,
      expectedRevision: next.revision,
      action: "clear-generated",
      acknowledged: true,
    });
    const cleaned = await store.get(doc.id);
    expect(cleaned.notes).toBe("Manual notes retained");
    expect(cleaned.summary!.overview!.authorship).toBe("user");
    expect(cleaned.summary!.topics).toEqual([]);
    expect(cleaned.actions.map((item) => item.id)).toEqual(["user-action"]);
  });
  it("creates/reopens/arms a saved draft without starting capture or any inference", async () => {
    const s = await ipcSetup(false);
    s.setCapture({
      ...s.capture(),
      state: "STOPPED",
      sessionId: null,
      consent: null,
    });
    await s.recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    const doc = (await s.call("create", {
      title: "My manual meeting",
      acknowledged: true,
    })) as MeetingDocument;
    await s.call("get", { id: doc.id });
    await s.call("resume", { id: doc.id, acknowledged: true });
    expect(s.capture().state).toBe("STOPPED");
    expect(s.recorder.value.pendingResumeId).toBe(doc.id);
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    await s.call("cancel-resume", undefined);
    expect(s.recorder.value.pendingResumeId).toBeNull();
  });
  it("saves retained temporary text after Stop with actual run duration and no automatic AI", async () => {
    const s = await ipcSetup(false);
    s.stop();
    await s.recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    const doc = (await s.call("save-session", {
      title: "Retained fixture",
      sessionId: "capture-a",
      acknowledged: true,
    })) as MeetingDocument;
    expect(doc.status).toBe("ended");
    expect(doc.segmentCount).toBe(3);
    expect(doc.endedAt).toBe(
      Math.ceil(Math.max(...s.events.map((event) => event.endMs))),
    );
    expect(doc.durationMs).toBeLessThan(3000);
    expect(s.capture().state).toBe("STOPPED");
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
  });
});
