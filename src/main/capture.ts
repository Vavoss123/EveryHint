import type { CaptureSource, ScreenFrame } from "../shared/contracts";
import { errorMessage } from "../shared/validation";

export interface ScreenCaptureBackend {
  listSources(): Promise<CaptureSource[]>;
  capture(source: CaptureSource): Promise<ScreenFrame>;
}

// Native one-shot snapshots, not a continuous MediaStream. At most one request
// is in flight; cancellation invalidates its result and disposes the next timer.
export class ScreenCaptureService {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private busy = false;
  private active = false;

  constructor(private readonly backend: ScreenCaptureBackend) {}
  get running(): boolean {
    return this.active;
  }

  start(
    source: CaptureSource,
    interval: number,
    onFrame: (frame: ScreenFrame) => void,
    onError: (message: string) => void,
  ): void {
    this.stop();
    this.active = true;
    const generation = this.generation;
    const current = (): boolean =>
      this.active && this.generation === generation;
    const schedule = (): void => {
      if (current())
        this.timer = setTimeout(() => {
          void tick();
        }, interval);
    };
    const tick = async (): Promise<void> => {
      this.timer = undefined;
      if (!current()) return;
      if (this.busy) {
        schedule();
        return;
      }
      this.busy = true;
      try {
        const frame = await this.backend.capture(source);
        if (current()) onFrame(frame);
      } catch (error) {
        if (current()) {
          this.stop();
          onError(errorMessage(error));
        }
      } finally {
        this.busy = false;
        schedule();
      }
    };
    // Gives the UI time to remove any paused whole-screen preview before capture.
    schedule();
  }

  stop(): void {
    this.active = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
