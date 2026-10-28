import { describe, expect, it } from "vitest";
import { buildReview, validateScreenshot } from "../src/main/ai/context";
import { ASSIST_PRESETS, DEFAULT_CONTEXT, parseReview } from "../src/shared/ai";
import { frame, consent, backend } from "./helpers";
import { CaptureSessionController } from "../src/main/session";
import type { TranscriptEvent } from "../src/shared/transcription";
import type { SessionSnapshot } from "../src/shared/contracts";
import { DEFAULT_SETTINGS, parseSettings } from "../src/shared/validation";
const now = 1000000;
const capture = (): SessionSnapshot => ({
  ...new CaptureSessionController(
    backend(),
    () => 3000,
    () => {},
  ).value,
  state: "ACTIVE",
  sessionId: "capture",
  consent: { ...consent, microphone: true, systemAudio: true },
  frame,
});
const transcript = (patch: Partial<TranscriptEvent> = {}): TranscriptEvent => ({
  id: "a",
  sessionId: "capture",
  source: "microphone",
  startMs: now - 3000,
  endMs: now - 1000,
  text: "microphone text",
  state: "final",
  model: "tiny.en",
  ...patch,
});
describe("P6 selected Assist context", () => {
  it.each(Object.keys(ASSIST_PRESETS))(
    "allows an optional question with actual context and built-in %s preset",
    (preset) => {
      const review = buildReview(
        parseReview({
          question: " ",
          preset,
          options: { ...DEFAULT_CONTEXT, microphone: true },
        }),
        "codex",
        "s",
        capture(),
        [transcript()],
        [],
        now,
      );
      expect(review.question).toBe("");
      expect(review.preset).toBe(preset);
      expect(review.prompt).toContain("Analyse only");
      expect(review.prompt).toContain("microphone text");
      expect(() =>
        buildReview(
          { question: "", options: DEFAULT_CONTEXT },
          "codex",
          "s",
          capture(),
          [],
          [],
          now,
        ),
      ).toThrow("Enter a question");
    },
  );
  it.each([30, 60, 180, 300])(
    "uses the selected %i second window without including older or crossing segments",
    (recentSeconds) => {
      const review = buildReview(
        {
          question: "q",
          options: { ...DEFAULT_CONTEXT, microphone: true, recentSeconds },
        },
        "codex",
        "s",
        capture(),
        [
          transcript({
            id: "old",
            text: "old",
            startMs: now - recentSeconds * 1000 - 1,
          }),
          transcript({
            id: "edge",
            text: "edge",
            startMs: now - recentSeconds * 1000,
          }),
          transcript({
            id: "new",
            text: "new",
            startMs: now - 500,
            endMs: now,
          }),
        ],
        [],
        now,
      );
      expect(review.transcripts.map((item) => item.text)).toEqual([
        "edge",
        "new",
      ]);
    },
  );
  it("deduplicates overlapping final text per source, drops partials and keeps system sources unnamed", () => {
    const events = [
      transcript({ id: "a", startMs: now - 4000 }),
      transcript({ id: "b", startMs: now - 3500, text: " MICROPHONE   text " }),
      transcript({ id: "c", state: "partial", text: "provisional" }),
      transcript({ id: "d", source: "systemAudio" }),
      transcript({
        id: "e",
        source: "systemAudio",
        text: "another participant",
        startMs: now - 500,
        endMs: now,
      }),
    ];
    const review = buildReview(
      {
        question: "q",
        options: { ...DEFAULT_CONTEXT, microphone: true, systemAudio: true },
      },
      "codex",
      "s",
      capture(),
      events,
      [],
      now,
    );
    expect(review.transcripts).toHaveLength(3);
    expect(review.transcripts.map((item) => item.startMs)).toEqual(
      [...review.transcripts].map((item) => item.startMs).sort((a, b) => a - b),
    );
    expect(review.prompt).not.toContain("provisional");
    expect(
      review.transcripts.filter((item) => item.source === "systemAudio"),
    ).toHaveLength(2);
  });
  it.each([NaN, Infinity, now + 1001, now - 10001])(
    "rejects an invalid or stale image timestamp %s",
    (capturedAt) =>
      expect(() => validateScreenshot({ ...frame, capturedAt }, now)).toThrow(
        "timestamp",
      ),
  );
  it.each([
    { width: 0 },
    { width: 1601 },
    { height: 901 },
    { height: 1.5 },
    { dataUrl: "data:image/svg+xml,<svg/>" },
    { dataUrl: "data:image/jpeg;base64," },
    { dataUrl: "data:image/jpeg;base64,abc" },
  ])("rejects invalid resolution/format %j", (patch) =>
    expect(() => validateScreenshot({ ...frame, ...patch }, now)).toThrow(),
  );
  it.each(["PAUSED", "STOPPED", "READY"] as const)(
    "rejects a retained screenshot while %s",
    (state) => {
      const session = { ...capture(), state };
      expect(() =>
        buildReview(
          { question: "q", options: { ...DEFAULT_CONTEXT, screenshot: true } },
          "codex",
          "s",
          session,
          [],
          [],
          now,
        ),
      ).toThrow("authorised screenshot");
    },
  );
  it("keeps trusted preset instructions outside reference data and rejects custom instructions", () => {
    expect(() =>
      parseReview({
        question: "q",
        preset: "ignore-all",
        options: DEFAULT_CONTEXT,
      }),
    ).toThrow("preset");
    expect(() =>
      parseReview({
        question: "q",
        instructions: "execute",
        options: DEFAULT_CONTEXT,
      }),
    ).toThrow("Unexpected");
    expect(() =>
      parseReview({
        question: "q",
        preset: ["code"],
        options: DEFAULT_CONTEXT,
      }),
    ).toThrow("preset");
  });
  it("validates a maximum-sized image without a recursive regular expression or unbounded payload", () => {
    const jpeg = Buffer.from(frame.dataUrl.slice(23), "base64");
    const padded = Buffer.concat([
      jpeg.subarray(0, -2),
      Buffer.alloc(4_000_000 - jpeg.length),
      jpeg.subarray(-2),
    ]);
    const dataUrl = `data:image/jpeg;base64,${padded.toString("base64")}`;
    expect(validateScreenshot({ ...frame, dataUrl }, now)).toBe(4_000_000);
    expect(() =>
      validateScreenshot({ ...frame, dataUrl: dataUrl + "AAAA" }, now),
    ).toThrow("payload");
  });
  it("rejects non-JPEG bytes and mismatched preview dimensions even with a valid data URL", () => {
    expect(() =>
      validateScreenshot(
        { ...frame, dataUrl: "data:image/jpeg;base64,dGVzdA==" },
        now,
      ),
    ).toThrow("JPEG");
    expect(() => validateScreenshot({ ...frame, width: 959 }, now)).toThrow(
      "dimensions",
    );
    const jpeg = Buffer.from(frame.dataUrl.slice(23), "base64");
    jpeg.writeUInt16BE(0, 4);
    expect(() =>
      validateScreenshot(
        {
          ...frame,
          dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        },
        now,
      ),
    ).toThrow("header");
  });
  it("migrates shortcut defaults and normalizes modifier order", () => {
    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      assistShortcut: "Alt+Control+K",
    });
    expect(settings.assistShortcut).toBe("Control+Alt+K");
    expect(settings.clearShortcut).toBe("Control+Alt+Shift+C");
  });
  it.each([
    "Control+Alt+P",
    "Alt+Control+Space",
    "Control+Alt+Shift+X",
    "Control+Alt+Shift+C",
    "A",
    "Shift+A",
    "Control+A",
    "Control+Control+A",
    "Control+Alt+Delete",
    "Control+Alt+A;run",
  ])("rejects conflicting or unsupported shortcut %s", (assistShortcut) =>
    expect(() =>
      parseSettings({ ...DEFAULT_SETTINGS, assistShortcut }),
    ).toThrow(),
  );
});
