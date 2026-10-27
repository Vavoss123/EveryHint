import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AppSnapshot,
  CaptureSource,
  Consent,
  Result,
  SessionAction,
  Settings,
  MicrophoneDevice,
} from "../../shared/contracts";
import "./styles.css";
import { TranscriptionPanel } from "./TranscriptionPanel";

function Icon({
  name,
}: {
  name:
    "settings" | "close" | "expand" | "spark" | "screen" | "back" | "compact";
}) {
  const paths = {
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z",
    close: "m6 6 12 12M6 18 18 6",
    expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    spark: "m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z",
    screen: "M4 4h16v12H4V4Zm4 16h8m-4-4v4",
    back: "m14 5-7 7 7 7",
    compact: "M3 5h18v14H3V5Zm0 5h18",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function App() {
  const [app, setApp] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [screenConsent, setScreenConsent] = useState(false);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [systemConsent, setSystemConsent] = useState(false);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("default");
  const [acknowledged, setAcknowledged] = useState(false);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState("");

  const accept = useCallback(
    (next: AppSnapshot) =>
      setApp((previous) =>
        !previous || next.revision >= previous.revision ? next : previous,
      ),
    [],
  );
  useEffect(() => {
    const off = window.everyhint.onSnapshot(accept);
    window.everyhint
      .getSnapshot()
      .then((result) => accept(unwrap(result)))
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "EveryHint could not connect.",
        ),
      );
    return off;
  }, [accept]);
  useEffect(
    () =>
      window.everyhint.onAudioMeters((event) => {
        setApp((previous) =>
          previous &&
          previous.session.state === "ACTIVE" &&
          previous.session.epoch === event.epoch
            ? {
                ...previous,
                session: {
                  ...previous.session,
                  sources: { ...previous.session.sources, ...event.sources },
                },
              }
            : previous,
        );
      }),
    [],
  );
  useEffect(() => {
    if (app?.session.state === "STOPPED" || app?.session.state === "ERROR") {
      setScreenConsent(false);
      setMicrophoneConsent(false);
      setSystemConsent(false);
      setMicrophones([]);
      setMicrophoneDeviceId("default");
      setAcknowledged(false);
      setSources([]);
      setSourceId("");
      setPreparing(false);
    }
  }, [app?.session.state]);

  async function run(task: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "An unexpected error occurred.",
      );
    } finally {
      setBusy(false);
    }
  }
  const action = (value: SessionAction): void => {
    void run(async () => unwrap(await window.everyhint.session(value)));
  };
  const save = (patch: Partial<Settings>): void => {
    if (app)
      void run(async () =>
        unwrap(
          await window.everyhint.saveSettings({ ...app.settings, ...patch }),
        ),
      );
  };
  function consent(): Consent {
    if (
      (!screenConsent && !microphoneConsent && !systemConsent) ||
      !acknowledged
    )
      throw new Error(
        "Select capture sources and confirm your authorisation first.",
      );
    return {
      screen: screenConsent,
      microphone: microphoneConsent,
      systemAudio: systemConsent,
      acknowledged: true,
    };
  }
  function chooseSources(): void {
    void run(async () => {
      const found = unwrap(await window.everyhint.listSources(consent()));
      setSources(found);
      setSourceId("");
      if (!found.length)
        throw new Error(
          "No sources found. Open a window or check your screen capture permissions.",
        );
    });
  }
  function prepare(): void {
    void run(async () => {
      unwrap(
        await window.everyhint.prepare({
          ...(screenConsent ? { sourceId } : {}),
          ...(microphoneConsent ? { microphoneDeviceId } : {}),
          consent: consent(),
        }),
      );
      setPreparing(false);
    });
  }
  function refreshMicrophones(): void {
    void run(async () => {
      const devices = unwrap(await window.everyhint.listMicrophones(consent()));
      setMicrophones(devices);
      if (
        microphoneDeviceId !== "default" &&
        !devices.some((device) => device.deviceId === microphoneDeviceId)
      )
        setMicrophoneDeviceId("default");
    });
  }
  if (!app)
    return (
      <main className="loading">
        <div className="brand-mark">
          e<span>h</span>
        </div>
        <h1>EveryHint</h1>
        <p>{error ?? "Opening your workspace…"}</p>
      </main>
    );

  const { session, settings } = app;
  const active = session.state === "ACTIVE";
  const resumable = session.state === "PAUSED";
  const ready = session.state === "READY";
  const status = active
    ? Object.entries(session.sources)
        .filter(([, source]) =>
          ["CAPTURING", "STARTING"].includes(source.state),
        )
        .map(
          ([id, source]) =>
            `${id === "systemAudio" ? "System" : id === "microphone" ? "Mic" : "Screen"} ${source.state === "STARTING" ? "starting" : "on"}`,
        )
        .join(" · ")
    : resumable
      ? "Paused · capture off"
      : ready
        ? "Ready · capture off"
        : session.state === "ERROR"
          ? "Capture error"
          : "Capture off";
  const showFrame =
    active && !!session.frame && session.source?.kind === "window";

  return (
    <main className={`app ${settings.compact ? "is-compact" : ""}`}>
      <header className="titlebar">
        <div className="brand">
          <div className="brand-mark">
            e<span>h</span>
          </div>
          <span>EveryHint</span>
          <span className="phase">P3</span>
        </div>
        <div className="window-actions">
          <button
            className="icon-button"
            title={settings.compact ? "Expand EveryHint" : "Compact mode"}
            aria-label={settings.compact ? "Expand EveryHint" : "Compact mode"}
            onClick={() => save({ compact: !settings.compact })}
          >
            <Icon name="compact" />
          </button>
          <button
            className={`icon-button ${settingsOpen ? "selected" : ""}`}
            aria-label="EveryHint settings"
            title="Settings"
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setPreparing(false);
              if (settings.compact) save({ compact: false });
            }}
          >
            <Icon name="settings" />
          </button>
          <button
            className="icon-button"
            aria-label="Hide EveryHint to tray"
            title="Hide to tray · capture continues while active"
            onClick={() => {
              void run(async () =>
                unwrap(await window.everyhint.window("hide")),
              );
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div
        className={`capture-status state-${session.state.toLowerCase()}`}
        role="status"
      >
        <span className="status-dot" />
        <span>{status}</span>
        <span className="status-detail">
          {active ? "ACTIVE MODE" : "LOCAL ONLY"}
        </span>
      </div>

      <section className="content">
        {(error || session.error) && (
          <div className="error" role="alert">
            {error ?? session.error}
            {error && (
              <button aria-label="Dismiss error" onClick={() => setError(null)}>
                ×
              </button>
            )}
          </div>
        )}
        {app.warnings.map((warning) => (
          <p key={warning} className="warning" role="alert">
            {warning}
          </p>
        ))}
        {settingsOpen ? (
          <div className="settings panel-stack">
            <div className="section-heading">
              <h1>EveryHint settings</h1>
              <span className="eyebrow">DESKTOP</span>
            </div>
            <label className="setting-row">
              <span>
                Always on top<small>Keep EveryHint above other windows</small>
              </span>
              <input
                type="checkbox"
                checked={settings.alwaysOnTop}
                onChange={(event) =>
                  save({ alwaysOnTop: event.target.checked })
                }
                disabled={busy}
              />
            </label>
            <label className="setting-row">
              <span>
                Compact mode<small>A smaller view with capture controls</small>
              </span>
              <input
                type="checkbox"
                checked={settings.compact}
                onChange={(event) => {
                  save({ compact: event.target.checked });
                  setSettingsOpen(false);
                }}
                disabled={busy}
              />
            </label>
            <label className="setting-row">
              <span>
                Snapshot interval
                <small>Applies on the next start or resume</small>
              </span>
              <select
                aria-label="Snapshot interval"
                value={settings.captureIntervalMs}
                onChange={(event) =>
                  save({ captureIntervalMs: Number(event.target.value) })
                }
                disabled={busy}
              >
                {[1000, 3000, 5000, 10000, 30000].map((value) => (
                  <option key={value} value={value}>
                    {value / 1000}s
                  </option>
                ))}
              </select>
            </label>
            <h2>Global shortcuts</h2>
            <TranscriptionPanel settings canEnable={active} />
            {app.hotkeys.map((hotkey) => (
              <div className="shortcut" key={hotkey.action}>
                <span>
                  {hotkey.action === "toggle"
                    ? "Show / hide"
                    : hotkey.action === "pause"
                      ? "Pause / resume"
                      : "Stop all capture"}
                  {!hotkey.registered && (
                    <small className="unavailable">Unavailable</small>
                  )}
                </span>
                <kbd>
                  {hotkey.accelerator
                    .replace("Control", "Ctrl")
                    .replaceAll("+", " + ")}
                </kbd>
              </div>
            ))}
            <p className="muted">
              Shortcut customisation is planned. Pause/resume only affects an
              authorised session.
            </p>
            <h2>Privacy by default</h2>
            <p className="muted">
              Screenshots stay in memory on this device. Stop clears the preview
              and session consent. Closing the overlay hides it to the tray;
              capture continues while Active Mode is on.
            </p>
            <p className="muted">
              Microphone, Windows audio and speech transcription stay local.
              Codex and Claude arrive in P4.
            </p>
            <button
              className="secondary full"
              onClick={() => {
                void run(async () =>
                  unwrap(await window.everyhint.window("quit")),
                );
              }}
            >
              Quit EveryHint
            </button>
          </div>
        ) : preparing ? (
          <div className="panel-stack">
            <div className="section-heading">
              <button
                className="icon-button"
                aria-label="Back"
                onClick={() => setPreparing(false)}
              >
                <Icon name="back" />
              </button>
              <h1>Prepare a session</h1>
            </div>
            <p className="muted">
              Choose what EveryHint can see and hear. Nothing is captured until
              you press Start capture.
            </p>
            <label className="consent-row">
              <input
                type="checkbox"
                checked={screenConsent}
                onChange={(event) => {
                  setScreenConsent(event.target.checked);
                  setSources([]);
                  setSourceId("");
                }}
              />
              <Icon name="screen" />
              <span>
                Screen or application window<small>Local snapshots only</small>
              </span>
            </label>
            <label className="consent-row">
              <input
                type="checkbox"
                checked={microphoneConsent}
                onChange={(event) => {
                  setMicrophoneConsent(event.target.checked);
                  setMicrophones([]);
                  setMicrophoneDeviceId("default");
                }}
              />
              <span>
                Microphone<small>Selected input · local audio levels</small>
              </span>
            </label>
            <label
              className={`consent-row ${app.systemAudioSupported ? "" : "disabled"}`}
            >
              <input
                type="checkbox"
                checked={systemConsent}
                disabled={!app.systemAudioSupported}
                onChange={(event) => setSystemConsent(event.target.checked)}
              />
              <span>
                System audio
                <small>
                  {app.systemAudioSupported
                    ? "Windows playback · speakers stay on"
                    : "Available on Windows only"}
                </small>
              </span>
            </label>
            <label className="acknowledgement">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                I authorise the selected capture sources and have any required
                participant consent. I will follow meeting and application
                rules.
              </span>
            </label>
            {systemConsent && (
              <p className="warning">
                System audio can include other people's voices and unrelated
                applications. Windows loopback briefly requires a display track;
                EveryHint releases it immediately without analysing its images.
              </p>
            )}
            {microphoneConsent && (
              <>
                <label className="source-label" htmlFor="microphone">
                  Microphone device
                </label>
                <select
                  id="microphone"
                  value={microphoneDeviceId}
                  onChange={(event) =>
                    setMicrophoneDeviceId(event.target.value)
                  }
                >
                  <option value="default">Windows default microphone</option>
                  {microphones
                    .filter((device) => device.deviceId !== "default")
                    .map((device) => (
                      <option value={device.deviceId} key={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                </select>
                <button
                  className="secondary full"
                  disabled={!acknowledged || busy}
                  onClick={refreshMicrophones}
                >
                  Refresh microphones
                </button>
              </>
            )}
            {screenConsent && (
              <>
                <button
                  className="secondary full"
                  disabled={!screenConsent || !acknowledged || busy}
                  onClick={chooseSources}
                >
                  {busy
                    ? "Working…"
                    : sources.length
                      ? "Refresh sources"
                      : "Choose a screen or window"}
                </button>
                {sources.length > 0 && (
                  <>
                    <label className="source-label" htmlFor="source">
                      Capture source
                    </label>
                    <select
                      id="source"
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                    >
                      <option value="">Select a source…</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.kind === "screen" ? "Screen" : "Window"} ·{" "}
                          {source.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
            <button
              className="primary full"
              disabled={
                (!screenConsent && !microphoneConsent && !systemConsent) ||
                (screenConsent && !sourceId) ||
                !acknowledged ||
                busy
              }
              onClick={prepare}
            >
              Prepare selected sources
            </button>
          </div>
        ) : (
          <>
            <TranscriptionPanel
              compact={settings.compact}
              canEnable={
                active &&
                Object.entries(session.sources).some(
                  ([id, source]) =>
                    id !== "screen" && source.state === "CAPTURING",
                )
              }
            />
            {!settings.compact && (
              <div className={`response-panel ${expanded ? "expanded" : ""}`}>
                <div className="response-heading">
                  <span className="eyebrow">YOUR ASSISTANT</span>
                  <button
                    className="icon-button"
                    aria-label={
                      expanded
                        ? "Collapse response panel"
                        : "Expand response panel"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    <Icon name="expand" />
                  </button>
                </div>
                {expanded && (
                  <div className="empty-response">
                    <div className="spark">
                      <Icon name="spark" />
                    </div>
                    <h1>Intelligence when you need it.</h1>
                    <p>
                      Your desktop foundation is ready.
                      <br />
                      AI responses are coming in P4.
                    </p>
                    <span className="local-badge">
                      On your device. In your control.
                    </span>
                  </div>
                )}
              </div>
            )}
            {session.source && (
              <div className="source-summary">
                <Icon name="screen" />
                <span title={session.source.name}>{session.source.name}</span>
                <small>{session.state}</small>
              </div>
            )}
            {!settings.compact && (
              <>
                <div className="provider-row">
                  <span>AI provider</span>
                  <select aria-label="AI provider" disabled>
                    <option>Codex / Claude · Coming in P4</option>
                    <option>Claude · Coming in P4</option>
                    <option>Automatic · Coming in P4</option>
                  </select>
                </div>
                <details className="diagnostics">
                  <summary>
                    Capture diagnostics{" "}
                    <span>{session.frameCount} local frames</span>
                  </summary>
                  <p className="muted">
                    {session.source?.kind === "screen"
                      ? "Whole-screen previews stay hidden to prevent recursive screenshots. Pause and Stop clear all screenshots. Use an application window for a live preview."
                      : "Selected application windows can be previewed while capturing. EveryHint windows are excluded."}
                  </p>
                  {showFrame && session.frame ? (
                    <figure>
                      <img
                        src={session.frame.dataUrl}
                        alt="Latest local screenshot of the selected source"
                      />
                      <figcaption>
                        {session.frame.width} × {session.frame.height} ·{" "}
                        {new Date(
                          session.frame.capturedAt,
                        ).toLocaleTimeString()}
                      </figcaption>
                    </figure>
                  ) : (
                    <div className="preview-placeholder">
                      {active && !session.frame
                        ? "Waiting for the first snapshot…"
                        : active
                          ? "Whole-screen preview hidden"
                          : "No screenshot to display"}
                    </div>
                  )}
                </details>
                <div
                  className="audio-diagnostics"
                  aria-label="Live audio diagnostics"
                >
                  <div className="section-heading">
                    <h2>Live audio</h2>
                    <span className="eyebrow">LOCAL ONLY</span>
                  </div>
                  {(["microphone", "systemAudio"] as const).map((id) => {
                    const source = session.sources[id];
                    const level =
                      source.state === "CAPTURING" && !source.muted
                        ? source.level
                        : 0;
                    return (
                      <div className="audio-source" key={id}>
                        <div className="audio-heading">
                          <strong>
                            {id === "microphone"
                              ? "Microphone"
                              : "System audio"}
                          </strong>
                          <span>
                            {source.state.toLowerCase()}
                            {source.muted
                              ? " · muted"
                              : source.state === "CAPTURING" && level < 0.001
                                ? " · silent"
                                : ""}
                          </span>
                        </div>
                        <p title={source.name}>
                          {source.name}
                          {source.deviceId && (
                            <small>Device: {source.deviceId}</small>
                          )}
                        </p>
                        <meter
                          aria-label={`${id === "microphone" ? "Microphone" : "System audio"} level`}
                          min={0}
                          max={1}
                          value={level}
                        />
                        {source.error && (
                          <p className="error">{source.error}</p>
                        )}
                        {id === "microphone" &&
                          source.state === "CAPTURING" && (
                            <button
                              className="secondary"
                              onClick={() => {
                                void run(async () =>
                                  unwrap(
                                    await window.everyhint.setMicrophoneMuted(
                                      !source.muted,
                                    ),
                                  ),
                                );
                              }}
                            >
                              {source.muted
                                ? "Unmute microphone"
                                : "Mute microphone"}
                            </button>
                          )}
                      </div>
                    );
                  })}
                  <p className="muted">
                    Silent means no signal is arriving. Another app's mute
                    button may not mute this input. No audio is saved or
                    uploaded.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <footer>
        <div className="capture-controls">
          {active ? (
            <button className="secondary grow" onClick={() => action("pause")}>
              Ⅱ &nbsp; Pause
            </button>
          ) : resumable ? (
            <button
              className="primary grow"
              disabled={busy}
              onClick={() => action("resume")}
            >
              Resume capture
            </button>
          ) : ready ? (
            <button
              className="primary grow"
              disabled={busy}
              onClick={() => action("start")}
            >
              Start capture
            </button>
          ) : (
            <button
              className="primary grow"
              disabled={busy || preparing}
              onClick={() => {
                setPreparing(true);
                setSettingsOpen(false);
                if (settings.compact) save({ compact: false });
              }}
            >
              Prepare session
            </button>
          )}
          <button
            className="stop-button"
            onClick={() => action("stop")}
            title="Stop all capture and revoke consent"
          >
            ■ &nbsp; Stop
          </button>
        </div>
        {!settings.compact && (
          <div className="footer-note">
            <span className="tiny-dot" />
            {active
              ? "Hiding keeps capture on · Stop works globally"
              : "Capture starts only with your authorisation"}
            <span className="version">v0.3</span>
          </div>
        )}
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("EveryHint root element is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
