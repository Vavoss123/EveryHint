import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
export interface InferenceResult {
  text: string;
  latencyMs: number;
  cpuPercent: number;
  memoryBytes: number;
}
export interface InferenceWorker {
  start(
    modelPath: string,
    onCrash: (message: string) => void,
  ): Promise<{ loadMs: number; memoryBytes: number }>;
  infer(samples: Float32Array): Promise<InferenceResult>;
  stop(): void;
}
export class WhisperWorker implements InferenceWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending:
    | {
        resolve: (value: Record<string, unknown>) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
        id: number;
      }
    | undefined;
  private nextId = 0;
  constructor(
    private readonly executable: string,
    private readonly threads = 4,
    private readonly launch = spawn,
  ) {}
  async start(
    modelPath: string,
    onCrash: (message: string) => void,
  ): Promise<{ loadMs: number; memoryBytes: number }> {
    this.stop();
    const child = this.launch(
      this.executable,
      [modelPath, String(this.threads)],
      { shell: false, windowsHide: true, stdio: "pipe" },
    ) as ChildProcessWithoutNullStreams;
    this.child = child;
    let output = "";
    const fail = (message: string) => {
      if (this.child !== child) return;
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error(message));
        this.pending = undefined;
      }
      this.stop();
      onCrash(message);
    };
    child.on("error", (error) =>
      fail(`Whisper helper could not start: ${error.message}`),
    );
    child.on("exit", (code) =>
      fail(`Whisper helper stopped unexpectedly (${code ?? "signal"}).`),
    );
    child.stderr.on("data", () => {}); // Drain native diagnostics; never retain or log conversation content.
    child.stdin.on("error", (error) =>
      fail(`Whisper input failed: ${error.message}`),
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      if (this.child !== child) return;
      output += data;
      if (output.length > 65536) {
        fail("Whisper output exceeded its limit.");
        return;
      }
      let newline: number;
      while ((newline = output.indexOf("\n")) >= 0) {
        const line = output.slice(0, newline);
        output = output.slice(newline + 1);
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (value.type === "error")
            throw new Error(
              typeof value.message === "string"
                ? value.message
                : "Whisper inference failed.",
            );
          const pending = this.pending;
          if (
            !pending ||
            (value.type === "ready" && pending.id !== 0) ||
            (value.type === "result" && value.id !== pending.id) ||
            !["ready", "result"].includes(value.type as string)
          )
            throw new Error("Unexpected Whisper job response.");
          clearTimeout(pending.timer);
          this.pending = undefined;
          pending.resolve(value);
        } catch (error) {
          fail(
            error instanceof Error
              ? error.message
              : "Invalid Whisper response.",
          );
          return;
        }
      }
    });
    const ready = await this.wait(0);
    if (
      typeof ready.loadMs !== "number" ||
      !Number.isFinite(ready.loadMs) ||
      ready.loadMs < 0
    ) {
      fail("Invalid Whisper load timing.");
      throw new Error("Invalid Whisper startup response.");
    }
    return {
      loadMs: ready.loadMs,
      memoryBytes:
        typeof ready.memoryBytes === "number" ? ready.memoryBytes : 0,
    };
  }
  private wait(id: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.pending = {
        id,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.stop();
        }, 60000),
      };
    });
  }
  async infer(samples: Float32Array): Promise<InferenceResult> {
    if (!this.child || this.pending)
      throw new Error("Whisper is not ready or is busy.");
    if (samples.length < 1600 || samples.length > 240000)
      throw new Error("Whisper job length is out of range.");
    const id = ++this.nextId,
      packet = Buffer.allocUnsafe(16 + samples.byteLength);
    packet.writeUInt32LE(0x45574833, 0);
    packet.writeUInt32LE(id, 4);
    packet.writeUInt32LE(samples.length, 8);
    packet.writeUInt32LE(0, 12);
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(
      packet,
      16,
    );
    const pending = this.wait(id);
    this.child.stdin.write(packet);
    const result = await pending;
    if (
      typeof result.text !== "string" ||
      result.text.length > 16000 ||
      typeof result.latencyMs !== "number" ||
      !Number.isFinite(result.latencyMs) ||
      result.latencyMs < 0
    ) {
      this.stop();
      throw new Error("Invalid Whisper recognition result.");
    }
    return {
      text: result.text,
      latencyMs: result.latencyMs,
      cpuPercent:
        typeof result.cpuPercent === "number" &&
        Number.isFinite(result.cpuPercent)
          ? result.cpuPercent
          : 0,
      memoryBytes:
        typeof result.memoryBytes === "number" &&
        Number.isFinite(result.memoryBytes)
          ? result.memoryBytes
          : 0,
    };
  }
  stop(): void {
    const child = this.child;
    this.child = undefined;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error("Whisper work cancelled or timed out."));
      this.pending = undefined;
    }
    if (child) {
      child.stdin.destroy();
      child.kill();
    }
  }
}
