import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceHarness } from "./workspace-helpers";
import { meetingHarness } from "./meeting-ai-helpers";
import {
  meetingMemories,
  documentMemories,
} from "../src/main/workspace/memory";
import type { MemoryRecord, Person } from "../src/shared/workspace";
import { EMPTY_FACTS } from "../src/shared/workspace";
import type { KnowledgeDocument } from "../src/shared/knowledge";

async function setup() {
  const meeting = await meetingHarness();
  meeting.stop();
  await meeting.recorder.flush();
  const store = meeting.recorder.requireStore(),
    doc = await store.get(meeting.saved!.id);
  doc.notes =
    "The prototype release is Thursday. The checklist is due Wednesday.";
  doc.tags = ["prototype"];
  doc.decisions = [
    {
      id: "decision",
      text: "Release Thursday",
      evidence: [],
      uncertainty: "explicit",
      authorship: "user",
      at: null,
    },
  ];
  doc.actions = [
    {
      id: "action",
      text: "Prepare checklist Wednesday",
      evidence: [],
      uncertainty: "explicit",
      authorship: "user",
      owner: null,
      deadline: null,
      status: "open",
    },
  ];
  const saved = await store.update(doc, doc.revision, 30);
  const workspace = await workspaceHarness({
    meetings: meeting.recorder,
    personal: { value: { unlocked: false } } as never,
  });
  await workspace.command("configure", {
    settings: { ...workspace.controller.value.config, memoryEnabled: true },
    acknowledged: true,
  });
  return {
    meeting,
    ...workspace,
    saved,
    close: async () => {
      await workspace.close();
      await meeting.close();
    },
  };
}
const memoryEdit = (m: MemoryRecord) => ({
  id: m.id,
  updatedAt: m.updatedAt,
  type: m.type,
  description: m.description,
  personIds: m.personIds,
  topics: m.topics,
  status: m.status,
  review: "approved",
});
describe("P10 opt-in, traceable encrypted memory", () => {
  it("revokes a prepared memory context when retention expires before sending", async () => {
    vi.useFakeTimers();
    const h = await workspaceHarness();
    try {
      await h.command("configure", {
        settings: {
          ...h.controller.value.config,
          memoryEnabled: true,
          memoryRetentionDays: 30,
        },
        acknowledged: true,
      });
      const m = (await h.command("save-memory", {
        id: "new",
        updatedAt: 0,
        type: "note",
        description: "Explicit test context",
        personIds: [],
        topics: [],
        status: "open",
        review: "approved",
      })) as MemoryRecord;
      const built = await h.controller.buildContext("test", {
        purpose: "answer",
        eventId: null,
        description: false,
        personIds: [],
        memoryIds: [m.id],
        meetingIds: [],
      });
      expect(built.valid()).toBe(true);
      vi.setSystemTime(Date.now() + 31 * 86400000);
      expect(built.valid()).toBe(false);
    } finally {
      await h.close();
      vi.useRealTimers();
    }
  });
  it("restores only after the interface has completed its initial load, and keeps capture off", async () => {
    const h = await workspaceHarness();
    try {
      await h.command("configure", {
        settings: { ...h.controller.value.config, restoreOnStartup: true },
        acknowledged: true,
      });
      h.controller.lock();
      expect(h.controller.value.unlocked).toBe(false);
      await h.controller.restoreChosen();
      expect(h.controller.value.unlocked).toBe(true);
      expect(h.controller.value.suggestion).toBeNull();
      expect(h.reads).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("refuses extraction without enablement, source acknowledgement or a selected saved source", async () => {
    const h = await workspaceHarness();
    try {
      await expect(
        h.command("rebuild-memory", {
          meetingIds: [],
          documentIds: [],
          acknowledged: true,
        }),
      ).rejects.toThrow("Enable");
      expect(h.reads).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("extracts literal saved notes, decisions and actions as pending records without Google or AI", async () => {
    const h = await setup();
    try {
      const result = await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      expect(result).toEqual({ extracted: 3, pendingReview: true });
      const records = h
        .db()
        .workspaceList("memory")
        .map((r) => r.value as MemoryRecord);
      expect(
        records.every(
          (m) =>
            m.review === "pending" &&
            m.source.revision === h.saved.revision &&
            m.ref &&
            m.quote,
        ),
      ).toBe(true);
      expect(records.find((m) => m.type === "action")?.description).toContain(
        "Wednesday",
      );
      expect(
        readFileSync(join(h.root, `${h.profile}.sqlite`)).includes(
          Buffer.from("prototype release"),
        ),
      ).toBe(false);
      expect(h.reads).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("keeps pending memories out of AI context, then permits an explicitly reviewed record", async () => {
    const h = await setup();
    try {
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      let m = h.db().workspaceList("memory")[0]!.value as MemoryRecord;
      const selection = {
        purpose: "answer" as const,
        eventId: null,
        description: false,
        personIds: [],
        memoryIds: [m.id],
        meetingIds: [],
      };
      await expect(
        h.controller.buildContext("prototype", selection),
      ).rejects.toThrow("reviewed");
      m = (await h.command("save-memory", memoryEdit(m))) as MemoryRecord;
      const context = await h.controller.buildContext("prototype", selection);
      expect(context.context.entries[0]?.sourceRef).toBe(m.ref);
      expect(context.valid()).toBe(true);
      await h.command("delete-memory", { id: m.id, acknowledged: true });
      expect(context.valid()).toBe(false);
    } finally {
      await h.close();
    }
  });
  it("invalidates and removes memory after editing or deleting its saved source", async () => {
    const h = await setup();
    try {
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      const store = h.meeting.recorder.requireStore(),
        doc = await store.get(h.saved.id);
      await store.update({ ...doc, notes: "Revised notes" }, doc.revision, 30);
      await h.controller.sourceChanged("meeting");
      expect(h.controller.value.memoryCount).toBe(0);
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      await store.delete(h.saved.id);
      await h.controller.reconcileSources();
      expect(h.controller.value.memoryCount).toBe(0);
    } finally {
      await h.close();
    }
  });
  it("preserves disabled local records while preventing their remote selection", async () => {
    const h = await setup();
    try {
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      let m = h.db().workspaceList("memory")[0]!.value as MemoryRecord;
      m = (await h.command("save-memory", memoryEdit(m))) as MemoryRecord;
      await h.command("configure", {
        settings: { ...h.controller.value.config, memoryEnabled: false },
        acknowledged: true,
      });
      expect(h.controller.value.memoryCount).toBe(3);
      await expect(
        h.controller.buildContext("prototype", {
          purpose: "answer",
          eventId: null,
          description: false,
          personIds: [],
          memoryIds: [m.id],
          meetingIds: [],
        }),
      ).rejects.toThrow("reviewed");
    } finally {
      await h.close();
    }
  });
  it("honours meeting exclusions and cascades deletion without deleting independent history", async () => {
    const h = await setup();
    try {
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      await h.command("configure", {
        settings: {
          ...h.controller.value.config,
          excludedMeetingIds: [h.saved.id],
        },
        acknowledged: true,
      });
      expect(h.controller.value.memoryCount).toBe(0);
      expect(
        (await h.meeting.recorder.requireStore().get(h.saved.id)).title,
      ).toBe(h.saved.title);
      await expect(
        h.command("rebuild-memory", {
          meetingIds: [h.saved.id],
          documentIds: [],
          acknowledged: true,
        }),
      ).rejects.toThrow("excluded");
    } finally {
      await h.close();
    }
  });
  it("matches person associations and keyword topics through P9 retrieval and removes person links", async () => {
    const h = await setup();
    try {
      const p = (await h.command("save-person", {
        id: "new",
        manual: { ...EMPTY_FACTS, name: "Alex" },
        notes: "",
        meetingIds: [h.saved.id],
        updatedAt: 0,
      })) as Person;
      await h.command("rebuild-memory", {
        meetingIds: [h.saved.id],
        documentIds: [],
        acknowledged: true,
      });
      const result = await h.controller.query({
        scopeId: h.controller.value.scopeId,
        query: {
          kind: "memory",
          query: "prototype",
          offset: 0,
          personId: p.id,
          meetingId: h.saved.id,
        },
      });
      expect(result.items).toHaveLength(3);
      await h.command("delete-person", { id: p.id, acknowledged: true });
      expect(
        h
          .db()
          .workspaceList("memory")
          .every((r) => (r.value as MemoryRecord).personIds.length === 0),
      ).toBe(true);
    } finally {
      await h.close();
    }
  });
  it("edits user notes, detects stale edits, deletes all, and retains the saved source", async () => {
    const h = await setup();
    try {
      const m = (await h.command("save-memory", {
        id: "new",
        updatedAt: 0,
        type: "note",
        description: "My explicit project context",
        personIds: [],
        topics: ["prototype"],
        status: "open",
        review: "approved",
      })) as MemoryRecord;
      expect(m.source.kind).toBe("user");
      await h.command("save-memory", {
        ...memoryEdit(m),
        description: "My corrected context",
      });
      await expect(h.command("save-memory", memoryEdit(m))).rejects.toThrow(
        "changed",
      );
      await h.command("delete-all-memory", { acknowledged: true });
      expect(h.controller.value.memoryCount).toBe(0);
      expect(
        await h.meeting.recorder.requireStore().get(h.saved.id),
      ).toBeTruthy();
    } finally {
      await h.close();
    }
  });
  it("extracts document evidence without fabricating fields and refuses disabled documents", () => {
    const doc: KnowledgeDocument = {
      id: "release",
      name: "Release",
      type: "md",
      bytes: 80,
      importedAt: 1,
      updatedAt: 2,
      enabled: true,
      status: "ready",
      notices: [],
      sectionCount: 1,
    };
    const records = documentMemories(
      doc,
      [
        {
          id: "s0",
          heading: "Prototype",
          text: "Release is Thursday.",
          page: null,
        },
      ],
      3,
    );
    expect(records[0]).toMatchObject({
      quote: "Release is Thursday.",
      review: "pending",
      source: { id: "release", sectionId: "s0", revision: 2 },
      personIds: [],
    });
    expect(() => documentMemories({ ...doc, enabled: false }, [], 3)).toThrow(
      "Enable",
    );
  });
  it("refuses active or temporary meeting extraction and ignores unsupported AI claims", async () => {
    const h = await setup();
    try {
      const doc = { ...h.saved, status: "active" as const };
      expect(() => meetingMemories(doc, [], [], Date.now())).toThrow("ended");
      const records = meetingMemories(
        {
          ...h.saved,
          notes: "",
          actions: [],
          decisions: [
            {
              ...h.saved.decisions[0]!,
              authorship: "ai",
              evidence: [{ ref: "invented", quote: "unsupported" }],
            },
          ],
        },
        [],
        [],
        Date.now(),
      );
      expect(records).toHaveLength(0);
    } finally {
      await h.close();
    }
  });
  it("expires retained memory and never shares cross-profile context", async () => {
    const h = await setup();
    try {
      await h.command("save-memory", {
        id: "new",
        updatedAt: 0,
        type: "note",
        description: "Retained context",
        personIds: [],
        topics: [],
        status: "open",
        review: "approved",
      });
      const row = h.db().workspaceList("memory")[0]!,
        m = row.value as MemoryRecord;
      h.db().workspaceBatch(
        [
          {
            kind: "memory",
            id: m.id,
            value: { ...m, updatedAt: Date.now() - 100 * 86400000 },
            updatedAt: Date.now(),
            expiresAt: null,
          },
        ],
        [],
      );
      await h.controller.reconcileSources();
      expect(h.controller.value.memoryCount).toBe(0);
      const pending = h.controller.buildContext("", {
        purpose: "answer",
        eventId: null,
        description: false,
        personIds: [],
        memoryIds: [],
        meetingIds: [h.saved.id],
      });
      h.controller.switchProfile("b".repeat(64));
      await expect(pending).rejects.toThrow("changed");
    } finally {
      await h.close();
    }
  });
  it("keeps a bounded globally ranked page, including matches beyond the first 25 records", async () => {
    const h = await setup();
    try {
      const now = Date.now();
      const rows = Array.from({ length: 60 }, (_, i) => ({
        kind: "memory" as const,
        id: `memory-${i}`,
        updatedAt: now + i,
        expiresAt: null,
        value: {
          id: `memory-${i}`,
          type: "note",
          description: i === 0 ? "Rare orchid prototype" : "ordinary",
          quote: i === 0 ? "Rare orchid prototype" : "ordinary",
          ref: "user:note",
          source: { kind: "user", id: "note", revision: 1, title: "User" },
          createdAt: now,
          updatedAt: now,
          lastVerifiedAt: now,
          personIds: [],
          topics: [],
          status: "open",
          review: "approved",
          authorship: "user",
        },
      }));
      h.db().workspaceBatch(rows, []);
      const r = await h.controller.query({
        scopeId: h.controller.value.scopeId,
        query: { kind: "memory", query: "orchid", offset: 0 },
      });
      expect((r.items[0] as MemoryRecord).description).toContain("orchid");
      expect(r.items).toHaveLength(1);
      expect(r.scanned).toBe(60);
    } finally {
      await h.close();
    }
  });
});
