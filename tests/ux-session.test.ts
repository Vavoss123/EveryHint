import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionControls } from "../src/renderer/src/SessionControls";
import type { SessionState } from "../src/shared/contracts";
import { DEFAULT_SETTINGS, parseSettings } from "../src/shared/validation";

describe("UX session and preference boundaries", () => {
  it.each(["IDLE", "STOPPED", "ERROR"] as SessionState[])(
    "offers Start and no Pause or Stop in %s",
    (state) => {
      const html = renderToStaticMarkup(
        createElement(SessionControls, {
          state,
          action: vi.fn(),
          start: vi.fn(),
        }),
      );
      expect(html).toContain("Start EveryHint");
      expect(html).not.toMatch(/>Pause<|>Stop<|>Resume</);
    },
  );
  it.each([
    ["ACTIVE", "Pause"],
    ["PAUSED", "Resume"],
    ["READY", "Start EveryHint"],
  ] as const)("uses capture state %s", (state, label) => {
    const html = renderToStaticMarkup(
      createElement(SessionControls, { state, action: vi.fn() }),
    );
    expect(html).toContain(`>${label}</button>`);
    if (state === "READY") {
      expect(html).toContain(">Cancel setup</button>");
      expect(html).not.toContain(">Stop</button>");
    } else expect(html).toContain(">Stop</button>");
  });
  it("defaults to a dark dashboard with overlay pinning off", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: "dark",
      layout: "dashboard",
      alwaysOnTop: false,
    });
  });
  it("stores source choices without storing capture or remote permission", () => {
    const value = parseSettings({
      ...DEFAULT_SETTINGS,
      setupComplete: true,
      preferredHelp: "live",
      preferredSources: { microphone: true, screen: false, systemAudio: true },
    });
    expect(value).toMatchObject({ setupComplete: true, preferredHelp: "live" });
    expect(value).not.toHaveProperty("consent");
    expect(value).not.toHaveProperty("live");
  });
  it("rejects a conflicting overlay shortcut", () => {
    expect(() =>
      parseSettings({
        ...DEFAULT_SETTINGS,
        toggleShortcut: DEFAULT_SETTINGS.assistShortcut,
      }),
    ).toThrow(/different/);
  });
});
