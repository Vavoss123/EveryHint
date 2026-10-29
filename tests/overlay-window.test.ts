import { describe, expect, it } from "vitest";
import { floatingBounds } from "../src/main/presentation";

describe("floating assistant geometry", () => {
  it.each([
    { x: 0, y: 0, width: 1280, height: 752 },
    { x: -1920, y: 0, width: 1920, height: 1040 },
    { x: 100, y: 80, width: 640, height: 480 },
  ])(
    "clamps initial and oversized restored geometry to the usable display %j",
    (area) => {
      for (const remembered of [
        undefined,
        { x: -5000, y: 10000, width: 2000, height: 2000 },
      ]) {
        const result = floatingBounds(area, remembered);
        expect(result.x).toBeGreaterThanOrEqual(area.x);
        expect(result.y).toBeGreaterThanOrEqual(area.y);
        expect(result.x + result.width).toBeLessThanOrEqual(
          area.x + area.width,
        );
        expect(result.y + result.height).toBeLessThanOrEqual(
          area.y + area.height,
        );
        expect(result.width).toBeLessThanOrEqual(800);
        expect(result.height).toBeLessThanOrEqual(800);
      }
    },
  );
  it("retains a valid user position and size without adding a taskbar-sized layout", () => {
    const remembered = { x: 60, y: 80, width: 440, height: 500 };
    expect(
      floatingBounds({ x: 0, y: 0, width: 1280, height: 752 }, remembered),
    ).toEqual(remembered);
  });
});
