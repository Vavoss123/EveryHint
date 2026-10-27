import { describe, expect, it } from "vitest";
import { audioPermissionAllowed } from "../src/main/audio-permissions";
import {
  parseAudioReport,
  type AudioWorkerPlan,
} from "../src/shared/audio-ipc";
import { parseConsent } from "../src/shared/validation";
const plan: AudioWorkerPlan = {
  token: "test",
  mode: "capture",
  capture: {
    microphone: false,
    systemAudio: false,
    microphoneDeviceId: "default",
  },
};
describe("audio consent and IPC boundaries", () => {
  it("requires independent microphone/system-audio consent and denies cameras and subframes", () => {
    expect(audioPermissionAllowed(plan, "media", ["audio"], true)).toBe(false);
    expect(
      audioPermissionAllowed(plan, "display-capture", ["audio", "video"], true),
    ).toBe(false);
    const microphone = {
      ...plan,
      capture: { ...plan.capture, microphone: true },
    };
    expect(audioPermissionAllowed(microphone, "media", ["audio"], true)).toBe(
      true,
    );
    expect(
      audioPermissionAllowed(microphone, "media", ["audio", "video"], true),
    ).toBe(false);
    expect(audioPermissionAllowed(microphone, "media", ["audio"], false)).toBe(
      false,
    );
    expect(
      audioPermissionAllowed(microphone, "display-capture", ["video"], true),
    ).toBe(false);
    const system = { ...plan, capture: { ...plan.capture, systemAudio: true } };
    expect(
      audioPermissionAllowed(
        system,
        "display-capture",
        ["audio", "video"],
        true,
      ),
    ).toBe(true);
    expect(audioPermissionAllowed(system, "media", ["audio"], true)).toBe(
      false,
    );
    expect(audioPermissionAllowed(undefined, "media", ["audio"], true)).toBe(
      false,
    );
    expect(audioPermissionAllowed(system, "geolocation", ["audio"], true)).toBe(
      false,
    );
  });
  it("requires exact booleans, at least one source, and participant acknowledgement", () => {
    expect(() =>
      parseConsent({
        screen: false,
        microphone: false,
        systemAudio: false,
        acknowledged: true,
      }),
    ).toThrow("at least one");
    expect(() =>
      parseConsent({
        screen: false,
        microphone: true,
        systemAudio: false,
        acknowledged: false,
      }),
    ).toThrow("acknowledgement");
    expect(
      parseConsent({
        screen: false,
        microphone: true,
        systemAudio: true,
        acknowledged: true,
      }).screen,
    ).toBe(false);
  });
  it("rejects unbounded, non-finite and duplicate diagnostics and raw PCM in IPC", () => {
    const source = {
      source: "microphone",
      state: "CAPTURING",
      name: "Headset",
      deviceId: "mic",
      level: 0.5,
      muted: false,
      error: null,
    };
    expect(
      parseAudioReport({ type: "diagnostics", sources: [source] }).type,
    ).toBe("diagnostics");
    for (const sources of [
      [{ ...source, level: NaN }],
      [{ ...source, level: 2 }],
      [source, source],
      [{ ...source, samples: new Float32Array(5) }],
      [{ ...source, state: "ACTIVE" }],
    ])
      expect(() =>
        parseAudioReport({ type: "diagnostics", sources }),
      ).toThrow();
    expect(() =>
      parseAudioReport({
        type: "devices",
        devices: Array(129).fill({ deviceId: "id", label: "mic" }),
      }),
    ).toThrow();
    expect(() =>
      parseAudioReport({ type: "error", message: "x".repeat(1001) }),
    ).toThrow();
  });
});
