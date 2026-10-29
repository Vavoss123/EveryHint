import { useState, type ReactNode } from "react";
import type { AppSnapshot, Settings } from "../../shared/contracts";
import type { MeetingState } from "../../shared/meetings";
import type { IntelligenceSnapshot } from "../../shared/intelligence";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import { AccountPanel } from "./AccountPanel";
import { ProviderSettings } from "./ProviderSettings";
import { PersonalSettings, TemplateEditor } from "./PersonalPages";
import { WorkspaceSettings } from "./WorkspacePages";
import { IntelligenceSettingsPanel } from "./IntelligencePanel";
import { TranscriptionPanel } from "./TranscriptionPanel";
import { DesktopPrivacy } from "./DesktopPrivacy";
import { ShortcutSettings } from "./ShortcutSettings";
import { MeetingPreferencesPanel } from "./MeetingSessionControls";
import { HistoryDataControls } from "./HistoryDataControls";
import { SpeechControl } from "./SpeechControl";

export const SETTINGS_SECTIONS = [
  "General",
  "Audio & Screen",
  "Shortcuts",
  "Privacy & Data",
  "Account & AI",
  "Advanced",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export function SettingsPage({
  app,
  save,
  meetings,
  intelligence,
  initial = "General",
  diagnostics,
  chooseSources,
}: {
  app: AppSnapshot;
  save: (patch: Partial<Settings>) => void;
  meetings: MeetingState | null;
  intelligence: IntelligenceSnapshot | null;
  initial?: SettingsSection;
  diagnostics: ReactNode;
  chooseSources: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initial);
  const settings = app.settings;
  const audioReady =
    app.session.state === "ACTIVE" &&
    [app.session.sources.microphone, app.session.sources.systemAudio].some(
      (source) => source.state === "CAPTURING",
    );
  const limits = settings.contextLimits ?? DEFAULT_CONTEXT;
  return (
    <section
      className="settings-page panel-stack"
      aria-label="EveryHint settings"
    >
      <h1>Settings</h1>
      <nav className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((name) => (
          <button
            key={name}
            aria-current={section === name ? "page" : undefined}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="settings-section panel-stack">
        <h2>{section}</h2>
        {section === "General" && (
          <>
            <label className="setting-row">
              <span>Theme</span>
              <select
                aria-label="Colour theme"
                value={settings.theme ?? "dark"}
                onChange={(e) =>
                  save({ theme: e.target.value as Settings["theme"] })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="setting-row">
              <span>When EveryHint opens</span>
              <select
                aria-label="Startup behaviour"
                value={settings.startHidden ? "tray" : "dashboard"}
                onChange={(e) =>
                  save({ startHidden: e.target.value === "tray" })
                }
              >
                <option value="dashboard">Show dashboard</option>
                <option value="tray">Stay in tray</option>
              </select>
            </label>
            <small>
              Startup never restores capture or remote-sharing permission.
            </small>
            <PersonalSettings />
          </>
        )}
        {section === "Audio & Screen" && (
          <>
            <p className="muted">
              Choose sources each time you start. Device tests use the same
              capture consent.
            </p>
            {(["microphone", "systemAudio", "screen"] as const).map((id) => (
              <div className="setting-row" key={id}>
                <span>
                  {id === "microphone"
                    ? "Microphone"
                    : id === "systemAudio"
                      ? "System audio"
                      : "Screen"}
                  <small>
                    {app.session.sources[id].name || "Choose at session start"}
                  </small>
                </span>
                <span>{app.session.sources[id].state.toLowerCase()}</span>
              </div>
            ))}
            <button className="secondary" onClick={chooseSources}>
              Choose sources / test devices
            </button>
            <SpeechControl capture={app.session} />
            <TranscriptionPanel settings canEnable={audioReady} />
          </>
        )}
        {section === "Shortcuts" && (
          <>
            <ShortcutSettings settings={settings} save={save} />
            {app.hotkeys.map((h) => (
              <div className="shortcut" key={h.action}>
                <span>
                  {
                    {
                      toggle: "Show / hide overlay",
                      assist: "Ask EveryHint",
                      pause: "Pause / resume",
                      stop: "Stop session",
                      clear: "Clear conversation",
                    }[h.action]
                  }
                  {!h.registered && (
                    <small className="unavailable">
                      Unavailable · use the tray
                    </small>
                  )}
                </span>
                <kbd>
                  {h.accelerator
                    .replace("Control", "Ctrl")
                    .replaceAll("+", " + ")}
                </kbd>
              </div>
            ))}
            <fieldset>
              <legend>Move floating overlay</legend>
              <p className="muted">
                Drag its title bar, or move it with these keyboard-accessible
                buttons.
              </p>
              <div className="button-row">
                {(["left", "right", "up", "down"] as const).map((direction) => (
                  <button
                    key={direction}
                    onClick={() =>
                      void window.everyhint.window(`move-${direction}`)
                    }
                  >
                    Move {direction}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {section === "Privacy & Data" && (
          <>
            <DesktopPrivacy app={app} save={save} />
            {meetings && (
              <>
                <MeetingPreferencesPanel
                  key={meetings.scopeId}
                  state={meetings}
                />
                <HistoryDataControls key={meetings.scopeId} state={meetings} />
              </>
            )}
            <details>
              <summary>Remote sharing and local context</summary>
              <WorkspaceSettings />
            </details>
            <p className="muted">
              Capture approval, local saving and AI sharing are separate. Live
              assistance always needs a fresh, time-limited sharing grant.
            </p>
          </>
        )}
        {section === "Account & AI" && <AccountPanel />}
        {section === "Advanced" && (
          <>
            <DesktopPrivacy app={app} save={save} updatesOnly />
            <ProviderSettings />
            <details>
              <summary>Detection and Live assistance limits</summary>
              <IntelligenceSettingsPanel
                snapshot={intelligence}
                capture={app.session}
              />
            </details>
            <details>
              <summary>Context limits</summary>
              <div className="panel-stack">
                {(
                  [
                    ["recentSeconds", "Recent transcript (seconds)", 10, 600],
                    ["transcriptChars", "Transcript characters", 100, 12000],
                    ["totalChars", "Total text characters", 1000, 40000],
                    ["imageBytes", "Maximum image bytes", 50000, 4000000],
                  ] as const
                ).map(([id, title, min, max]) => (
                  <label key={id}>
                    {title}
                    <input
                      aria-label={title}
                      type="number"
                      min={min}
                      max={max}
                      defaultValue={limits[id]}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== limits[id])
                          save({
                            contextLimits: {
                              recentSeconds: limits.recentSeconds,
                              transcriptChars: limits.transcriptChars,
                              totalChars: limits.totalChars,
                              imageBytes: limits.imageBytes,
                              [id]: Number(e.target.value),
                            },
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
            </details>
            <label className="setting-row">
              <span>
                Snapshot interval<small>Applies on start or resume</small>
              </span>
              <select
                aria-label="Snapshot interval"
                value={settings.captureIntervalMs}
                onChange={(e) =>
                  save({ captureIntervalMs: Number(e.target.value) })
                }
              >
                {[1000, 3000, 5000, 10000, 30000].map((v) => (
                  <option key={v} value={v}>
                    {v / 1000}s
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>Pin floating assistant on top</span>
              <input
                type="checkbox"
                checked={settings.alwaysOnTop}
                onChange={(e) => save({ alwaysOnTop: e.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span>Overlay opacity</span>
              <input
                aria-label="Window opacity"
                type="range"
                min="80"
                max="100"
                step="5"
                value={Math.round((settings.opacity ?? 1) * 100)}
                onChange={(e) =>
                  save({ opacity: Number(e.target.value) / 100 })
                }
              />
            </label>
            <details>
              <summary>Capture diagnostics and transcription logs</summary>
              {diagnostics}
              <TranscriptionPanel canEnable={audioReady} />
            </details>
            <details>
              <summary>Note templates</summary>
              <TemplateEditor />
            </details>
            <details>
              <summary>Calendar and contacts connections</summary>
              <WorkspaceSettings />
            </details>
          </>
        )}
      </div>
    </section>
  );
}
