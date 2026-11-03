import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElectronAudioCapture } from "../src/main/audio-host";
import { systemPreferences } from "electron";

const native = vi.hoisted(() => ({
  check: vi.fn(),
  request: vi.fn(),
  display: vi.fn(),
  handle: vi.fn(),
  on: vi.fn(),
  getSources: vi.fn(),
  windows: [] as MockWindow[],
  constructorFailure: false,
}));
interface MockWindow {
  destroyed: boolean;
  url: string;
  destroy: ReturnType<typeof vi.fn>;
  webContents: {
    mainFrame: { url: string; detached: boolean };
    getURL(): string;
    executeJavaScript: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  events: Map<string, () => void>;
}
vi.mock("electron", () => ({
  session: {
    fromPartition: () => ({
      setPermissionCheckHandler: native.check,
      setPermissionRequestHandler: native.request,
      setDisplayMediaRequestHandler: native.display,
    }),
  },
  desktopCapturer: { getSources: native.getSources },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => "granted"),
    askForMediaAccess: vi.fn(async () => true),
  },
  ipcMain: { handle: native.handle, on: native.on },
  BrowserWindow: class {
    destroyed = false;
    url = "";
    events = new Map<string, () => void>();
    webContents = {
      mainFrame: { url: "", detached: false },
      getURL: () => this.url,
      executeJavaScript: vi.fn(async () => {}),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    constructor() {
      if (native.constructorFailure)
        throw new Error("Capture window creation failed");
      native.windows.push(this);
    }
    setMenu() {}
    isDestroyed() {
      return this.destroyed;
    }
    loadURL(url: string) {
      this.url = url;
      this.webContents.mainFrame.url = url;
      return Promise.resolve();
    }
    on(event: string, action: () => void) {
      this.events.set(event, action);
    }
    destroy = vi.fn(() => {
      this.destroyed = true;
      this.events.get("closed")?.();
    });
  },
}));
const url = "everyhint://app/audio.html";
const plan = {
  microphone: true,
  systemAudio: true,
  microphoneDeviceId: "default",
};
function ipc(channel: string) {
  return native.handle.mock.calls.find((call) => call[0] === channel)![1];
}
function workerEvent() {
  const window = native.windows.at(-1)!;
  return {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
}
function report(value: unknown) {
  native.on.mock.calls.find((call) => call[0] === "everyhint:audio-report")![1](
    workerEvent(),
    value,
  );
}
const sources = (["microphone", "systemAudio"] as const).map((source) => ({
  source,
  state: "CAPTURING",
  name: source,
  deviceId: null,
  level: 0,
  muted: false,
  error: null,
}));
describe("main-process audio lifecycle and permissions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    native.windows.length = 0;
    native.constructorFailure = false;
  });
  afterEach(() => vi.useRealTimers());
  it("keeps denied macOS microphone permission from creating a capture worker", async () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValueOnce(
      "not-determined",
    );
    vi.mocked(systemPreferences.askForMediaAccess).mockResolvedValueOnce(false);
    const host = new ElectronAudioCapture(
      url,
      "audio.cjs",
      vi.fn(),
      undefined,
      "darwin",
    );
    await expect(
      host.start({ ...plan, systemAudio: false }, vi.fn(), vi.fn()),
    ).rejects.toThrow("microphone access");
    expect(native.windows).toHaveLength(0);
  });
  it("does not acquire macOS audio after Stop while an OS permission prompt is pending", async () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValueOnce(
      "not-determined",
    );
    let grant!: (value: boolean) => void;
    vi.mocked(systemPreferences.askForMediaAccess).mockImplementationOnce(
      () =>
        new Promise<boolean>((r) => {
          grant = r;
        }),
    );
    const host = new ElectronAudioCapture(
      url,
      "audio.cjs",
      vi.fn(),
      undefined,
      "darwin",
    );
    const work = host.start({ ...plan, systemAudio: false }, vi.fn(), vi.fn());
    host.stop();
    grant(true);
    await expect(work).rejects.toThrow("cancelled");
    expect(native.windows).toHaveLength(0);
  });
  it("creates no capture window until an authorised operation is requested", () => {
    new ElectronAudioCapture(url, "audio.cjs", vi.fn(), undefined, "win32");
    expect(native.windows).toHaveLength(0);
  });
  it("only forwards bounded PCM with the current explicit transcription token and authorised source", async () => {
    const consume = vi.fn(() => true),
      host = new ElectronAudioCapture(
        url,
        "audio.cjs",
        vi.fn(),
        consume,
        "win32",
      );
    const starting = host.start(
      { ...plan, systemAudio: false },
      vi.fn(),
      vi.fn(),
    );
    report({ type: "diagnostics", sources: [sources[0]] });
    await starting;
    const frame = {
      source: "microphone",
      streamId: "stream-1",
      sequence: 0,
      timestamp: 1000,
      sampleRate: 16000,
      channels: 1,
      format: "f32-interleaved",
      lifecycle: "data",
      samples: new Float32Array(320),
    };
    expect(
      ipc("everyhint:audio-pcm")(workerEvent(), { token: "old", frame }),
    ).toBe(false);
    host.setTranscriptionToken("current");
    expect(
      ipc("everyhint:audio-pcm")(workerEvent(), { token: "current", frame }),
    ).toBe(true);
    expect(() =>
      ipc("everyhint:audio-pcm")(workerEvent(), {
        token: "current",
        frame: { ...frame, source: "systemAudio" },
      }),
    ).toThrow("authorised");
    host.setTranscriptionToken(null);
    expect(
      ipc("everyhint:audio-pcm")(workerEvent(), { token: "current", frame }),
    ).toBe(false);
    expect(consume).toHaveBeenCalledTimes(1);
    host.setTranscriptionToken("current");
    const stale = workerEvent();
    host.stop();
    // Late frames from the stopped worker and unrelated senders are dropped.
    expect(ipc("everyhint:audio-pcm")(stale, { token: "current", frame })).toBe(
      false,
    );
    expect(
      ipc("everyhint:audio-pcm")(
        { sender: {}, senderFrame: null },
        { token: "current", frame },
      ),
    ).toBe(false);
    expect(consume).toHaveBeenCalledTimes(1);
  });
  it("turns synchronous capture-context creation failures into rejected startup", async () => {
    const host = new ElectronAudioCapture(
      url,
      "audio.cjs",
      vi.fn(),
      undefined,
      "win32",
    );
    native.constructorFailure = true;
    await expect(host.start(plan, vi.fn(), vi.fn())).rejects.toThrow(
      "creation failed",
    );
    expect(native.windows).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("binds media access to the exact worker and denies cameras, unrelated senders and activation replay", async () => {
    const host = new ElectronAudioCapture(
        url,
        "audio.cjs",
        vi.fn(),
        undefined,
        "win32",
      ),
      starting = host.start(plan, vi.fn(), vi.fn());
    const window = native.windows[0]!,
      check = native.check.mock.lastCall![0],
      request = native.request.mock.lastCall![0];
    expect(
      check(window.webContents, "media", "", {
        mediaType: "audio",
        isMainFrame: true,
        requestingUrl: url,
      }),
    ).toBe(true);
    expect(
      check(window.webContents, "media", "", {
        mediaType: "video",
        isMainFrame: true,
        requestingUrl: url,
      }),
    ).toBe(false);
    expect(
      check({}, "media", "", { mediaType: "audio", isMainFrame: true }),
    ).toBe(false);
    const callback = vi.fn();
    request(window.webContents, "media", callback, {
      mediaTypes: ["video"],
      isMainFrame: true,
      requestingUrl: url,
    });
    expect(callback).toHaveBeenCalledWith(false);
    expect(() =>
      ipc("everyhint:audio-configuration")({
        sender: window.webContents,
        senderFrame: {},
      }),
    ).toThrow("Untrusted");
    ipc("everyhint:audio-ready")(workerEvent());
    expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(
      "window.startEveryHintAudio()",
      true,
    );
    expect(() => ipc("everyhint:audio-ready")(workerEvent())).toThrow(
      "already",
    );
    report({ type: "diagnostics", sources });
    await starting;
    host.stop();
    expect(window.destroy).toHaveBeenCalledTimes(1);
  });
  it("uses unmuted Windows loopback only for the authorised worker and denies repeat display grants", async () => {
    const host = new ElectronAudioCapture(
        url,
        "audio.cjs",
        vi.fn(),
        undefined,
        "win32",
      ),
      starting = host.start(plan, vi.fn(), vi.fn());
    native.getSources.mockResolvedValueOnce([
      { id: "screen:1:0", name: "Screen" },
    ]);
    const request = {
        frame: native.windows[0]!.webContents.mainFrame,
        audioRequested: true,
        videoRequested: true,
      },
      callback = vi.fn();
    const display = native.display.mock.lastCall![0];
    display({ ...request, frame: {} }, callback);
    expect(callback).toHaveBeenLastCalledWith(null);
    display(request, callback);
    await vi.advanceTimersByTimeAsync(0);
    // These native-window fixtures model the Windows loopback route on every OS.
    expect(callback).toHaveBeenLastCalledWith({
      video: { id: "screen:1:0", name: "Screen" },
      audio: "loopback",
    });
    display(request, callback);
    expect(callback).toHaveBeenLastCalledWith(null);
    report({ type: "diagnostics", sources });
    await starting;
    host.stop();
  });
  it("bounds startup, rejects duplicate operations and destroys resources on emergency stop or shutdown", async () => {
    const host = new ElectronAudioCapture(
      url,
      "audio.cjs",
      vi.fn(),
      undefined,
      "win32",
    );
    const pending = host.start(plan, vi.fn(), vi.fn()),
      rejection = expect(pending).rejects.toThrow("cancelled");
    await expect(host.start(plan, vi.fn(), vi.fn())).rejects.toThrow(
      "already running",
    );
    host.stop();
    host.stop();
    await rejection;
    expect(native.windows[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const failure = vi.fn(),
      next = host.start(plan, vi.fn(), failure),
      timeout = expect(next).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20000);
    await timeout;
    expect(failure).toHaveBeenCalled();
    expect(native.windows[1]!.destroy).toHaveBeenCalled();
  });
  it("enumerates metadata in a temporary context and rejects unconsented source reports", async () => {
    const host = new ElectronAudioCapture(
        url,
        "audio.cjs",
        vi.fn(),
        undefined,
        "win32",
      ),
      devices = host.listMicrophones();
    report({
      type: "devices",
      devices: [{ deviceId: "mic", label: "Headset" }],
    });
    await expect(devices).resolves.toEqual([
      { deviceId: "mic", label: "Headset" },
    ]);
    expect(native.windows[0]!.destroy).toHaveBeenCalled();
    const failure = vi.fn(),
      pending = host.start({ ...plan, systemAudio: false }, vi.fn(), failure),
      rejection = expect(pending).rejects.toThrow("not authorised");
    report({ type: "diagnostics", sources: [sources[1]] });
    await rejection;
    expect(failure).toHaveBeenCalled();
    expect(native.windows[1]!.destroy).toHaveBeenCalled();
  });
});
