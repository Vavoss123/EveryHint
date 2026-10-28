import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenCaptureService } from "../src/main/capture";
import type { ScreenFrame } from "../src/shared/contracts";
import { backend, deferred, frame, source } from "./helpers";

describe("screen capture lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("shares an in-flight native frame but never reuses it after a generation change", async () => {
    const capture = backend(),
      pending = deferred<ScreenFrame>();
    capture.capture.mockReturnValueOnce(pending.promise);
    const service = new ScreenCaptureService(capture);
    const first = service.snapshot(source);
    const shared = service.snapshot(source);
    expect(capture.capture).toHaveBeenCalledTimes(1);
    service.stop();
    const fresh = service.snapshot(source);
    pending.resolve(frame);
    await Promise.all([first, shared, fresh]);
    expect(capture.capture).toHaveBeenCalledTimes(2);
  });
  it("does not issue a queued native capture after its generation is stopped", async () => {
    const capture = backend(),
      pending = deferred<ScreenFrame>();
    capture.capture.mockReturnValueOnce(pending.promise);
    const service = new ScreenCaptureService(capture);
    const first = service.snapshot(source);
    service.stop();
    const queued = service.snapshot(source);
    service.stop();
    pending.resolve(frame);
    await first;
    await expect(queued).rejects.toThrow("capture changed");
    expect(capture.capture).toHaveBeenCalledTimes(1);
  });
  it("captures sequentially without overlapping slow native requests", async () => {
    const capture = backend(),
      pending = deferred<ScreenFrame>(),
      gotFrame = vi.fn();
    capture.capture.mockReturnValueOnce(pending.promise);
    const service = new ScreenCaptureService(capture);
    service.start(source, 3000, gotFrame, vi.fn());
    await vi.advanceTimersByTimeAsync(30000);
    expect(capture.capture).toHaveBeenCalledTimes(1);
    pending.resolve(frame);
    await vi.advanceTimersByTimeAsync(0);
    expect(gotFrame).toHaveBeenCalledWith(frame);
    await vi.advanceTimersByTimeAsync(3000);
    expect(capture.capture).toHaveBeenCalledTimes(2);
    service.stop();
    expect(service.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["resolve", "reject"] as const)(
    "discards a late %s after stop",
    async (completion) => {
      const capture = backend(),
        pending = deferred<ScreenFrame>(),
        gotFrame = vi.fn(),
        gotError = vi.fn();
      capture.capture.mockReturnValueOnce(pending.promise);
      const service = new ScreenCaptureService(capture);
      service.start(source, 1000, gotFrame, gotError);
      await vi.advanceTimersByTimeAsync(1000);
      service.stop();
      if (completion === "resolve") pending.resolve(frame);
      else pending.reject(new Error("late failure"));
      await vi.advanceTimersByTimeAsync(10000);
      expect(gotFrame).not.toHaveBeenCalled();
      expect(gotError).not.toHaveBeenCalled();
      expect(capture.capture).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("does not let an old capture leak into a resumed generation", async () => {
    const capture = backend(),
      pending = deferred<ScreenFrame>(),
      first = vi.fn(),
      second = vi.fn();
    capture.capture.mockReturnValueOnce(pending.promise);
    const service = new ScreenCaptureService(capture);
    service.start(source, 1000, first, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    service.stop();
    service.start(source, 1000, second, vi.fn());
    await vi.advanceTimersByTimeAsync(3000);
    expect(capture.capture).toHaveBeenCalledTimes(1);
    pending.resolve(frame);
    await vi.advanceTimersByTimeAsync(0);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(second).toHaveBeenCalledWith(frame);
    service.stop();
  });
  it("stops and reports a capture failure once", async () => {
    const capture = backend(),
      gotError = vi.fn();
    capture.capture.mockRejectedValue(new Error("Capture unavailable"));
    const service = new ScreenCaptureService(capture);
    service.start(source, 1000, vi.fn(), gotError);
    await vi.advanceTimersByTimeAsync(10000);
    expect(service.running).toBe(false);
    expect(gotError).toHaveBeenCalledExactlyOnceWith("Capture unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });
});
