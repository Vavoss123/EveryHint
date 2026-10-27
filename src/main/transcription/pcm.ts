import type { AudioFrame } from "../../shared/contracts";
import { parseAudioFrame } from "../../shared/transcription";
export class PCMConverter {
  private buffer = new Float32Array(16);
  private position = 16;
  private rate = 0;
  private channels = 0;
  private stream = "";
  private sequence = -1;
  private expectedTime = 0;
  private origin = 0;
  private outputCount = 0;
  private kernels = new Map<number, Float64Array>();
  reset(): void {
    this.buffer = new Float32Array(16);
    this.position = 16;
    this.rate = 0;
    this.sequence = -1;
    this.stream = "";
    this.outputCount = 0;
    this.kernels.clear();
  }
  accept(value: AudioFrame): {
    samples: Float32Array;
    timestamp: number;
    discontinuity: boolean;
  } {
    const frame = parseAudioFrame(value);
    const discontinuity =
      this.rate !== 0 &&
      (frame.streamId !== this.stream ||
        frame.sampleRate !== this.rate ||
        frame.channels !== this.channels ||
        frame.sequence !== this.sequence + 1 ||
        Math.abs(frame.timestamp - this.expectedTime) > 150);
    if (discontinuity || !this.rate) {
      this.reset();
      this.origin = frame.timestamp;
    }
    this.rate = frame.sampleRate;
    this.channels = frame.channels;
    this.stream = frame.streamId;
    this.sequence = frame.sequence;
    const count = frame.samples.length / frame.channels;
    this.expectedTime = frame.timestamp + (count * 1000) / frame.sampleRate;
    const mono = new Float32Array(count);
    for (let i = 0; i < count; i++)
      for (let c = 0; c < frame.channels; c++)
        mono[i] =
          mono[i]! + frame.samples[i * frame.channels + c]! / frame.channels;
    const input = new Float32Array(this.buffer.length + mono.length);
    input.set(this.buffer);
    input.set(mono, this.buffer.length);
    const output: number[] = [],
      step = frame.sampleRate / 16000,
      cutoff = Math.min(1, 16000 / frame.sampleRate) * 0.9;
    while (this.position + 16 < input.length) {
      const center = Math.floor(this.position);
      const phaseIndex = Math.min(
        255,
        Math.floor((this.position - center) * 256),
      );
      let kernel = this.kernels.get(phaseIndex);
      if (!kernel) {
        kernel = new Float64Array(32);
        let weight = 0;
        for (let tap = 0; tap < 32; tap++) {
          const distance = tap - 15 - phaseIndex / 256,
            phase = Math.PI * cutoff * distance;
          kernel[tap] =
            cutoff *
            (Math.abs(phase) < 1e-9 ? 1 : Math.sin(phase) / phase) *
            (0.5 + 0.5 * Math.cos((Math.PI * distance) / 16));
          weight += kernel[tap]!;
        }
        for (let tap = 0; tap < 32; tap++) kernel[tap] = kernel[tap]! / weight;
        // At most 256 kernels (64 KiB); common 48 kHz input uses one.
        this.kernels.set(phaseIndex, kernel);
      }
      let sum = 0;
      for (let tap = 0; tap < 32; tap++)
        sum += (input[center - 15 + tap] ?? 0) * kernel[tap]!;
      output.push(Math.max(-1, Math.min(1, sum)));
      this.position += step;
    }
    const discard = Math.max(0, Math.floor(this.position) - 16);
    this.buffer = input.slice(discard);
    this.position -= discard;
    const timestamp = this.origin + (this.outputCount * 1000) / 16000;
    this.outputCount += output.length;
    return { samples: Float32Array.from(output), timestamp, discontinuity };
  }
}
