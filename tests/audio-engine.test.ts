import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAudioCapture,
  type AudioEnvironment,
} from "../src/renderer/audio/engine";
import { deferred } from "./helpers";

class Track extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  enabled = true;
  muted = false;
  label: string;
  constructor(
    readonly kind: "audio" | "video",
    readonly deviceId = "mic",
  ) {
    super();
    this.label = deviceId;
  }
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
  getSettings() {
    return { deviceId: this.deviceId };
  }
}
function stream(...tracks: Track[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
    removeTrack: (track: Track) => {
      tracks = tracks.filter((item) => item !== track);
    },
  } as unknown as MediaStream;
}
const device = (deviceId: string, kind: MediaDeviceKind = "audioinput") =>
  ({ deviceId, kind, groupId: deviceId, label: deviceId }) as MediaDeviceInfo;
function setup() {
  const microphone = new Track("audio"),
    system = new Track("audio", "loopback"),
    video = new Track("video");
  const events = new EventTarget();
  const devices = Object.assign(events, {
    getUserMedia: vi.fn(async () => stream(microphone)),
    getDisplayMedia: vi.fn(async () => stream(system, video)),
    enumerateDevices: vi.fn(async () => [
      device("mic"),
      device("out", "audiooutput"),
    ]),
  });
  const contexts: AudioContext[] = [],
    nodes: AudioWorkletNode[] = [];
  function createContext() {
    const contextEvents = new EventTarget();
    const context = Object.assign(contextEvents, {
      state: "running" as AudioContextState,
      sampleRate: 48000,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {
        context.state = "closed";
      }),
    });
    contexts.push(context as unknown as AudioContext);
    return context;
  }
  function createNode() {
    const node = {
      port: {
        onmessage: null as ((event: MessageEvent) => void) | null,
        postMessage: vi.fn(),
        close: vi.fn(),
      },
      onprocessorerror: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    nodes.push(node as unknown as AudioWorkletNode);
    return node;
  }
  const environment = {
    devices,
    createContext,
    createNode,
    workletUrl: "test-worklet",
  } as unknown as AudioEnvironment;
  const report = vi.fn(),
    failure = vi.fn();
  const engine = new BrowserAudioCapture(environment, report, failure);
  return {
    engine,
    environment,
    report,
    failure,
    devices,
    microphone,
    system,
    video,
    contexts,
    nodes,
  };
}
const plan = {
  microphone: true,
  systemAudio: true,
  microphoneDeviceId: "default",
};
describe("browser audio acquisition and disposal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("acquires independent sources, releases companion video, and computes separate levels", async () => {
    const test = setup();
    await test.engine.start(plan);
    expect(test.devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(test.devices.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(test.video.stop).toHaveBeenCalledTimes(1);
    expect(test.contexts.length).toBe(2);
    test.nodes[0]!.port.onmessage!({
      data: {
        samples: new Float32Array(4096).fill(0.25),
        channels: 1,
        sampleRate: 48000,
      },
    } as MessageEvent);
    test.nodes[1]!.port.onmessage!({
      data: {
        samples: new Float32Array(8192).fill(0.5),
        channels: 2,
        sampleRate: 48000,
      },
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(200);
    expect(
      test.report.mock.lastCall?.[0].find(
        (source: { source: string }) => source.source === "microphone",
      ).level,
    ).toBeCloseTo(0.25);
    expect(
      test.report.mock.lastCall?.[0].find(
        (source: { source: string }) => source.source === "systemAudio",
      ).level,
    ).toBeCloseTo(0.5);
    expect(test.nodes[0]!.port.postMessage).toHaveBeenCalledWith("ack");
    test.engine.stop();
    test.engine.stop();
    for (const context of test.contexts)
      expect(context.close).toHaveBeenCalledTimes(1);
    for (const node of test.nodes) {
      expect(node.disconnect).toHaveBeenCalledTimes(1);
      expect(node.port.close).toHaveBeenCalledTimes(1);
    }
    expect(test.microphone.stop).toHaveBeenCalledTimes(1);
    expect(test.system.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    [true, false],
    [false, true],
  ])(
    "never starts a disabled source: mic=%s system=%s",
    async (microphone, systemAudio) => {
      const test = setup();
      await test.engine.start({
        ...plan,
        microphone: microphone!,
        systemAudio: systemAudio!,
      });
      expect(test.devices.getUserMedia).toHaveBeenCalledTimes(
        microphone ? 1 : 0,
      );
      expect(test.devices.getDisplayMedia).toHaveBeenCalledTimes(
        systemAudio ? 1 : 0,
      );
      test.engine.stop();
    },
  );
  it("zeroes muted and stale meters, supports unmute and responds to track mute events", async () => {
    const test = setup();
    await test.engine.start({ ...plan, systemAudio: false });
    const packet = {
      data: {
        samples: new Float32Array(4096).fill(0.5),
        channels: 1,
        sampleRate: 48000,
      },
    } as MessageEvent;
    test.nodes[0]!.port.onmessage!(packet);
    await vi.advanceTimersByTimeAsync(800);
    expect(test.report.mock.lastCall?.[0][0].level).toBe(0);
    test.engine.setMicrophoneMuted(true);
    expect(test.microphone.enabled).toBe(false);
    expect(test.report.mock.lastCall?.[0][0].muted).toBe(true);
    test.nodes[0]!.port.onmessage!(packet);
    await vi.advanceTimersByTimeAsync(200);
    expect(test.report.mock.lastCall?.[0][0].level).toBe(0);
    test.engine.setMicrophoneMuted(false);
    test.nodes[0]!.port.onmessage!(packet);
    await vi.advanceTimersByTimeAsync(200);
    expect(test.report.mock.lastCall?.[0][0].level).toBe(0.5);
    test.microphone.muted = true;
    test.microphone.dispatchEvent(new Event("mute"));
    expect(test.report.mock.lastCall?.[0][0].level).toBe(0);
    test.engine.stop();
  });
  it("honours microphone mute before starting its processing graph", async () => {
    const test = setup();
    await test.engine.start({
      ...plan,
      systemAudio: false,
      microphoneMuted: true,
    });
    expect(test.microphone.enabled).toBe(false);
    expect(test.report.mock.lastCall?.[0][0].muted).toBe(true);
    test.engine.stop();
  });
  it("handles permission denial and stops any other already acquired source", async () => {
    const test = setup();
    test.devices.getUserMedia.mockRejectedValueOnce(
      new DOMException("Access denied", "NotAllowedError"),
    );
    await test.engine.start(plan);
    expect(test.failure).toHaveBeenCalledWith(
      expect.stringContaining("Access denied"),
      "microphone",
    );
    expect(test.system.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops capture on device disconnection and processor failure", async () => {
    const test = setup();
    await test.engine.start(plan);
    test.microphone.dispatchEvent(new Event("ended"));
    expect(test.failure).toHaveBeenCalledWith(
      expect.stringContaining("disconnected"),
      "microphone",
    );
    expect(test.system.stop).toHaveBeenCalled();
    const other = setup();
    await other.engine.start({ ...plan, systemAudio: false });
    other.nodes[0]!.onprocessorerror!(
      new Event("processorerror") as ErrorEvent,
    );
    expect(other.failure).toHaveBeenCalledWith(
      expect.stringContaining("processing failed"),
      "microphone",
    );
    expect(other.microphone.stop).toHaveBeenCalled();
  });
  it("handles microphone removal and output changes without silently switching devices", async () => {
    const test = setup();
    await test.engine.start(plan);
    test.devices.enumerateDevices.mockResolvedValueOnce([
      device("other"),
      device("out", "audiooutput"),
    ]);
    test.devices.dispatchEvent(new Event("devicechange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(test.failure).toHaveBeenCalledWith(
      expect.stringContaining("microphone disconnected"),
      "microphone",
    );
    const other = setup();
    await other.engine.start({ ...plan, microphone: false });
    other.devices.enumerateDevices.mockResolvedValueOnce([
      device("new-output", "audiooutput"),
    ]);
    other.devices.dispatchEvent(new Event("devicechange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(other.failure).toHaveBeenCalledWith(
      expect.stringContaining("playback devices changed"),
      "systemAudio",
    );
  });
  it("drops late acquisition after stop and releases resources while a worklet is loading", async () => {
    const test = setup(),
      pending = deferred<MediaStream>();
    test.devices.getUserMedia.mockReturnValueOnce(pending.promise);
    const starting = test.engine.start({ ...plan, systemAudio: false });
    test.engine.stop();
    pending.resolve(stream(test.microphone));
    await starting;
    expect(test.microphone.stop).toHaveBeenCalled();
    expect(test.contexts).toHaveLength(0);
    const loading = setup(),
      module = deferred<void>();
    const original = loading.environment.createContext;
    loading.environment.createContext = () => {
      const context = original();
      vi.mocked(context.audioWorklet.addModule).mockReturnValueOnce(
        module.promise,
      );
      return context;
    };
    const start = loading.engine.start({ ...plan, systemAudio: false });
    await vi.advanceTimersByTimeAsync(0);
    loading.engine.stop();
    expect(loading.microphone.stop).toHaveBeenCalled();
    expect(loading.contexts[0]!.close).toHaveBeenCalled();
    module.resolve();
    await start;
    expect(loading.nodes).toHaveLength(0);
  });
  it("handles worklet setup failure and empty loopback streams without leaking resources", async () => {
    const test = setup(),
      original = test.environment.createContext;
    test.environment.createContext = () => {
      const context = original();
      vi.mocked(context.audioWorklet.addModule).mockRejectedValueOnce(
        new Error("Module failed"),
      );
      return context;
    };
    await test.engine.start({ ...plan, systemAudio: false });
    expect(test.contexts[0]!.state).toBe("closed");
    expect(test.microphone.stop).toHaveBeenCalled();
    expect(test.failure).toHaveBeenCalled();
    const empty = setup();
    empty.devices.getDisplayMedia.mockResolvedValueOnce(stream(empty.video));
    await empty.engine.start({ ...plan, microphone: false });
    expect(empty.video.stop).toHaveBeenCalled();
    expect(empty.failure).toHaveBeenCalledWith(
      expect.stringContaining("no live loopback"),
      "systemAudio",
    );
  });
  it("leaves no timer or processing nodes across repeated start/stop cycles", async () => {
    const test = setup();
    for (let i = 0; i < 5; i++) {
      test.microphone.readyState = "live";
      test.system.readyState = "live";
      await test.engine.start(plan);
      test.engine.stop();
    }
    expect(test.contexts).toHaveLength(10);
    for (const context of test.contexts) expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
