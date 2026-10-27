import { BrowserWindow, desktopCapturer, systemPreferences } from "electron";
import type { CaptureSource, ScreenFrame } from "../shared/contracts";
import type { ScreenCaptureBackend } from "./capture";

export function isOwnSource(id: string, ownIds: string[]): boolean {
  const windowKey = (value: string): string =>
    value.split(":").slice(0, 2).join(":");
  return (
    /^window:\d+:1$/.test(id) ||
    ownIds.some((own) => windowKey(own) === windowKey(id))
  );
}

export class ElectronScreenCapture implements ScreenCaptureBackend {
  private allowed(id: string): boolean {
    return !isOwnSource(
      id,
      BrowserWindow.getAllWindows().map((window) => window.getMediaSourceId()),
    );
  }
  private checkPermission(): void {
    if (
      process.platform === "darwin" &&
      systemPreferences.getMediaAccessStatus("screen") !== "granted"
    ) {
      throw new Error(
        "Screen recording permission is required in system settings. Restart EveryHint after granting it.",
      );
    }
  }
  async listSources(): Promise<CaptureSource[]> {
    this.checkPermission();
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return sources
      .filter((source) => this.allowed(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("screen:") ? "screen" : "window",
      }));
  }
  async capture(source: CaptureSource): Promise<ScreenFrame> {
    this.checkPermission();
    if (!this.allowed(source.id))
      throw new Error("EveryHint cannot capture its own windows.");
    const sources = await desktopCapturer.getSources({
      types: [source.kind],
      thumbnailSize: { width: 960, height: 540 },
      fetchWindowIcons: false,
    });
    const selected = sources.find((candidate) => candidate.id === source.id);
    if (!selected)
      throw new Error(
        "The selected source is no longer available. Stop and choose another screen or window.",
      );
    if (selected.thumbnail.isEmpty())
      throw new Error(
        "No frame is available. Restore the selected window or check screen capture permissions.",
      );
    const size = selected.thumbnail.getSize();
    return {
      dataUrl: `data:image/jpeg;base64,${selected.thumbnail.toJPEG(75).toString("base64")}`,
      width: size.width,
      height: size.height,
      capturedAt: Date.now(),
    };
  }
}
