import { describe, expect, it } from "vitest";
import { SpeechSegmenter } from "../src/main/transcription/segmenter";
import {
  DEFAULT_TRANSCRIPTION_SETTINGS,
  type RecognitionJob,
} from "../src/shared/transcription";
function setup(maxSegmentMs = 12000) {
  const jobs: RecognitionJob[] = [],
    dropped: string[] = [];
  let next = 0,
    time = 1000000;
  const segmenter = new SpeechSegmenter(
    "microphone",
    { ...DEFAULT_TRANSCRIPTION_SETTINGS, maxSegmentMs },
    (job) => jobs.push(job),
    (id) => dropped.push(id),
    () => `utterance-${next++}`,
  );
  const feed = (milliseconds: number, value: number) => {
    for (let index = 0; index < milliseconds / 20; index++) {
      segmenter.accept(new Float32Array(320).fill(value), time);
      time += 20;
    }
  };
  return { segmenter, jobs, dropped, feed };
}
describe("energy speech segmentation", () => {
  it("ignores silence and short noise bursts", () => {
    const test = setup();
    test.feed(15000, 0);
    test.feed(60, 0.2);
    test.feed(1000, 0);
    expect(test.jobs).toHaveLength(0);
    expect(test.segmenter.bufferedSamples).toBeLessThanOrEqual(3520);
  });
  it("produces real-time provisional windows and one final with the same utterance ID", () => {
    const test = setup();
    test.feed(3000, 0.2);
    expect(test.jobs.some((job) => !job.final)).toBe(true);
    test.feed(1000, 0);
    expect(test.jobs.filter((job) => job.final)).toHaveLength(1);
    expect(new Set(test.jobs.map((job) => job.id)).size).toBe(1);
    expect(test.jobs.at(-1)!.endMs).toBeGreaterThan(test.jobs[0]!.startMs);
  });
  it("keeps ordinary short pauses inside the utterance", () => {
    const test = setup();
    test.feed(1500, 0.2);
    test.feed(400, 0);
    test.feed(1500, 0.2);
    expect(test.jobs.filter((job) => job.final)).toHaveLength(0);
    test.feed(1000, 0);
    expect(test.jobs.filter((job) => job.final)).toHaveLength(1);
  });
  it("caps continuous speech, bounds accumulation and carries limited overlap", () => {
    const test = setup(10000);
    test.feed(35000, 0.2);
    const finals = test.jobs.filter((job) => job.final);
    expect(finals.length).toBeGreaterThanOrEqual(3);
    expect(test.jobs.every((job) => job.samples.length <= 160000)).toBe(true);
    expect(finals[1]!.startMs).toBeCloseTo(finals[0]!.endMs - 400);
    expect(test.segmenter.bufferedSamples).toBeLessThanOrEqual(160000 + 3520);
  });
  it("separates discontinuous audio and releases obsolete data on reset", () => {
    const test = setup();
    test.feed(3000, 0.2);
    test.segmenter.gap();
    expect(test.jobs.at(-1)!.final).toBe(true);
    test.segmenter.reset();
    expect(test.segmenter.bufferedSamples).toBe(0);
  });
});
