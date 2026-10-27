import { describe, expect, it } from "vitest";
import {
  TranscriptStore,
  removeOverlap,
} from "../src/main/transcription/transcripts";
import {
  DEFAULT_TRANSCRIPTION_SETTINGS,
  type TranscriptEvent,
} from "../src/shared/transcription";
const event = (
  id = "one",
  patch: Partial<TranscriptEvent> = {},
): TranscriptEvent => ({
  id,
  sessionId: "session",
  source: "microphone",
  startMs: 1000,
  endMs: 2000,
  text: "some words",
  state: "partial",
  model: "tiny.en",
  ...patch,
});
describe("rolling transcript store", () => {
  it("replaces provisional text and never regresses a final result to partial", () => {
    const store = new TranscriptStore(
      DEFAULT_TRANSCRIPTION_SETTINGS,
      () => 10000,
    );
    store.upsert(event());
    store.upsert(event("one", { text: "some revised words" }));
    expect(store.value).toHaveLength(1);
    store.upsert(event("one", { state: "final" }));
    store.upsert(event("one", { text: "old partial" }));
    expect(store.value[0]!.state).toBe("final");
    expect(store.value[0]!.text).toBe("some words");
  });
  it("orders both sources by audio time without merging their provenance", () => {
    const store = new TranscriptStore(
      DEFAULT_TRANSCRIPTION_SETTINGS,
      () => 10000,
    );
    store.upsert(event("late", { startMs: 4000 }));
    store.upsert(event("system", { source: "systemAudio" }));
    store.upsert(event("mic"));
    expect(store.value.map((item) => item.id)).toEqual([
      "mic",
      "system",
      "late",
    ]);
    expect(
      store.value.filter((item) => item.source === "systemAudio"),
    ).toHaveLength(1);
  });
  it("deduplicates overlapping phrases conservatively, ignoring punctuation/case", () => {
    expect(
      removeOverlap(
        "I would use a dictionary.",
        "A dictionary would work here.",
      ),
    ).toBe("would work here.");
    expect(removeOverlap("yes", "yes it does")).toBe("yes it does");
  });
  it("bounds line count, character count and retention age", () => {
    let now = 10000;
    const store = new TranscriptStore(
      { ...DEFAULT_TRANSCRIPTION_SETTINGS, maxEvents: 20, retentionMinutes: 1 },
      () => now,
    );
    for (let i = 0; i < 100; i++)
      store.upsert(event(String(i), { text: "x".repeat(8000) }));
    expect(store.value.length).toBeLessThanOrEqual(20);
    expect(
      store.value.reduce((sum, item) => sum + item.text.length, 0),
    ).toBeLessThanOrEqual(50000);
    now = 70000;
    expect(store.value).toHaveLength(0);
  });
  it("removes provisional results and clears all retained text", () => {
    const store = new TranscriptStore(
      DEFAULT_TRANSCRIPTION_SETTINGS,
      () => 10000,
    );
    store.upsert(event());
    store.upsert(event("final", { state: "final" }));
    store.removePartial();
    expect(store.value).toHaveLength(1);
    store.clear();
    expect(store.value).toHaveLength(0);
  });
});
