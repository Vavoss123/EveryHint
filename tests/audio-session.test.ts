import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AudioCaptureManager,
  AudioDiagnostic,
  AudioSourceId,
  Consent,
} from "../src/shared/contracts";
import { CaptureSessionController } from "../src/main/session";
import { backend, deferred, source } from "./helpers";
const consent = (
  screen: boolean,
  microphone: boolean,
  systemAudio: boolean,
): Consent => ({ screen, microphone, systemAudio, acknowledged: true });
const diagnostic = (source: AudioSourceId, level = 0.25): AudioDiagnostic => ({
  source,
  state: "CAPTURING",
  name: source,
  deviceId: source === "microphone" ? "mic" : null,
  level,
  muted: false,
  error: null,
});
function setup(supported = true) {
  let update!: (value: AudioDiagnostic) => void;
  let failure!: (message: string, source?: AudioSourceId) => void;
  const audio = {
    listMicrophones: vi.fn(async () => [{ deviceId: "mic", label: "Headset" }]),
    start: vi.fn<AudioCaptureManager["start"]>(async (_plan, next, fail) => {
      update = next;
      failure = fail;
    }),
    stop: vi.fn(),
    setMicrophoneMuted: vi.fn(),
  };
  const screen = backend(),
    changed = vi.fn(),
    meters = vi.fn();
  const session = new CaptureSessionController(
    screen,
    () => 3000,
    changed,
    audio,
    meters,
    supported,
  );
  const prepare = async (selection: Consent) => {
    if (selection.screen) await session.listSources(selection);
    session.prepare({
      consent: selection,
      ...(selection.screen ? { sourceId: source.id } : {}),
    });
  };
  return {
    audio,
    screen,
    changed,
    meters,
    session,
    prepare,
    update: (value: AudioDiagnostic) => update(value),
    fail: (message: string, source?: AudioSourceId) => failure(message, source),
  };
}
describe("independent multi-source sessions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it.each([
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])(
    "activates only consented sources: %j",
    async (screen, microphone, systemAudio) => {
      const test = setup(),
        selected = consent(screen!, microphone!, systemAudio!);
      await test.prepare(selected);
      expect(test.session.value.state).toBe("READY");
      expect(test.audio.start).not.toHaveBeenCalled();
      await test.session.action("start");
      await vi.advanceTimersByTimeAsync(3000);
      expect(test.screen.capture).toHaveBeenCalledTimes(screen ? 1 : 0);
      expect(test.audio.start).toHaveBeenCalledTimes(
        microphone || systemAudio ? 1 : 0,
      );
      for (const id of ["screen", "microphone", "systemAudio"] as const)
        expect(test.session.value.sources[id].state).toBe(
          selected[id]
            ? id === "screen"
              ? "CAPTURING"
              : "STARTING"
            : "DISABLED",
        );
      test.session.stop();
    },
  );
  it("never enumerates microphones or screens without corresponding consent", async () => {
    const test = setup();
    await expect(
      test.session.listMicrophones(consent(true, false, false)),
    ).rejects.toThrow("Microphone consent");
    await expect(
      test.session.listSources(consent(false, true, false)),
    ).rejects.toThrow("Screen consent");
    expect(test.audio.listMicrophones).not.toHaveBeenCalled();
    expect(test.screen.listSources).not.toHaveBeenCalled();
    expect(() =>
      test.session.prepare({
        consent: consent(false, true, false),
        sourceId: source.id,
      }),
    ).toThrow("screen consent");
    expect(() =>
      test.session.prepare({
        consent: consent(false, false, true),
        microphoneDeviceId: "mic",
      }),
    ).toThrow("microphone consent");
  });
  it("validates microphone choices against enumerated devices", async () => {
    const test = setup(),
      selected = consent(false, true, false);
    expect(() =>
      test.session.prepare({ consent: selected, microphoneDeviceId: "mic" }),
    ).toThrow("available");
    await test.session.listMicrophones(selected);
    test.session.prepare({ consent: selected, microphoneDeviceId: "mic" });
    expect(test.session.value.sources.microphone.deviceId).toBe("mic");
  });
  it("rejects loopback on unsupported operating systems", () => {
    expect(() =>
      setup(false).session.prepare({ consent: consent(false, false, true) }),
    ).toThrow("Windows only");
  });
  it("reports actual startup and zeroes all sources immediately on pause and stop", async () => {
    const test = setup();
    await test.prepare(consent(true, true, true));
    await test.session.action("start");
    test.update(diagnostic("microphone"));
    test.update(diagnostic("systemAudio", 0.7));
    expect(test.session.value.sources.microphone.state).toBe("CAPTURING");
    const before = test.changed.mock.calls.length;
    test.update(diagnostic("microphone", 0.4));
    expect(test.changed).toHaveBeenCalledTimes(before);
    expect(test.meters).toHaveBeenCalled();
    test.session.action("pause");
    expect(test.session.value.frame).toBeNull();
    for (const status of Object.values(test.session.value.sources)) {
      expect(status.state).toBe("PAUSED");
      expect(status.level).toBe(0);
    }
    test.update(diagnostic("microphone", 1));
    expect(test.session.value.sources.microphone.level).toBe(0);
    await test.session.action("resume");
    expect(test.audio.start).toHaveBeenCalledTimes(2);
    test.session.stop();
    expect(test.session.value.consent).toBeNull();
    for (const status of Object.values(test.session.value.sources))
      expect(status.level).toBe(0);
    expect(() => test.session.action("resume")).toThrow("STOPPED");
  });
  it("stops all sources on disconnect or permission revocation and preserves the failing source error", async () => {
    const test = setup();
    await test.prepare(consent(true, true, true));
    await test.session.action("start");
    test.fail("Microphone disconnected", "microphone");
    expect(test.session.value.state).toBe("ERROR");
    expect(test.session.value.sources.microphone.state).toBe("ERROR");
    expect(test.session.value.sources.systemAudio.state).toBe("STOPPED");
    expect(test.session.value.consent).toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(test.screen.capture).not.toHaveBeenCalled();
  });
  it("cleans up rejected startup and ignores rejection after a concurrent emergency stop", async () => {
    const test = setup();
    test.audio.start.mockRejectedValueOnce(new Error("Permission denied"));
    await test.prepare(consent(false, true, false));
    await test.session.action("start");
    expect(test.session.value.state).toBe("ERROR");
    const pending = deferred<void>();
    test.audio.start.mockReturnValueOnce(pending.promise);
    await test.prepare(consent(false, true, false));
    const starting = test.session.action("start");
    test.session.stop();
    pending.reject(new Error("late error"));
    await starting;
    expect(test.session.value.state).toBe("STOPPED");
  });
  it("requires capture consent to mute and rejects unselected source reports", async () => {
    const test = setup();
    expect(() => test.session.setMicrophoneMuted(true)).toThrow("authorised");
    await test.prepare(consent(false, true, false));
    await test.session.action("start");
    test.update(diagnostic("microphone"));
    test.session.setMicrophoneMuted(true);
    expect(test.audio.setMicrophoneMuted).toHaveBeenCalledWith(true);
    test.update(diagnostic("systemAudio"));
    expect(test.session.value.state).toBe("ERROR");
  });
  it("preserves an explicit microphone mute across pause/resume", async () => {
    const test = setup();
    await test.prepare(consent(false, true, false));
    await test.session.action("start");
    test.update(diagnostic("microphone"));
    test.session.setMicrophoneMuted(true);
    test.session.action("pause");
    await test.session.action("resume");
    expect(test.audio.start.mock.lastCall?.[0].microphoneMuted).toBe(true);
    test.session.stop();
  });
  it("prevents duplicate starts and disposes every repeated session and shutdown", async () => {
    const test = setup();
    for (let i = 0; i < 10; i++) {
      await test.prepare(consent(false, true, true));
      await test.session.action("start");
      expect(() => test.session.action("start")).toThrow("ACTIVE");
      test.session.stop();
    }
    test.session.stop();
    expect(test.audio.start).toHaveBeenCalledTimes(10);
    expect(test.audio.stop.mock.calls.length).toBeGreaterThanOrEqual(21);
    expect(vi.getTimerCount()).toBe(0);
  });
});
