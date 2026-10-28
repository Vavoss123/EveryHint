import { nativeImage } from "electron";
import type { ScreenFrame } from "../../shared/contracts";
import { intensity } from "./screen";

export function sampleScreen(frame: ScreenFrame): Uint8Array {
  const image = nativeImage.createFromDataURL(frame.dataUrl);
  if (image.isEmpty()) throw new Error("No local screen sample.");
  return intensity(
    image.resize({ width: 32, height: 18, quality: "good" }).toBitmap(),
  );
}
