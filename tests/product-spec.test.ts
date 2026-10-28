import { describe, expect, it } from "vitest";
import inventory from "../resources/feature-inventory.json";
import { DESTINATIONS, plannedDestination } from "../src/shared/navigation";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("product specification coverage", () => {
  it("tracks exactly the 103 ordered requirements with all evidence and acceptance fields", () => {
    expect(inventory.features).toHaveLength(103);
    for (const [index, feature] of inventory.features.entries()) {
      expect(feature.id).toBe(`EH-${String(index + 1).padStart(3, "0")}`);
      for (const field of [
        "name",
        "description",
        "workflow",
        "milestone",
        "status",
        "dependencies",
        "acceptance",
        "automated",
        "manual",
        "reference",
        "referenceState",
      ] as const)
        expect(feature[field].trim().length).toBeGreaterThan(0);
      expect(feature.status).not.toBe("COMPLETE");
    }
    execFileSync(process.execPath, [
      "scripts/build-feature-matrix.mjs",
      "--check",
    ]);
  });
  it("maps named actions into the inventory without adding false completion rows", () => {
    const matrix = readFileSync("docs/FEATURE_MATRIX.md", "utf8");
    for (const action of [
      "Get Answer",
      "What Should I Say Next?",
      "Suggest Follow-up Questions",
      "Fact Check",
      "Who Am I Talking To?",
      "Recap",
      "Dynamic Action",
      "Clear Context",
      "Copy Response",
    ])
      expect(matrix).toContain(`| ${action} |`);
    for (const match of matrix.matchAll(/EH-(\d{3})/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(1);
      expect(Number(match[1])).toBeLessThanOrEqual(103);
    }
    expect(matrix).toContain("BLOCKED");
    expect(matrix).toContain("HISTORICAL");
    expect(matrix).toContain("ENTERPRISE-ONLY");
  });
  it("keeps planned dashboard destinations distinct from working operations", () => {
    expect(DESTINATIONS.map((item) => item.label)).toEqual([
      "Home",
      "Assistant",
      "Meetings",
      "Knowledge",
      "Calendar",
      "People",
      "Modes",
      "Settings",
    ]);
    expect(
      DESTINATIONS.filter((item) => !plannedDestination(item.id)).map(
        (item) => item.id,
      ),
    ).toEqual([
      "home",
      "assistant",
      "meetings",
      "knowledge",
      "calendar",
      "people",
      "modes",
      "settings",
    ]);
  });
});
