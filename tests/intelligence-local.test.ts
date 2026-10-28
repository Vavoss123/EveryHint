import { describe, expect, it, vi } from "vitest";
import { LocalIntelligence } from "../src/main/intelligence/engine";
import { detectQuestion, similarity } from "../src/main/intelligence/question";
import {
  intensity,
  ScreenChangeDetector,
} from "../src/main/intelligence/screen";
import { DEFAULT_INTELLIGENCE } from "../src/shared/intelligence";
import { CaptureSessionController } from "../src/main/session";
import { backend, consent, frame, source } from "./helpers";
import type { TranscriptEvent } from "../src/shared/transcription";
import type { SessionSnapshot } from "../src/shared/contracts";

const examples = [
  "Why would you use a dictionary instead of a list?",
  "Can you explain what that function does?",
  "What happens if this variable is empty?",
  "How would you improve this solution?",
  "What's the difference between those two approaches?",
];
describe("local punctuation-independent question detection", () => {
  it.each(examples)(
    "scores a relevant question with and without punctuation: %s",
    (text) => {
      for (const value of [text, text.replace(/\?/g, "")]) {
        expect(detectQuestion(value)?.automaticEligible).toBe(true);
        expect(detectQuestion(value)!.confidence).toBeGreaterThanOrEqual(0.85);
      }
    },
  );
  it.each([
    "This function uses a dictionary.",
    "We discussed how to improve the solution.",
    "What a lovely day",
    "Can you hear me?",
    "Are you there?",
    "Why bother?",
    "Who cares about the code?",
    "What could possibly go wrong?",
    "He asked why would you use a dictionary",
    "This is rhetorical: why use a dictionary?",
    "I wonder whether the function is correct",
    "Do you want coffee?",
    "",
    "What time is it?",
  ])("suppresses statements/rhetorical/unrelated speech: %s", (text) =>
    expect(detectQuestion(text)).toBeNull(),
  );
  it.each([
    "Why would you use the",
    "How would you improve a",
    "Can you explain the",
  ])("keeps incomplete questions below the automatic threshold: %s", (text) => {
    expect(detectQuestion(text)?.automaticEligible).toBe(false);
    expect(detectQuestion(text)!.confidence).toBeLessThan(0.85);
  });
  it("uses recent context conservatively and scores help cues as review-only", () => {
    expect(
      detectQuestion(
        "Could you consider another colour",
        "The red colour differs from blue",
      )?.automaticEligible,
    ).toBe(false);
    expect(
      detectQuestion("Help me explain this function")?.automaticEligible,
    ).toBe(false);
    expect(
      similarity(
        "Why use a dictionary instead of a list?",
        "why use a dictionary instead of a list",
      ),
    ).toBe(1);
  });
});
describe("local stable screen differences", () => {
  it("hashes unchanged frames without repeated sampling and requires a stable substantial change", () => {
    const detector = new ScreenChangeDetector();
    const sample = vi.fn(() => new Uint8Array(576).fill(10));
    expect(
      detector.observe({ ...frame, capturedAt: 1000 }, sample).changed,
    ).toBe(false);
    detector.observe({ ...frame, capturedAt: 2000 }, sample);
    expect(sample).toHaveBeenCalledOnce();
    sample.mockReturnValue(new Uint8Array(576).fill(180));
    const changed = {
      ...frame,
      dataUrl: frame.dataUrl + "fixture-change",
      capturedAt: 3000,
    };
    expect(detector.observe(changed, sample).changed).toBe(false);
    expect(
      detector.observe({ ...changed, capturedAt: 3100 }, sample).changed,
    ).toBe(false);
    expect(
      detector.observe({ ...changed, capturedAt: 3700 }, sample).changed,
    ).toBe(true);
    expect(sample).toHaveBeenCalledTimes(2);
    expect(
      detector.observe({ ...changed, capturedAt: 4700 }, sample).changed,
    ).toBe(false);
  });
  it("suppresses small cursor-like changes and unstable frames and resets on a new source", () => {
    const detector = new ScreenChangeDetector();
    const base = new Uint8Array(576).fill(100);
    detector.observe(frame, () => base);
    const cursor = base.slice();
    cursor[0] = 0;
    expect(
      detector.observe(
        { ...frame, dataUrl: "cursor", capturedAt: 2000 },
        () => cursor,
      ).changed,
    ).toBe(false);
    expect(
      detector.observe({ ...frame, dataUrl: "moving1", capturedAt: 3000 }, () =>
        new Uint8Array(576).fill(180),
      ).changed,
    ).toBe(false);
    expect(
      detector.observe({ ...frame, dataUrl: "moving2", capturedAt: 4000 }, () =>
        new Uint8Array(576).fill(240),
      ).changed,
    ).toBe(false);
    detector.reset();
    expect(detector.observe(frame, () => base).changed).toBe(false);
  });
  it("bounds native bitmap input", () => {
    expect(intensity(new Uint8Array(2304).fill(120))).toHaveLength(576);
    expect(() => intensity(new Uint8Array(3000))).toThrow("bounded");
  });
});
describe("local session event correlation", () => {
  function setup() {
    let now = 1000000;
    const capture: SessionSnapshot = {
      ...new CaptureSessionController(
        backend(),
        () => 3000,
        () => {},
      ).value,
      state: "ACTIVE",
      sessionId: "session",
      epoch: 1,
      source,
      frame: { ...frame, capturedAt: now },
      consent: { ...consent, microphone: true, systemAudio: true },
    };
    const changed = vi.fn();
    const engine = new LocalIntelligence(
      changed,
      () => now,
      () => new Uint8Array(576).fill(100),
    );
    engine.configure({
      ...DEFAULT_INTELLIGENCE,
      sources: { microphone: true, systemAudio: true, screen: true },
    });
    const event = (patch: Partial<TranscriptEvent> = {}): TranscriptEvent => ({
      id: "speech",
      sessionId: "session",
      source: "systemAudio",
      startMs: now - 1000,
      endMs: now,
      text: examples[0]!,
      state: "final",
      model: "tiny.en",
      ...patch,
    });
    return {
      engine,
      capture,
      changed,
      event,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }
  it("Manual performs no analysis; Auto-Hint only emits typed bounded local events", () => {
    const s = setup();
    s.engine.update(s.capture, [s.event()]);
    expect(s.engine.value.questions).toEqual([]);
    expect(s.engine.value.diagnostics.sampledFrames).toBe(0);
    s.engine.setMode("auto-hint");
    s.advance(1000);
    s.engine.update(
      { ...s.capture, frame: { ...frame, capturedAt: 1001000 } },
      [s.event({ id: "new" })],
    );
    const q = s.engine.value.questions[0]!;
    expect(q.source).toBe("systemAudio");
    expect(q.screen?.sourceId).toBe(source.id);
    expect(q.contextIds).toEqual(["new"]);
    expect(s.engine.value.events.map((event) => event.type)).toContain(
      "QuestionDetected",
    );
    expect(s.engine.value.live).toBeNull();
  });
  it("never promotes a partial and suppresses final/repeated/cross-source echoes", () => {
    const s = setup();
    s.engine.setMode("auto-hint");
    s.engine.update(s.capture, [s.event({ state: "partial" })]);
    expect(s.engine.value.questions).toEqual([]);
    s.engine.update(s.capture, [s.event()]);
    s.engine.update(s.capture, [
      s.event(),
      s.event({ id: "echo", source: "microphone" }),
    ]);
    expect(s.engine.value.questions).toHaveLength(1);
    expect(s.engine.value.diagnostics.analysedTranscripts).toBe(2);
    expect(s.engine.value.diagnostics.duplicateQuestions).toBe(1);
  });
  it("filters sources/consent/old sessions, orders final events, correlates only a current screen", () => {
    const s = setup();
    s.engine.setMode("auto-hint");
    s.advance(3000);
    s.engine.configure({
      ...DEFAULT_INTELLIGENCE,
      sources: { microphone: true, systemAudio: false, screen: true },
    });
    s.engine.update({ ...s.capture, frame: { ...frame, capturedAt: 1 } }, [
      s.event(),
      s.event({ id: "old", source: "microphone", sessionId: "other" }),
      s.event({ id: "mic", source: "microphone" }),
    ]);
    expect(s.engine.value.questions.map((q) => q.transcriptId)).toEqual([
      "mic",
    ]);
    expect(s.engine.value.questions[0]!.screen).toBeNull();
    expect(s.engine.value.questions[0]!.source).toBe("microphone");
  });
  it("does not replay events from before a mode change and applies exclusions and confidence threshold", () => {
    const s = setup();
    s.advance(1000);
    s.engine.setMode("auto-hint");
    s.engine.update(s.capture, [s.event({ endMs: 1000000 })]);
    expect(s.engine.value.questions).toEqual([]);
    s.engine.configure({
      ...DEFAULT_INTELLIGENCE,
      confidenceThreshold: 0.99,
      sources: { microphone: true, systemAudio: true, screen: true },
    });
    s.engine.update(s.capture, [s.event({ id: "threshold" })]);
    expect(s.engine.value.questions[0]!.automaticEligible).toBe(false);
    s.engine.configure({
      ...DEFAULT_INTELLIGENCE,
      sources: { microphone: true, systemAudio: true, screen: true },
      excludedSourceIds: [source.id],
    });
    s.engine.update(s.capture, [s.event({ id: "blocked" })]);
    expect(s.engine.value.questions).toEqual([]);
  });
  it("expires and bounds memory; Pause and a new capture session cannot leak stale context", () => {
    const s = setup();
    s.engine.setMode("auto-hint");
    for (let i = 0; i < 250; i++) {
      s.advance(10);
      s.engine.update({ ...s.capture, frame: null }, [
        s.event({
          id: `q${i}`,
          text: `What happens if variable number${i} is empty`,
        }),
      ]);
    }
    expect(s.engine.value.events.length).toBeLessThanOrEqual(100);
    expect(s.engine.value.questions.length).toBeLessThanOrEqual(20);
    s.engine.update({ ...s.capture, state: "PAUSED" }, [
      s.event({ id: "paused" }),
    ]);
    expect(s.engine.value.screen).toBeNull();
    s.engine.update({ ...s.capture, sessionId: "new-session" }, [s.event()]);
    expect(s.engine.value.questions).toEqual([]);
    s.advance(16 * 60000);
    expect(s.engine.value.events).toEqual([]);
  });
  it("does not publish every identical snapshot or retain a returned mutable snapshot", () => {
    const s = setup();
    s.engine.setMode("auto-hint");
    s.engine.update(s.capture, [s.event()]);
    s.changed.mockClear();
    s.engine.update(s.capture, [s.event()]);
    expect(s.changed).not.toHaveBeenCalled();
    const value = s.engine.value;
    value.questions[0]!.text = "tamper";
    expect(s.engine.value.questions[0]!.text).not.toBe("tamper");
  });
});
