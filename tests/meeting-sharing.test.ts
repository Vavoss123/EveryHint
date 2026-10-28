import { afterEach, describe, expect, it, vi } from "vitest";
import { access, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  MeetingSharing,
  exportMeeting,
  readableSummary,
} from "../src/main/meetings/sharing";
import {
  meetingEmailURL,
  parseMeetingShare,
  type MeetingExportFormat,
} from "../src/shared/meeting-sharing";
import { meetingHarness } from "./meeting-ai-helpers";
import { deferred } from "./helpers";
const fixtures: Awaited<ReturnType<typeof meetingHarness>>[] = [];
async function setup() {
  const s = await meetingHarness();
  fixtures.push(s);
  s.stop();
  await s.recorder.flush();
  const store = s.recorder.requireStore(),
    doc = await store.get(s.saved!.id);
  doc.notes =
    'My manual notes <script>alert("fixture")</script> [link](https://invalid.example)';
  doc.actions = [
    {
      id: "task-a",
      text: "Prepare checklist",
      owner: null,
      deadline: null,
      status: "open",
      evidence: [],
      uncertainty: "explicit",
      authorship: "user",
    },
  ];
  const saved = await store.update(doc, doc.revision, 30),
    ports = {
      choose: vi.fn(
        async () => join(s.root, "chosen-export.txt") as string | null,
      ),
      clipboard: vi.fn(),
      email: vi.fn(async (_url: string) => {
        void _url;
      }),
    };
  return {
    ...s,
    store,
    doc: saved,
    ports,
    sharing: new MeetingSharing(s.recorder, ports),
    base: {
      id: saved.id,
      expectedRevision: saved.revision,
      acknowledged: true,
    },
  };
}
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
  vi.restoreAllMocks();
});
describe("P8.4 explicit exports, clipboard and email handoff", () => {
  it("streams correct structured JSON with canonical saved metadata/provenance and every final segment", async () => {
    const s = await setup(),
      result = await s.sharing.export({ ...s.base, format: "meeting-json" }),
      json = JSON.parse(await readFile(join(s.root, result.name!), "utf8"));
    expect(json.format).toBe("EveryHint meeting export");
    expect(json.version).toBe(1);
    expect(json.meeting.id).toBe(s.doc.id);
    expect(json.meeting.notes).toBe(s.doc.notes);
    expect(json.segments).toHaveLength(3);
    expect(
      new Set(json.segments.map((value: { source: string }) => value.source))
        .size,
    ).toBe(2);
    expect(
      json.segments.every(
        (value: { state: string; meetingId: string }) =>
          value.state === "final" && value.meetingId === s.doc.id,
      ),
    ).toBe(true);
    expect(result.bytes).toBe(
      Buffer.byteLength(await readFile(join(s.root, result.name!), "utf8")),
    );
    expect(s.ports.choose).toHaveBeenCalledOnce();
    expect(s.ports.email).not.toHaveBeenCalled();
  });
  it("exports human-readable final transcripts with source timestamps/references and explicit labels", async () => {
    const s = await setup(),
      segment = s.store.contextSegments;
    void segment;
    const first = (await s.store.transcript(s.doc.id)).segments[0]!,
      ref = `${s.doc.id}/${first.sessionId}/${first.id}`;
    s.doc = await s.store.speakerLabels(
      s.doc.id,
      s.doc.revision,
      [{ ref, label: "My supplied label" }],
      30,
    );
    await s.sharing.export({
      ...s.base,
      expectedRevision: s.doc.revision,
      format: "transcript-txt",
    });
    const text = await readFile(join(s.root, "chosen-export.txt"), "utf8");
    expect(text).toContain("System audio (identity unknown)");
    expect(text).toContain("Microphone");
    expect(text).toContain("User label: My supplied label");
    expect(text).toContain(new Date(first.startMs).toISOString());
    expect(text).toContain(ref);
    expect(text).not.toContain(s.doc.notes);
  });
  it("exports Markdown with escaped untrusted content and readable summary without manual notes", async () => {
    const s = await setup();
    let markdown = "",
      summary = "";
    for await (const chunk of exportMeeting(s.store, s.doc, "notes-md"))
      markdown += chunk;
    for await (const chunk of exportMeeting(s.store, s.doc, "summary-txt"))
      summary += chunk;
    expect(markdown).toContain("# Labelled release fixture");
    expect(markdown).toContain("\\<script\\>");
    expect(markdown).toContain("MANUAL NOTES");
    expect(summary).toContain("Unassigned");
    expect(summary).toContain("Not specified");
    expect(summary).not.toContain("MANUAL NOTES");
    expect(summary).toBe(readableSummary(s.doc));
  });
  it("requires fresh acknowledgement/revision and rejects renderer-supplied file paths", async () => {
    const s = await setup();
    for (const input of [
      { ...s.base, format: "meeting-json", acknowledged: false },
      { ...s.base, format: "meeting-json", expectedRevision: 0 },
      {
        ...s.base,
        format: "meeting-json",
        path: join(s.root, "surprise.json"),
      },
      { ...s.base, format: "html" },
    ])
      await expect(s.sharing.export(input)).rejects.toThrow();
    expect(s.ports.choose).not.toHaveBeenCalled();
    expect(() =>
      parseMeetingShare({ ...s.base, kind: "entire-history" }, "kind"),
    ).toThrow();
  });
  it("cancels the native dialog without producing a plaintext file", async () => {
    const s = await setup();
    s.ports.choose.mockResolvedValueOnce(null);
    expect(
      await s.sharing.export({ ...s.base, format: "transcript-txt" }),
    ).toEqual({ cancelled: true, name: null, bytes: 0 });
    await expect(access(join(s.root, "chosen-export.txt"))).rejects.toThrow();
  });
  it("preserves an existing chosen file instead of silently overwriting it", async () => {
    const s = await setup(),
      path = join(s.root, "chosen-export.txt");
    await writeFile(path, "Existing export stays intact");
    await expect(
      s.sharing.export({ ...s.base, format: "summary-txt" }),
    ).rejects.toThrow(/already exists/);
    expect(await readFile(path, "utf8")).toBe("Existing export stays intact");
  });
  it("rejects profile changes during the native dialog and serialises multiple exports", async () => {
    const s = await setup(),
      choice = deferred<string | null>();
    s.ports.choose.mockReturnValueOnce(choice.promise);
    const exportPromise = s.sharing.export({
      ...s.base,
      format: "summary-txt",
    });
    await vi.waitFor(() => expect(s.ports.choose).toHaveBeenCalledOnce());
    await expect(
      s.sharing.copy({ ...s.base, kind: "summary" }),
    ).rejects.toThrow(/Finish/);
    s.recorder.lock();
    choice.resolve(join(s.root, "chosen-export.txt"));
    await expect(exportPromise).rejects.toThrow(/Nothing was exported/);
    await expect(access(join(s.root, "chosen-export.txt"))).rejects.toThrow();
  });
  it("removes a newly created incomplete export if data changes during transcript retrieval", async () => {
    const s = await setup(),
      original = s.store.transcript;
    vi.spyOn(s.store, "transcript").mockImplementationOnce(async (...args) => {
      const page = await original(...args);
      const doc = await s.store.get(s.doc.id);
      doc.title = "Changed during export";
      await s.store.update(doc, doc.revision, 30);
      return page;
    });
    await expect(
      s.sharing.export({ ...s.base, format: "transcript-txt" }),
    ).rejects.toThrow(/changed/);
    await expect(access(join(s.root, "chosen-export.txt"))).rejects.toThrow();
  });
  it("copies only the selected saved content after explicit acknowledgement", async () => {
    const s = await setup();
    await s.sharing.copy({ ...s.base, kind: "actions" });
    expect(s.ports.clipboard.mock.calls[0]![0]).toContain("Prepare checklist");
    expect(s.ports.clipboard.mock.calls[0]![0]).not.toContain(s.doc.notes);
    await s.sharing.copy({ ...s.base, kind: "summary" });
    expect(s.ports.clipboard.mock.calls[1]![0]).toBe(readableSummary(s.doc));
    await s.sharing.copy({ ...s.base, kind: "transcript" });
    expect(s.ports.clipboard.mock.calls[2]![0]).toContain(s.events[0]!.text);
    await expect(
      s.sharing.copy({ ...s.base, kind: "summary", acknowledged: false }),
    ).rejects.toThrow(/Acknowledge/);
    expect(s.ports.email).not.toHaveBeenCalled();
  });
  it("bounds clipboard transcripts and refuses partial copying", async () => {
    const s = await setup();
    vi.spyOn(s.store, "transcript").mockResolvedValue({
      segments: Array.from({ length: 100 }, (_, index) => ({
        ...s.events[0]!,
        id: `large-${index}`,
        meetingId: s.doc.id,
        text: "x".repeat(12000),
      })),
      nextOffset: null,
    });
    await expect(
      s.sharing.copy({ ...s.base, kind: "transcript" }),
    ).rejects.toThrow(/too large/);
    expect(s.ports.clipboard).not.toHaveBeenCalled();
  });
  it("previews exact explicitly supplied mailto fields, permits blank recipients and requires approval", async () => {
    const s = await setup(),
      input = {
        to: "",
        subject: "Release follow-up",
        body: "Please review the agreed checklist.",
        acknowledged: true,
      };
    await expect(
      s.sharing.email({ ...input, acknowledged: false }),
    ).rejects.toThrow(/Approve/);
    expect(s.ports.email).not.toHaveBeenCalled();
    await s.sharing.email(input);
    const url = new URL(s.ports.email.mock.calls[0]![0]);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("");
    expect(url.searchParams.get("subject")).toBe(input.subject);
    expect(url.searchParams.get("body")).toBe(input.body);
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
  });
  it("escapes query injection and blocks header injection, arbitrary URLs and oversized handoffs without truncation", () => {
    const base = {
        to: "person@example.test",
        subject: "Subject &bcc=hidden@example.test",
        body: "Literal body ?subject=other &bcc=hidden",
        acknowledged: true,
      },
      url = new URL(meetingEmailURL(base));
    expect(url.searchParams.get("bcc")).toBeNull();
    expect(url.searchParams.get("subject")).toBe(base.subject);
    expect(url.searchParams.get("body")).toBe(base.body);
    for (const change of [
      { to: "a@example.test\r\nBcc: hidden@example.test" },
      { subject: "test\nCc: hidden@example.test" },
      { to: "https://example.test" },
      { body: "x".repeat(1800) },
      { url: "https://example.test" },
    ])
      expect(() => meetingEmailURL({ ...base, ...change })).toThrow();
  });
  it("generates a labelled follow-up fixture only through selected reviewed context and keeps it unsaved", async () => {
    const s = await setup();
    s.mockProvider.respond.mockImplementationOnce(async function* (request) {
      expect(request.meetingContext!.purpose).toBe("follow-up");
      expect(request.meetingContext!.meetings.map((item) => item.id)).toEqual([
        s.doc.id,
      ]);
      expect(request.history).toEqual([]);
      expect(request.screenshot).toBeNull();
      yield {
        type: "complete",
        text: "Subject: Release follow-up\n\nWe decided to release on Thursday. Please review the checklist. [selected reference]",
        model: "fixture-plan",
      };
    });
    const reviewId = await s.ai.prepare({
      ...s.selection,
      purpose: "follow-up",
    });
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    await s.ai.ask({ reviewId, acknowledged: true });
    await vi.waitFor(() => expect(s.ai.value.status).toBe("draft"));
    expect(s.ai.value.textDraft).toContain("Subject:");
    expect((await s.store.get(s.doc.id)).notes).toBe(s.doc.notes);
    expect(s.ports.email).not.toHaveBeenCalled();
  });
  it("produces complete bounded pages for each available format without creating temporary plaintext files", async () => {
    const s = await setup(),
      before = await readdir(s.root);
    for (const format of [
      "transcript-txt",
      "notes-md",
      "meeting-json",
      "summary-txt",
    ] as MeetingExportFormat[]) {
      let result = "";
      for await (const chunk of exportMeeting(s.store, s.doc, format))
        result += chunk;
      expect(result.length).toBeGreaterThan(20);
    }
    expect(await readdir(s.root)).toEqual(before);
  });
});
