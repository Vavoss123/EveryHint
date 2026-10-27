import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureSessionController } from "../src/main/session";
import { backend, consent, deferred, frame, source } from "./helpers";
import type { CaptureSource, SessionAction } from "../src/shared/contracts";

describe("capture sessions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function setup() {
    const capture = backend();
    const changed = vi.fn();
    const session = new CaptureSessionController(capture, () => 3000, changed);
    const prepare = async () => {
      await session.listSources(consent);
      session.prepare({ sourceId: source.id, consent });
    };
    return { capture, session, changed, prepare };
  }
  it("starts IDLE and never accesses a source at startup", async () => {
    const { session, capture } = setup();
    await vi.advanceTimersByTimeAsync(30000);
    expect(session.value.state).toBe("IDLE");
    expect(session.value.consent).toBeNull();
    expect(capture.listSources).not.toHaveBeenCalled();
    expect(capture.capture).not.toHaveBeenCalled();
  });
  it.each<SessionAction>(["start", "pause", "resume"])(
    "rejects %s from IDLE",
    (action) => {
      expect(() => setup().session.action(action)).toThrow("IDLE");
    },
  );
  it.each([
    {},
    { ...consent, screen: false },
    { ...consent, acknowledged: false },
    { ...consent, microphone: true },
    { ...consent, systemAudio: true },
    { ...consent, extra: true },
  ])("enforces consent before enumeration or prepare: %j", async (input) => {
    const { session, capture } = setup();
    await expect(session.listSources(input)).rejects.toThrow();
    expect(() =>
      session.prepare({ sourceId: source.id, consent: input }),
    ).toThrow();
    expect(capture.listSources).not.toHaveBeenCalled();
    expect(capture.capture).not.toHaveBeenCalled();
  });
  it("requires a source listed by the main process", async () => {
    const { session } = setup();
    expect(() => session.prepare({ sourceId: source.id, consent })).toThrow(
      "available source",
    );
    await session.listSources(consent);
    expect(() =>
      session.prepare({ sourceId: "window:999:0", consent }),
    ).toThrow("available source");
  });
  it("prepares without capturing, then captures at the configured interval", async () => {
    const { session, capture, prepare } = setup();
    await prepare();
    expect(session.value.state).toBe("READY");
    await vi.advanceTimersByTimeAsync(9000);
    expect(capture.capture).not.toHaveBeenCalled();
    session.action("start");
    expect(session.value.state).toBe("ACTIVE");
    await vi.advanceTimersByTimeAsync(3000);
    expect(capture.capture).toHaveBeenCalledWith(source);
    expect(session.value.frame).toEqual(frame);
    expect(session.value.frameCount).toBe(1);
    session.stop();
  });
  it("releases the scheduler on pause and only resumes an authorised session", async () => {
    const { session, capture, prepare } = setup();
    await prepare();
    session.action("start");
    await vi.advanceTimersByTimeAsync(3000);
    session.togglePause();
    expect(session.value.state).toBe("PAUSED");
    expect(session.value.frame).toBeNull();
    await vi.advanceTimersByTimeAsync(12000);
    expect(capture.capture).toHaveBeenCalledTimes(1);
    session.togglePause();
    expect(session.value.state).toBe("ACTIVE");
    expect(session.value.frame).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    expect(capture.capture).toHaveBeenCalledTimes(2);
    session.stop();
  });
  it("global pause is harmless before consent and after stopping", () => {
    const { session } = setup();
    session.togglePause();
    expect(session.value.state).toBe("IDLE");
    session.stop();
    session.togglePause();
    expect(session.value.state).toBe("STOPPED");
  });
  it("stop is idempotent, clears frames and consent, and prevents restart without prepare", async () => {
    const { session, capture, prepare } = setup();
    await prepare();
    session.action("start");
    await vi.advanceTimersByTimeAsync(3000);
    session.stop();
    session.stop();
    expect(session.value).toEqual({
      state: "STOPPED",
      source: null,
      consent: null,
      frame: null,
      frameCount: 0,
      error: null,
    });
    expect(() => session.action("resume")).toThrow();
    expect(() => session.action("start")).toThrow();
    await vi.advanceTimersByTimeAsync(9000);
    expect(capture.capture).toHaveBeenCalledTimes(1);
  });
  it("never allows changing the source during ACTIVE or PAUSED", async () => {
    const { session, prepare } = setup();
    await prepare();
    session.action("start");
    expect(() => session.prepare({ sourceId: source.id, consent })).toThrow(
      "Stop",
    );
    await expect(session.listSources(consent)).rejects.toThrow("Stop");
    session.action("pause");
    await expect(session.listSources(consent)).rejects.toThrow("Stop");
    session.stop();
  });
  it("surfaces permission/source errors and requires fresh consent to recover", async () => {
    const { session, capture, prepare } = setup();
    await prepare();
    capture.capture.mockRejectedValueOnce(new Error("Source disappeared"));
    session.action("start");
    await vi.advanceTimersByTimeAsync(3000);
    expect(session.value.state).toBe("ERROR");
    expect(session.value.error).toBe("Source disappeared");
    expect(session.value.consent).toBeNull();
    expect(session.value.frame).toBeNull();
    expect(() => session.action("resume")).toThrow();
    await prepare();
    expect(session.value.state).toBe("READY");
  });
  it("reports enumeration failures without activating capture", async () => {
    const { session, capture } = setup();
    capture.listSources.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(session.listSources(consent)).rejects.toThrow(
      "Permission denied",
    );
    expect(session.value.state).toBe("ERROR");
    expect(capture.capture).not.toHaveBeenCalled();
  });
  it("invalidates source selection still in flight when stopped", async () => {
    const { session, capture } = setup();
    const pending = deferred<CaptureSource[]>();
    capture.listSources.mockReturnValueOnce(pending.promise);
    const listing = session.listSources(consent);
    session.stop();
    pending.resolve([source]);
    await expect(listing).rejects.toThrow("cancelled");
    expect(session.value.state).toBe("STOPPED");
    expect(() => session.prepare({ sourceId: source.id, consent })).toThrow(
      "available source",
    );
  });
  it("returns snapshots that cannot mutate the authoritative state", async () => {
    const { session, prepare } = setup();
    await prepare();
    const copy = session.value;
    copy.state = "ACTIVE";
    copy.source!.id = "screen:999:0";
    expect(session.value.state).toBe("READY");
    expect(session.value.source?.id).toBe(source.id);
  });
});
