import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AudioDiagnostic, AudioFrame } from "../shared/contracts";
import { audioLevel } from "../shared/audio";

interface Operation {
  child: ChildProcessWithoutNullStreams;
  pending: Buffer;
  ready: boolean;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
// An explicitly authorised Linux playback monitor, independent of microphone
// capture. Never records a default audio input or mixes the two source labels.
export class PulseAudioCapture {
  private operation?: Operation;
  private token: string | null = null;
  private streamId = "";
  private sequence = 0;
  private origin = 0;
  private samples = 0;
  constructor(
    private readonly frame: (token: string, frame: AudioFrame) => void,
    private readonly launch = spawn,
  ) {}
  setToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    this.streamId = randomUUID();
    this.sequence = 0;
    this.origin = Date.now();
    this.samples = 0;
  }
  start(
    update: (diagnostic: AudioDiagnostic) => void,
    failure: (message: string, source: "systemAudio") => void,
  ): Promise<void> {
    this.stop();
    return new Promise((resolve, reject) => {
      const child = this.launch(
        "/usr/bin/parec",
        [
          "--record",
          "--raw",
          "--device=@DEFAULT_MONITOR@",
          "--format=float32le",
          "--rate=16000",
          "--channels=1",
          "--latency-msec=100",
          "--client-name=EveryHint",
          "--stream-name=EveryHint authorised system audio",
        ],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      const current: Operation = {
        child,
        pending: Buffer.alloc(0),
        ready: false,
        reject,
        timer: setTimeout(
          () =>
            fail(
              "Playback monitor timed out. Check your PulseAudio or PipeWire-Pulse session.",
            ),
          10000,
        ),
      };
      const fail = (message: string) => {
        if (this.operation !== current) return;
        this.release(current);
        if (!current.ready) reject(new Error(message));
        failure(message, "systemAudio");
      };
      this.operation = current;
      child.stdin.end();
      // Drain diagnostics without retaining potentially sensitive device names.
      child.stderr.on("data", () => {});
      child.on("error", () =>
        fail(
          "System audio could not start. Install pulseaudio-utils and run a PulseAudio or PipeWire-Pulse desktop session.",
        ),
      );
      child.on("close", () =>
        fail(
          "The playback monitor stopped. Check your audio server and start the session again.",
        ),
      );
      child.stdout.on("data", (chunk: Buffer) => {
        if (this.operation !== current) return;
        if (chunk.length > 1024 * 1024) {
          fail("Playback audio exceeded its bounded packet size.");
          return;
        }
        const bytes = Buffer.concat([current.pending, chunk]);
        current.pending.fill(0);
        let offset = 0;
        try {
          while (offset + 6400 <= bytes.length && this.operation === current) {
            const samples = new Float32Array(1600);
            for (let i = 0; i < samples.length; i++) {
              const value = bytes.readFloatLE(offset + i * 4);
              if (!Number.isFinite(value))
                throw new Error("Playback audio contained an invalid sample.");
              samples[i] = Math.max(-1, Math.min(1, value));
            }
            offset += 6400;
            update({
              source: "systemAudio",
              state: "CAPTURING",
              name: "Default playback monitor",
              deviceId: null,
              level: audioLevel(samples),
              muted: false,
              error: null,
            });
            if (!current.ready) {
              current.ready = true;
              clearTimeout(current.timer);
              resolve();
            }
            const token = this.token;
            if (token) {
              const base = {
                source: "systemAudio" as const,
                streamId: this.streamId,
                timestamp: this.origin + this.samples / 16,
                sampleRate: 16000,
                channels: 1,
                format: "f32-interleaved" as const,
              };
              if (this.sequence === 0)
                this.frame(token, {
                  ...base,
                  sequence: this.sequence++,
                  lifecycle: "started",
                  samples: new Float32Array(),
                });
              this.frame(token, {
                ...base,
                sequence: this.sequence++,
                lifecycle: "data",
                samples,
              });
              this.samples += samples.length;
            } else samples.fill(0);
          }
          if (this.operation === current)
            current.pending = Buffer.from(bytes.subarray(offset));
        } catch {
          fail(
            "Playback audio could not be processed safely. Restart the session.",
          );
        } finally {
          bytes.fill(0);
        }
      });
    });
  }
  private release(current: Operation): void {
    this.operation = undefined;
    this.setToken(null);
    clearTimeout(current.timer);
    current.pending.fill(0);
    current.child.kill();
  }
  stop(): void {
    const current = this.operation;
    if (!current) {
      this.setToken(null);
      return;
    }
    this.release(current);
    if (!current.ready)
      current.reject(new Error("Playback capture was cancelled."));
  }
}
