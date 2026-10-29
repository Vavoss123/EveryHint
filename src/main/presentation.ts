import type { Settings, WindowBounds } from "../shared/contracts";

export type Presentation = "compact" | "assistant" | "dashboard";
export function floatingBounds(
  area: WindowBounds,
  remembered?: WindowBounds,
): WindowBounds {
  const width = Math.min(
    area.width,
    Math.max(360, Math.min(800, remembered?.width ?? 480)),
  );
  const height = Math.min(
    area.height,
    Math.max(320, Math.min(800, remembered?.height ?? 580)),
  );
  return {
    width,
    height,
    x: Math.max(
      area.x,
      Math.min(
        remembered?.x ?? area.x + area.width - width - 32,
        area.x + area.width - width,
      ),
    ),
    y: Math.max(
      area.y,
      Math.min(remembered?.y ?? area.y + 48, area.y + area.height - height),
    ),
  };
}
export const presentation = (settings: Settings): Presentation =>
  settings.compact ? "compact" : (settings.layout ?? "assistant");
export function presentationBounds(
  mode: Presentation,
  current: WindowBounds,
  area: WindowBounds,
  remembered?: { width: number; height: number },
): WindowBounds {
  const size =
    remembered ??
    (mode === "compact"
      ? { width: Math.min(current.width, 560), height: 190 }
      : mode === "dashboard"
        ? { width: 1040, height: 760 }
        : { width: 540, height: 720 });
  const width = Math.min(Math.max(360, size.width), area.width, 2000);
  const height = Math.min(
    Math.max(mode === "compact" ? 180 : 380, size.height),
    area.height,
    2000,
  );
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(current.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(current.y, area.y + area.height - height)),
  };
}
