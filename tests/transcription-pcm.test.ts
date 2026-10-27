import { describe, expect, it } from "vitest";
import { PCMConverter } from "../src/main/transcription/pcm";
import {
  parseAudioFrame,
  parseTranscriptionSettings,
  DEFAULT_TRANSCRIPTION_SETTINGS,
} from "../src/shared/transcription";
import type { AudioFrame } from "../src/shared/contracts";
const frame = (
  samples = new Float32Array(4800),
  channels = 1,
  sampleRate = 48000,
): AudioFrame => ({
  source: "microphone",
  streamId: "stream-1",
  sequence: 0,
  timestamp: 1000,
  sampleRate,
  channels,
  format: "f32-interleaved",
  lifecycle: "data",
  samples,
});
describe("transcription PCM conversion", () => {
  it("mixes stereo to mono without adding amplitudes", () => {
    const pcm = new Float32Array(8192);
    for (let i = 0; i < pcm.length; i += 2) {
      pcm[i] = 0.2;
      pcm[i + 1] = 0.6;
    }
    const converted = new PCMConverter().accept(frame(pcm, 2));
    expect(
      converted.samples
        .slice(20, -20)
        .every((value) => Math.abs(value - 0.4) < 0.001),
    ).toBe(true);
  });
  it.each([8000, 16000, 44100, 48000, 96000, 192000])(
    "preserves streaming duration and timestamps at %i Hz",
    (rate) => {
      const converter = new PCMConverter();
      let length = 0;
      const size = Math.min(4096, Math.floor(rate / 20));
      for (let sequence = 0; sequence < 10; sequence++) {
        const input = {
          ...frame(new Float32Array(size).fill(0.1), 1, rate),
          sequence,
          timestamp: 1000 + (sequence * size * 1000) / rate,
        };
        const result = converter.accept(input);
        expect(result.timestamp).toBeCloseTo(1000 + length / 16, 6);
        expect(result.discontinuity).toBe(false);
        length += result.samples.length;
      }
      expect(Math.abs(length - (10 * size * 16000) / rate)).toBeLessThanOrEqual(
        33,
      );
    },
  );
  it("low-pass filters frequencies above the destination Nyquist limit", () => {
    const sine = (frequency: number) =>
      Float32Array.from(
        { length: 4800 },
        (_, i) => Math.sin((2 * Math.PI * frequency * i) / 48000) * 0.5,
      );
    const energy = (samples: Float32Array) =>
      samples.slice(30, -30).reduce((sum, sample) => sum + sample * sample, 0) /
      samples.length;
    expect(
      energy(new PCMConverter().accept(frame(sine(12000))).samples),
    ).toBeLessThan(
      energy(new PCMConverter().accept(frame(sine(1000))).samples) / 20,
    );
  });
  it("detects dropped packets, changed streams and discontinuous timestamps", () => {
    for (const change of [
      { sequence: 2 },
      { streamId: "other" },
      { timestamp: 2000 },
    ]) {
      const converter = new PCMConverter();
      converter.accept(frame());
      expect(
        converter.accept({
          ...frame(),
          sequence: 1,
          timestamp: 1100,
          ...change,
        }).discontinuity,
      ).toBe(true);
    }
  });
  it.each([
    { channels: 0 },
    { channels: 3 },
    { sampleRate: 0 },
    { timestamp: NaN },
    { sequence: -1 },
    { source: "unknown" },
    { format: "pcm16" },
    { samples: new Float32Array([NaN]) },
    { samples: new Float32Array([2]) },
    { samples: new Float32Array(8193) },
    { samples: [0.1] },
    { streamId: "" },
  ])("rejects invalid audio: %j", (patch) => {
    expect(() => parseAudioFrame({ ...frame(), ...patch })).toThrow();
  });
  it("validates speech settings and rejects excessive segment/retention limits", () => {
    expect(
      parseTranscriptionSettings(DEFAULT_TRANSCRIPTION_SETTINGS).model,
    ).toBe("tiny.en");
    for (const patch of [
      { maxSegmentMs: 16000 },
      { silenceMs: 50 },
      { maxEvents: 10000 },
      { overlapMs: 3000 },
      { threshold: NaN },
      { model: "remote" },
      { apiKey: "secret" },
    ])
      expect(() =>
        parseTranscriptionSettings({
          ...DEFAULT_TRANSCRIPTION_SETTINGS,
          ...patch,
        }),
      ).toThrow();
  });
});
