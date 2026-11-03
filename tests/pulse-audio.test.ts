import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { expect, it, vi } from "vitest";
import { PulseAudioCapture } from "../src/main/pulse-audio";
import { parseAudioFrame } from "../src/shared/transcription";

function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  const frame = vi.fn(),
    launch = vi.fn(() => child),
    update = vi.fn(),
    failure = vi.fn();
  const capture = new PulseAudioCapture(
    frame,
    launch as unknown as typeof spawn,
  );
  return { child, frame, launch, capture, update, failure };
}
function samples(value = 0.25) {
  const bytes = Buffer.alloc(6400);
  for (let i = 0; i < 1600; i++) bytes.writeFloatLE(value, i * 4);
  return bytes;
}
it("captures only the playback monitor and waits for PCM without forwarding unapproved transcription", async () => {
  const f = fixture(),
    work = f.capture.start(f.update, f.failure);
  expect(f.launch.mock.calls[0]).toEqual([
    "/usr/bin/parec",
    expect.arrayContaining([
      "--device=@DEFAULT_MONITOR@",
      "--raw",
      "--format=float32le",
    ]),
    expect.anything(),
  ]);
  const packet = samples();
  f.child.stdout.write(packet.subarray(0, 2000));
  expect(f.update).not.toHaveBeenCalled();
  f.child.stdout.write(packet.subarray(2000));
  await work;
  expect(f.update).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "systemAudio",
      state: "CAPTURING",
      level: 0.25,
    }),
  );
  expect(f.frame).not.toHaveBeenCalled();
  f.capture.stop();
});
it("labels bounded PCM independently, rotates stream identity with tokens and ignores stale data after Stop", async () => {
  const f = fixture(),
    work = f.capture.start(f.update, f.failure);
  f.child.stdout.write(samples());
  await work;
  f.capture.setToken("first");
  f.child.stdout.write(samples());
  expect(
    f.frame.mock.calls.map((c) => parseAudioFrame(c[1]).lifecycle),
  ).toEqual(["started", "data"]);
  const first = f.frame.mock.calls[1]![1];
  expect(first).toMatchObject({
    source: "systemAudio",
    sequence: 1,
    sampleRate: 16000,
    channels: 1,
  });
  expect(first.samples).toHaveLength(1600);
  f.capture.setToken("second");
  f.child.stdout.write(samples());
  expect(f.frame.mock.calls[3]![0]).toBe("second");
  expect(f.frame.mock.calls[3]![1].streamId).not.toBe(first.streamId);
  f.capture.stop();
  const count = f.frame.mock.calls.length;
  f.child.stdout.write(samples());
  expect(f.frame).toHaveBeenCalledTimes(count);
  expect(f.child.kill).toHaveBeenCalledOnce();
});
it("cancels startup immediately and releases the owned process", async () => {
  const f = fixture(),
    work = f.capture.start(f.update, f.failure);
  const rejected = expect(work).rejects.toThrow("cancelled");
  f.capture.stop();
  await rejected;
  f.child.emit("close", 0);
  expect(f.failure).not.toHaveBeenCalled();
});
it("fails visibly on a missing audio server/tool without accepting invalid samples", async () => {
  const f = fixture(),
    work = f.capture.start(f.update, f.failure);
  const rejected = expect(work).rejects.toThrow("pulseaudio-utils");
  f.child.emit("error", new Error("ENOENT"));
  await rejected;
  expect(f.failure).toHaveBeenCalledWith(
    expect.stringContaining("pulseaudio-utils"),
    "systemAudio",
  );
  const invalid = fixture(),
    pending = invalid.capture.start(invalid.update, invalid.failure);
  const failed = expect(pending).rejects.toThrow("safely");
  invalid.child.stdout.write(samples(NaN));
  await failed;
  expect(invalid.child.kill).toHaveBeenCalledOnce();
  expect(invalid.frame).not.toHaveBeenCalled();
});
