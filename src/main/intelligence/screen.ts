import { createHash } from "node:crypto";
import type { ScreenFrame } from "../../shared/contracts";

export interface ScreenChange {
  changed: boolean;
  difference: number;
  sampled: boolean;
  unchanged: boolean;
}
export function intensity(bitmap: Uint8Array): Uint8Array {
  if (bitmap.length !== 32 * 18 * 4)
    throw new Error("Expected a bounded 32 by 18 screen sample.");
  const values = new Uint8Array(32 * 18);
  for (let i = 0; i < values.length; i++)
    values[i] = Math.round(
      (bitmap[i * 4]! + bitmap[i * 4 + 1]! + bitmap[i * 4 + 2]!) / 3,
    );
  return values;
}
function difference(
  a: Uint8Array,
  b: Uint8Array,
): { mean: number; fraction: number } {
  let sum = 0,
    changed = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs(a[i]! - b[i]!);
    sum += diff;
    if (diff >= 16) changed++;
  }
  return { mean: sum / a.length / 255, fraction: changed / a.length };
}
export class ScreenChangeDetector {
  private hash = "";
  private previous: Uint8Array | null = null;
  private baseline: Uint8Array | null = null;
  private candidate: { sample: Uint8Array; at: number } | null = null;
  reset(): void {
    this.hash = "";
    this.previous = this.baseline = null;
    this.candidate = null;
  }
  observe(frame: ScreenFrame, sample: () => Uint8Array): ScreenChange {
    const hash = createHash("sha256").update(frame.dataUrl).digest("hex");
    const unchanged = hash === this.hash;
    const current = unchanged && this.previous ? this.previous : sample();
    if (current.length !== 32 * 18)
      throw new Error("Invalid local screen sample.");
    const sampled = !unchanged;
    this.hash = hash;
    this.previous = current;
    if (!this.baseline) {
      this.baseline = current.slice();
      return { changed: false, difference: 0, sampled, unchanged };
    }
    const delta = difference(this.baseline, current);
    if (delta.mean < 0.045 || delta.fraction < 0.15) {
      this.candidate = null;
      return { changed: false, difference: delta.mean, sampled, unchanged };
    }
    if (
      this.candidate &&
      difference(this.candidate.sample, current).mean <= 0.012
    ) {
      if (frame.capturedAt - this.candidate.at >= 600) {
        this.baseline = current.slice();
        this.candidate = null;
        return { changed: true, difference: delta.mean, sampled, unchanged };
      }
      return { changed: false, difference: delta.mean, sampled, unchanged };
    }
    this.candidate = { sample: current.slice(), at: frame.capturedAt };
    return { changed: false, difference: delta.mean, sampled, unchanged };
  }
}
