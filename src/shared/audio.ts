import type { AudioFrame } from "./contracts";

export const AUDIO_REPORT_INTERVAL_MS = 200;
export const MAX_AUDIO_BUFFER_BYTES = 768000;
export function audioLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples)
    if (Number.isFinite(value)) sum += Math.min(1, Math.abs(value)) ** 2;
  return Math.min(1, Math.sqrt(sum / samples.length));
}
export class AudioFrameBuffer {
  private frames: AudioFrame[] = [];
  private bytes = 0;
  constructor(
    private readonly maxBytes = MAX_AUDIO_BUFFER_BYTES,
    private readonly durationMs = 2000,
  ) {}
  get byteLength(): number {
    return this.bytes;
  }
  get length(): number {
    return this.frames.length;
  }
  push(frame: AudioFrame): void {
    if (
      frame.lifecycle !== "data" ||
      !frame.samples.byteLength ||
      frame.samples.byteLength > this.maxBytes
    )
      return;
    this.frames.push(frame);
    this.bytes += frame.samples.byteLength;
    while (
      this.frames.length > 32 ||
      this.bytes > this.maxBytes ||
      (this.frames[0] &&
        frame.timestamp - this.frames[0].timestamp > this.durationMs)
    ) {
      this.bytes -= this.frames.shift()!.samples.byteLength;
    }
  }
  clear(): void {
    this.frames = [];
    this.bytes = 0;
  }
}
// One packet in flight per AudioWorklet. While waiting for acknowledgement,
// drop samples rather than accumulate an unbounded MessagePort backlog.
export class AudioPacketAccumulator {
  private packet = new Float32Array(0);
  private offset = 0;
  private awaitingAck = false;
  acknowledge(): void {
    this.awaitingAck = false;
  }
  accept(channels: Float32Array[]): Float32Array | null {
    if (this.awaitingAck || !channels.length || !channels[0]?.length)
      return null;
    const count = Math.min(2, channels.length);
    const size = 4096 * count;
    if (this.packet.length !== size) {
      this.packet = new Float32Array(size);
      this.offset = 0;
    }
    for (let i = 0; i < channels[0].length; i++) {
      for (let c = 0; c < count; c++)
        this.packet[this.offset++] = channels[c]![i] ?? 0;
      if (this.offset === size) {
        const complete = this.packet;
        this.packet = new Float32Array(size);
        this.offset = 0;
        this.awaitingAck = true;
        return complete;
      }
    }
    return null;
  }
}
