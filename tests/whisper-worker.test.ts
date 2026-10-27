import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { spawn } from "node:child_process";
import { WhisperWorker } from "../src/main/transcription/worker";
function setup() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  const launch = vi.fn(() => child);
  const worker = new WhisperWorker(
      "test-helper.exe",
      4,
      launch as unknown as typeof spawn,
    ),
    crash = vi.fn();
  const ready = async () => {
    const pending = worker.start("model.bin", crash);
    child.stdout.write('{"type":"ready","loadMs":10,"memoryBytes":100}\n');
    await pending;
  };
  return { child, launch, worker, crash, ready };
}
describe("isolated Whisper helper protocol", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("starts one hidden process and exchanges bounded binary PCM/results", async () => {
    const test = setup();
    await test.ready();
    expect(test.launch).toHaveBeenCalledWith(
      "test-helper.exe",
      ["model.bin", "4"],
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    let packet: Buffer | undefined;
    test.child.stdin.on("data", (data: Buffer) => {
      packet = data;
    });
    const result = test.worker.infer(new Float32Array(16000));
    expect(packet!.readUInt32LE(0)).toBe(0x45574833);
    expect(packet!.readUInt32LE(8)).toBe(16000);
    test.child.stdout.write(
      '{"type":"result","id":1,"text":"actual engine result","latencyMs":25,"cpuPercent":300,"memoryBytes":1000}\n',
    );
    await expect(result).resolves.toMatchObject({
      text: "actual engine result",
      latencyMs: 25,
    });
    test.worker.stop();
    expect(test.child.kill).toHaveBeenCalledTimes(1);
  });
  it("handles model loading failure and process crashes without leaving a child", async () => {
    const test = setup(),
      pending = test.worker.start("bad.bin", test.crash),
      rejected = expect(pending).rejects.toThrow();
    test.child.stdout.write('{"type":"error","message":"bad model"}\n');
    await rejected;
    expect(test.child.kill).toHaveBeenCalled();
    expect(test.crash).toHaveBeenCalledWith("bad model");
    const other = setup();
    await other.ready();
    const inference = other.worker.infer(new Float32Array(16000)),
      failed = expect(inference).rejects.toThrow();
    other.child.emit("exit", 1);
    await failed;
    expect(other.crash).toHaveBeenCalled();
  });
  it("cancels pending inference, ignores late output, and bounds startup time", async () => {
    const test = setup();
    await test.ready();
    const pending = test.worker.infer(new Float32Array(16000)),
      cancelled = expect(pending).rejects.toThrow("cancelled");
    test.worker.stop();
    test.child.stdout.write(
      '{"type":"result","id":1,"text":"late","latencyMs":10}\n',
    );
    await cancelled;
    expect(test.crash).not.toHaveBeenCalled();
    const other = setup(),
      loading = other.worker.start("model.bin", other.crash),
      timedOut = expect(loading).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(60000);
    await timedOut;
    expect(other.child.kill).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects mismatched job IDs and oversized output", async () => {
    const test = setup();
    await test.ready();
    const pending = test.worker.infer(new Float32Array(16000)),
      failed = expect(pending).rejects.toThrow();
    test.child.stdout.write(
      '{"type":"result","id":99,"text":"wrong","latencyMs":1}\n',
    );
    await failed;
    expect(test.crash).toHaveBeenCalled();
    const other = setup();
    await other.ready();
    other.child.stdout.write("x".repeat(65537));
    expect(other.child.kill).toHaveBeenCalled();
  });
});
