import type { AudioSourceId } from "../../shared/contracts";
import type {
  RecognitionJob,
  TranscriptionSettings,
} from "../../shared/transcription";
import { audioLevel } from "../../shared/audio";
interface Block {
  samples: Float32Array;
  timestamp: number;
}
interface Utterance {
  id: string;
  blocks: Block[];
  voicedMs: number;
  silenceMs: number;
  lastPartialSamples: number;
  overlapMs: number;
}
export class SpeechSegmenter {
  private pending = new Float32Array();
  private pendingTime = 0;
  private preRoll: Block[] = [];
  private active: Utterance | null = null;
  constructor(
    private readonly source: AudioSourceId,
    private readonly settings: TranscriptionSettings,
    private readonly emit: (job: RecognitionJob) => void,
    private readonly discard: (id: string) => void,
    private readonly id: () => string = () => crypto.randomUUID(),
  ) {}
  get bufferedSamples(): number {
    return (
      (this.active?.blocks.length ?? 0) * 320 +
      this.pending.length +
      this.preRoll.length * 320
    );
  }
  accept(samples: Float32Array, timestamp: number): void {
    if (!samples.length) return;
    if (!this.pending.length) this.pendingTime = timestamp;
    const input = new Float32Array(this.pending.length + samples.length);
    input.set(this.pending);
    input.set(samples, this.pending.length);
    let offset = 0;
    while (offset + 320 <= input.length) {
      this.block({
        samples: input.slice(offset, offset + 320),
        timestamp: this.pendingTime + (offset * 1000) / 16000,
      });
      offset += 320;
    }
    this.pending = input.slice(offset);
    this.pendingTime += (offset * 1000) / 16000;
  }
  private block(block: Block): void {
    const speech = audioLevel(block.samples) >= this.settings.threshold;
    if (!this.active) {
      this.preRoll.push(block);
      if (this.preRoll.length > 10) this.preRoll.shift();
      if (!speech) return;
      this.active = {
        id: this.id(),
        blocks: this.preRoll,
        voicedMs: 20,
        silenceMs: 0,
        lastPartialSamples: 0,
        overlapMs: 0,
      };
      this.preRoll = [];
    } else {
      this.active.blocks.push(block);
      if (speech) {
        this.active.voicedMs += 20;
        this.active.silenceMs = 0;
      } else this.active.silenceMs += 20;
    }
    const active = this.active,
      length = active.blocks.length * 320;
    if (length >= this.settings.maxSegmentMs * 16) {
      this.send(true);
      const overlap = active.blocks.slice(
        -Math.floor(this.settings.overlapMs / 20),
      );
      this.active =
        overlap.length && this.settings.overlapMs > 0
          ? {
              id: this.id(),
              blocks: overlap,
              voicedMs: 0,
              silenceMs: 0,
              lastPartialSamples: 0,
              overlapMs: this.settings.overlapMs,
            }
          : null;
    } else if (active.silenceMs >= this.settings.silenceMs) {
      this.send(true);
      this.active = null;
      this.preRoll = [];
    } else if (
      active.voicedMs >= 200 &&
      length >= 24000 &&
      length - active.lastPartialSamples >= 40000
    ) {
      this.send(false);
      active.lastPartialSamples = length;
    }
  }
  private send(final: boolean): void {
    const active = this.active;
    if (!active) return;
    if (active.voicedMs < 200) {
      if (final) this.discard(active.id);
      return;
    }
    const samples = new Float32Array(active.blocks.length * 320);
    active.blocks.forEach((block, index) =>
      samples.set(block.samples, index * 320),
    );
    const startMs = active.blocks[0]!.timestamp;
    this.emit({
      id: active.id,
      source: this.source,
      startMs,
      endMs: startMs + samples.length / 16,
      samples,
      final,
      overlapMs: active.overlapMs,
    });
  }
  gap(): void {
    this.send(true);
    this.reset();
  }
  reset(): void {
    if (this.active) this.discard(this.active.id);
    this.active = null;
    this.preRoll = [];
    this.pending = new Float32Array();
  }
}
