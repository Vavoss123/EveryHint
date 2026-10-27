import { describe, expect, it } from "vitest";
import {
  AudioFrameBuffer,
  AudioPacketAccumulator,
  audioLevel,
} from "../src/shared/audio";
import type { AudioFrame } from "../src/shared/contracts";
const frame = (timestamp: number, size = 4): AudioFrame => ({
  source: "microphone",
  streamId: "test",
  sequence: 0,
  timestamp,
  sampleRate: 48000,
  channels: 1,
  format: "f32-interleaved",
  lifecycle: "data",
  samples: new Float32Array(size),
});
describe("bounded local audio processing", () => {
  it("computes RMS independently with finite bounded levels", () => {
    expect(audioLevel(new Float32Array())).toBe(0);
    expect(audioLevel(new Float32Array([0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(audioLevel(new Float32Array([10, -10]))).toBe(1);
    expect(Number.isFinite(audioLevel(new Float32Array([NaN, Infinity])))).toBe(
      true,
    );
  });
  it("bounds PCM by bytes, duration and frame count", () => {
    const bytes = new AudioFrameBuffer(32, 2000);
    for (let i = 0; i < 10000; i++) bytes.push(frame(i));
    expect(bytes.byteLength).toBe(32);
    expect(bytes.length).toBe(2);
    const time = new AudioFrameBuffer(1000, 2000);
    time.push(frame(0));
    time.push(frame(2001));
    expect(time.length).toBe(1);
    const count = new AudioFrameBuffer(10000, 2000);
    for (let i = 0; i < 100; i++) count.push(frame(0));
    expect(count.length).toBe(32);
  });
  it("discards oversized data and lifecycle markers; clearing releases retained PCM", () => {
    const buffer = new AudioFrameBuffer(32);
    buffer.push(frame(0, 100));
    buffer.push({ ...frame(1), lifecycle: "started" });
    expect(buffer.length).toBe(0);
    buffer.push(frame(2));
    buffer.clear();
    expect(buffer.byteLength).toBe(0);
    expect(buffer.length).toBe(0);
  });
  it("preserves independent channels and bounds worklet packets with acknowledgements", () => {
    const packets = new AudioPacketAccumulator();
    const input = [
      new Float32Array(128).fill(0.25),
      new Float32Array(128).fill(-0.5),
    ];
    let output: Float32Array | null = null;
    for (let i = 0; i < 32; i++) output = packets.accept(input);
    expect(output?.length).toBe(8192);
    expect(output?.[0]).toBe(0.25);
    expect(output?.[1]).toBe(-0.5);
    for (let i = 0; i < 100; i++) expect(packets.accept(input)).toBeNull();
    packets.acknowledge();
    for (let i = 0; i < 32; i++) output = packets.accept(input);
    expect(output?.length).toBe(8192);
  });
});
