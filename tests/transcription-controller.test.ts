import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AudioSourceId,
  SessionSnapshot,
  SourceStatus,
} from "../src/shared/contracts";
import { TranscriptionController } from "../src/main/transcription/controller";
import { SpeechInstallation } from "../src/main/transcription/models";
import { deferred } from "./helpers";
import type {
  InferenceResult,
  InferenceWorker,
} from "../src/main/transcription/worker";
function capture(): SessionSnapshot {
  const status = (name: string): SourceStatus => ({
    state: "CAPTURING",
    name,
    deviceId: null,
    level: 0,
    muted: false,
    error: null,
  });
  return {
    sessionId: "session-1",
    epoch: 1,
    state: "ACTIVE",
    source: null,
    consent: {
      screen: false,
      microphone: true,
      systemAudio: true,
      acknowledged: true,
    },
    sources: {
      screen: { ...status("Screen"), state: "DISABLED" },
      microphone: status("Mic"),
      systemAudio: status("System"),
    },
    frame: null,
    frameCount: 0,
    error: null,
  };
}
const result: InferenceResult = {
  text: "recognised words",
  latencyMs: 10,
  cpuPercent: 300,
  memoryBytes: 1000,
};
describe("local transcription lifecycle", () => {
  let root: string;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    root = await mkdtemp(join(tmpdir(), "everyhint-transcription-"));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });
  function setup() {
    const installation = new SpeechInstallation(root, vi.fn());
    vi.spyOn(installation, "ensureReady").mockResolvedValue("model.bin");
    const worker = {
      start: vi.fn<InferenceWorker["start"]>(async () => ({
        loadMs: 5,
        memoryBytes: 100,
      })),
      infer: vi.fn<InferenceWorker["infer"]>(async () => ({ ...result })),
      stop: vi.fn(),
    };
    const changed = vi.fn(),
      transport = vi.fn(),
      controller = new TranscriptionController(
        installation,
        changed,
        transport,
        () => worker,
      );
    const session = capture();
    controller.captureChanged(session);
    const streams: Record<
      AudioSourceId,
      { sequence: number; timestamp: number }
    > = {
      microphone: { sequence: 0, timestamp: 1000000 },
      systemAudio: { sequence: 0, timestamp: 1000000 },
    };
    function feed(source: AudioSourceId, ms: number, value: number) {
      for (let i = 0; i < ms / 20; i++) {
        const stream = streams[source];
        const token = transport.mock.lastCall?.[0] as string;
        controller.accept(token, {
          source,
          streamId: `${source}-stream`,
          sequence: stream.sequence++,
          timestamp: stream.timestamp,
          channels: 1,
          sampleRate: 16000,
          lifecycle: "data",
          format: "f32-interleaved",
          samples: new Float32Array(320).fill(value),
        });
        stream.timestamp += 20;
      }
    }
    return {
      controller,
      worker,
      changed,
      transport,
      session,
      feed,
      installation,
    };
  }
  it("requires an active, consented audio session and is off on startup", async () => {
    const test = setup();
    expect(test.controller.value.state).toBe("OFF");
    test.controller.captureChanged({ ...test.session, state: "READY" });
    await expect(test.controller.enable()).rejects.toThrow("authorised");
    expect(test.worker.start).not.toHaveBeenCalled();
    test.controller.dispose();
  });
  it("routes both sources fairly, replaces partials, and orders final transcripts", async () => {
    const test = setup();
    await test.controller.enable();
    test.feed("microphone", 3000, 0.2);
    test.feed("systemAudio", 3000, 0.2);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.controller.value.events).toHaveLength(2);
    expect(
      test.controller.value.events.every((event) => event.state === "partial"),
    ).toBe(true);
    test.feed("microphone", 1000, 0);
    test.feed("systemAudio", 1000, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.controller.value.events).toHaveLength(2);
    expect(
      test.controller.value.events.every((event) => event.state === "final"),
    ).toBe(true);
    expect(test.worker.start).toHaveBeenCalledTimes(1);
    test.controller.dispose();
  });
  it.each(["pause", "stop", "clear", "shutdown"] as const)(
    "cancels %s without publishing late results",
    async (action) => {
      const test = setup(),
        pending = deferred<InferenceResult>();
      test.worker.infer.mockReturnValueOnce(pending.promise);
      await test.controller.enable();
      test.feed("microphone", 3000, 0.2);
      if (action === "pause") test.controller.pause();
      if (action === "stop")
        test.controller.captureChanged({
          ...test.session,
          state: "STOPPED",
          epoch: 2,
          sessionId: null,
          consent: null,
        });
      if (action === "clear") test.controller.clear();
      if (action === "shutdown") test.controller.dispose();
      pending.resolve(result);
      await vi.advanceTimersByTimeAsync(0);
      expect(test.controller.value.events).toHaveLength(0);
      expect(test.transport.mock.lastCall?.[0]).toBeNull();
      test.controller.dispose();
    },
  );
  it("handles model failures, helper crashes and cancelled loading", async () => {
    const test = setup();
    vi.mocked(test.installation.ensureReady).mockRejectedValueOnce(
      new Error("Missing model"),
    );
    await expect(test.controller.enable()).rejects.toThrow("Missing model");
    expect(test.controller.value.state).toBe("ERROR");
    await test.controller.enable();
    test.worker.start.mock.lastCall![1]("worker crashed");
    expect(test.controller.value.state).toBe("ERROR");
    const loading = deferred<{ loadMs: number; memoryBytes: number }>();
    test.worker.start.mockReturnValueOnce(loading.promise);
    const enabled = test.controller.enable();
    await vi.advanceTimersByTimeAsync(0);
    test.controller.pause();
    loading.resolve({ loadMs: 1, memoryBytes: 1 });
    await enabled;
    expect(test.controller.value.state).toBe("PAUSED");
    expect(test.transport.mock.lastCall?.[0]).toBeNull();
    test.controller.dispose();
  });
  it("bounds overload queues, drops work visibly and avoids duplicate model instances", async () => {
    const test = setup(),
      pending = deferred<InferenceResult>();
    test.worker.infer.mockReturnValueOnce(pending.promise);
    await test.controller.enable();
    await expect(test.controller.enable()).rejects.toThrow("already enabled");
    test.feed("microphone", 40000, 0.2);
    test.feed("systemAudio", 40000, 0.2);
    expect(test.controller.value.diagnostics.queueLength).toBeLessThanOrEqual(
      4,
    );
    expect(test.controller.value.diagnostics.droppedJobs).toBeGreaterThan(0);
    expect(test.worker.infer).toHaveBeenCalledTimes(1);
    test.controller.pause();
    pending.resolve(result);
    await vi.advanceTimersByTimeAsync(0);
    test.controller.dispose();
  });
  it("alternates waiting sources instead of letting microphone jobs starve system audio", async () => {
    const test = setup(),
      pending = deferred<InferenceResult>();
    test.worker.infer.mockReturnValueOnce(pending.promise);
    await test.controller.enable();
    test.feed("microphone", 3000, 0.2);
    test.feed("systemAudio", 3000, 0.4);
    test.feed("microphone", 3000, 0.2);
    pending.resolve(result);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.worker.infer.mock.calls[1]?.[0][100]).toBeCloseTo(0.4, 2);
    test.controller.dispose();
  });
  it("rejects unconsented PCM and expired transport tokens", async () => {
    const test = setup();
    test.session.consent!.systemAudio = false;
    test.controller.captureChanged(test.session);
    await test.controller.enable();
    expect(test.controller.accept("old-run", {})).toBe(false);
    test.feed("systemAudio", 20, 0.2);
    expect(test.controller.value.state).toBe("ERROR");
    test.controller.dispose();
  });
  it("clears conversation state on a new capture session and applies settings conservatively", async () => {
    const test = setup();
    await test.controller.enable();
    test.feed("microphone", 3000, 0.2);
    test.feed("microphone", 1000, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.controller.value.events.length).toBeGreaterThan(0);
    test.controller.configure({
      ...test.installation.settings,
      model: "base.en",
    });
    expect(test.controller.value.state).toBe("PAUSED");
    test.controller.captureChanged({
      ...test.session,
      epoch: 3,
      sessionId: "new-session",
    });
    expect(test.controller.value.events).toHaveLength(0);
    test.controller.dispose();
  });
  it("automatically expires retained text without new speech or UI reads", async () => {
    const test = setup();
    test.controller.configure({
      ...test.installation.settings,
      retentionMinutes: 1,
    });
    await test.controller.enable();
    test.feed("microphone", 3000, 0.2);
    test.feed("microphone", 1000, 0);
    await vi.advanceTimersByTimeAsync(0);
    test.controller.pause();
    expect(test.controller.value.events.length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(65000);
    expect(test.changed.mock.lastCall?.[0].events).toHaveLength(0);
    test.controller.dispose();
  });
});
