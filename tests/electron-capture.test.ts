import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ElectronScreenCapture,
  isOwnSource,
} from "../src/main/electron-capture";
import { source } from "./helpers";

const native = vi.hoisted(() => ({
  getSources: vi.fn(),
  getAllWindows: vi.fn(() => [{ getMediaSourceId: () => "window:50:1" }]),
}));
vi.mock("electron", () => ({
  desktopCapturer: { getSources: native.getSources },
  BrowserWindow: { getAllWindows: native.getAllWindows },
  systemPreferences: { getMediaAccessStatus: () => "granted" },
}));

describe("Electron native snapshot adapter", () => {
  beforeEach(() => vi.clearAllMocks());
  const thumbnail = () => ({
    isEmpty: () => false,
    getSize: () => ({ width: 960, height: 540 }),
    toJPEG: () => Buffer.from("frame"),
  });
  it("excludes every EveryHint-owned window, including process ID variants", () => {
    expect(isOwnSource("window:50:0", ["window:50:1"])).toBe(true);
    expect(isOwnSource("window:99:1", [])).toBe(true);
    expect(isOwnSource("window:51:0", ["window:50:1"])).toBe(false);
    expect(isOwnSource("screen:50:0", ["window:50:1"])).toBe(false);
  });
  it("enumerates metadata without requesting thumbnails", async () => {
    native.getSources.mockResolvedValue([
      { id: "screen:1:0", name: "Screen 1" },
      { id: "window:50:0", name: "EveryHint" },
      { id: "window:70:0", name: "Editor" },
    ]);
    const sources = await new ElectronScreenCapture().listSources();
    expect(sources.map((item) => item.name)).toEqual(["Screen 1", "Editor"]);
    expect(native.getSources).toHaveBeenCalledWith({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
  });
  it("returns only the explicitly selected source image in memory", async () => {
    const image = thumbnail();
    native.getSources.mockResolvedValue([{ id: source.id, thumbnail: image }]);
    const result = await new ElectronScreenCapture().capture(source);
    expect(result.width).toBe(960);
    expect(result.dataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from("frame").toString("base64")}`,
    );
    expect(native.getSources).toHaveBeenCalledWith({
      types: ["screen"],
      thumbnailSize: { width: 1600, height: 900 },
      fetchWindowIcons: false,
    });
  });
  it("rejects disappeared sources", async () => {
    native.getSources.mockResolvedValue([]);
    await expect(new ElectronScreenCapture().capture(source)).rejects.toThrow(
      "no longer available",
    );
  });
  it("fits oversized native thumbnails into the request resolution bound", async () => {
    const resized = {
      ...thumbnail(),
      getSize: () => ({ width: 1600, height: 900 }),
    };
    const resize = vi.fn(() => resized);
    native.getSources.mockResolvedValue([
      {
        id: source.id,
        thumbnail: {
          ...thumbnail(),
          getSize: () => ({ width: 3840, height: 2160 }),
          resize,
        },
      },
    ]);
    const result = await new ElectronScreenCapture().capture(source);
    expect(resize).toHaveBeenCalledWith({
      width: 1600,
      height: 900,
      quality: "best",
    });
    expect([result.width, result.height]).toEqual([1600, 900]);
  });
  it("reports blank/minimised sources", async () => {
    native.getSources.mockResolvedValue([
      { id: source.id, thumbnail: { isEmpty: () => true } },
    ]);
    await expect(new ElectronScreenCapture().capture(source)).rejects.toThrow(
      "No frame",
    );
  });
  it("rejects own-window capture even if called without the source picker", async () => {
    await expect(
      new ElectronScreenCapture().capture({
        id: "window:50:0",
        kind: "window",
        name: "EveryHint",
      }),
    ).rejects.toThrow("own windows");
    expect(native.getSources).not.toHaveBeenCalled();
  });
  it("propagates native permission failures", async () => {
    native.getSources.mockRejectedValue(new Error("OS denied capture"));
    await expect(new ElectronScreenCapture().capture(source)).rejects.toThrow(
      "OS denied",
    );
  });
});
