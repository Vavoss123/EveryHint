import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import {
  IntelligencePanel,
  IntelligenceSettingsPanel,
} from "./IntelligencePanel";
import { useIntelligenceSnapshot } from "./useIntelligenceSnapshot";
import { LiveStatus } from "./LiveConsent";
import { ShortcutSettings } from "./ShortcutSettings";
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
import "./theme/tokens.css";
import "./theme/fonts.css";
import "./styles.css";
import { Icon } from "./components/Icon";
import { Panel } from "./components/Panel";
import { DashboardNav, DashboardHome, PlannedPage } from "./Dashboard";
import { plannedDestination, type Destination } from "../../shared/navigation";
import { useAssistantSnapshot } from "./useAssistantSnapshot";
import { TranscriptionPanel } from "./TranscriptionPanel";
import { AssistantPanel } from "./AssistantPanel";
import { useMeetings } from "./useMeetings";
import {
  MeetingStatus,
  MeetingSessionControls,
  MeetingPreferencesPanel,
} from "./MeetingSessionControls";
import { MeetingHistory } from "./MeetingHistory";
import {
  CalendarPage,
  WorkspaceSettings,
  PeoplePage,
  useWorkspace,
} from "./WorkspacePages";
import {
  ModesPage,
  ModeSelector,
  PersonalSettings,
  KnowledgePage,
} from "./PersonalPages";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function App() {
  const contextualWorkspace = useWorkspace();
  const intelligence = useIntelligenceSnapshot();
  const assistant = useAssistantSnapshot();
  const meetings = useMeetings();
  const [requestedMeetingId, setRequestedMeetingId] = useState<string | null>(
    null,
  );
  const [requestedEventId, setRequestedEventId] = useState<string | null>(null);
  useEffect(
    () =>
      window.everyhint.workspace.onNavigate((id) => {
        setRequestedEventId(id);
        setDestination("calendar");
        setSettingsOpen(false);
        setPreparing(false);
        void window.everyhint.getSnapshot().then((result) => {
          if (result.ok)
            void window.everyhint.saveSettings({
              ...result.value.settings,
              compact: false,
              layout: "dashboard",
            });
        });
      }),
    [],
  );
  const [app, setApp] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [screenConsent, setScreenConsent] = useState(false);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [systemConsent, setSystemConsent] = useState(false);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("default");
  const [acknowledged, setAcknowledged] = useState(false);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [destination, setDestination] = useState<Destination>("home");
  const focusComposer = useRef(false);
  const focusReview = useRef(false);
  const lastAutomatic = useRef<string | null>(null);

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
  function openAssistant(review = false): void {
    focusComposer.current = !review;
    focusReview.current = review;
    setDestination("assistant");
    setSettingsOpen(false);
    setPreparing(false);
    save({ compact: false, layout: "assistant" });
  }
  function navigate(id: Destination): void {
    setDestination(id);
    setPreparing(false);
    setSettingsOpen(id === "settings");
    if (id === "assistant") focusComposer.current = true;
  }
  function openMeetings(id?: string): void {
    setRequestedMeetingId(id ?? null);
    setDestination("meetings");
    setSettingsOpen(false);
    setPreparing(false);
    save({ compact: false, layout: "dashboard" });
  }
  function meetingCapture(): void {
    setSettingsOpen(false);
    setPreparing(true);
  }
  function meetingConnection(): void {
    openAssistant();
  }
  useEffect(() => window.everyhint.onAssist(openAssistant));
  useEffect(() => {
    const response = assistant?.responses.at(-1);
    if (response?.automatic && response.requestId !== lastAutomatic.current) {
      lastAutomatic.current = response.requestId;
      if (
        app &&
        !app.settings.compact &&
        !settingsOpen &&
        !preparing &&
        (app.settings.layout !== "dashboard" || destination === "assistant")
      )
        requestAnimationFrame(() =>
          document
            .querySelector(".ai-response:last-child")
            ?.scrollIntoView({ block: "start" }),
        );
    }
  }, [assistant, app, settingsOpen, preparing, destination]);
  useEffect(() => {
    if (
      focusReview.current &&
      app &&
      !app.settings.compact &&
      !settingsOpen &&
      !preparing &&
      assistant?.review
    ) {
      focusReview.current = false;
      requestAnimationFrame(() => {
        document
          .querySelector('[aria-label="Context review"]')
          ?.scrollIntoView({ block: "start" });
        document
          .querySelector<HTMLInputElement>(
            '[aria-label="Acknowledge remote transfer"]',
          )
          ?.focus();
      });
    }
  }, [app, settingsOpen, preparing, assistant?.review]);
  useEffect(() => {
    document.documentElement.dataset.theme = app?.settings.theme ?? "light";
  }, [app?.settings.theme]);
  useEffect(() => {
    document.querySelector(".content")?.scrollTo({ top: 0 });
  }, [
    destination,
    settingsOpen,
    preparing,
    app?.settings.layout,
    app?.settings.compact,
  ]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.key === "Enter" &&
        !event.repeat &&
        !event.isComposing
      ) {
        event.preventDefault();
        openAssistant();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  useEffect(() => {
    if (
      focusComposer.current &&
      app &&
      !app.settings.compact &&
      !settingsOpen &&
      !preparing &&
      (app.settings.layout !== "dashboard" || destination === "assistant")
    ) {
      focusComposer.current = false;
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>('[aria-label="Your question"]')
          ?.focus(),
      );
    }
  }, [app, settingsOpen, preparing, destination]);
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
  const dashboard = settings.layout === "dashboard" && !settings.compact;
  const pageVisible =
    !dashboard || destination === "assistant" || settingsOpen || preparing;
  const response = assistant?.responses.at(-1);
  const sharing =
    response?.status === "sending" || response?.status === "generating";
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
    <main
      className={`app mode-${intelligence?.mode ?? "manual"} ${settings.compact ? "is-compact" : ""} ${dashboard ? "is-dashboard" : "is-assistant"}`}
    >
      <button
        className="skip-link"
        onClick={() => document.getElementById("workspace-content")?.focus()}
      >
        Skip to workspace
      </button>
      <header className="titlebar">
        <div className="brand">
          <div className="brand-mark">
            e<span>h</span>
          </div>
          <span>EveryHint</span>
          <ModeSelector />
          <span className="phase">
            {settings.compact
              ? "OVERLAY"
              : dashboard
                ? "WORKSPACE"
                : "ASSISTANT"}
          </span>
        </div>
        <div className="window-actions">
          <button
            className={`icon-button ${dashboard ? "selected" : ""}`}
            aria-label={
              dashboard ? "Open expanded assistant" : "Open dashboard"
            }
            title={dashboard ? "Open expanded assistant" : "Open dashboard"}
            onClick={() => {
              if (dashboard) openAssistant();
              else {
                setDestination("home");
                setSettingsOpen(false);
                setPreparing(false);
                save({ compact: false, layout: "dashboard" });
              }
            }}
          >
            <Icon name="dashboard" />
          </button>
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
              setDestination(settingsOpen ? "home" : "settings");
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
        <span>
          {settings.compact
            ? active
              ? "Capturing"
              : resumable
                ? "Paused"
                : ready
                  ? "Ready"
                  : session.state === "ERROR"
                    ? "Error"
                    : "Capture off"
            : status}
        </span>
        {settings.compact && (
          <span className="compact-sources" aria-label="Capture source states">
            {(["microphone", "systemAudio", "screen"] as const).map((id) => (
              <span key={id}>
                {id === "microphone"
                  ? "Mic"
                  : id === "systemAudio"
                    ? "System"
                    : "Screen"}{" "}
                {session.sources[id].state === "CAPTURING"
                  ? session.sources[id].muted
                    ? "muted"
                    : "on"
                  : "off"}
              </span>
            ))}
          </span>
        )}
        <span className="status-detail">
          {intelligence?.mode === "auto-hint"
            ? "AUTO-HINT · LOCAL"
            : intelligence?.mode === "live"
              ? intelligence.live
                ? "LIVE · REMOTE ENABLED"
                : "LIVE · NOT AUTHORISED"
              : "MANUAL"}
        </span>
      </div>

      <LiveStatus snapshot={intelligence} />
      <MeetingStatus
        state={meetings.state}
        ai={meetings.ai}
        open={() => openMeetings()}
      />
      {sharing && (
        <div className="remote-status" role="status">
          <Icon name="spark" />
          <span>
            {response.provider === "codex" ? "ChatGPT" : "Claude"} ·{" "}
            {response.status === "sending"
              ? response.meetingPurpose
                ? "Sending authorised meeting text"
                : response.automatic
                  ? "Sending authorised Live context"
                  : "Sending reviewed context"
              : "Generating answer"}
          </span>
          <button
            className="secondary"
            onClick={() =>
              void run(async () =>
                unwrap(await window.everyhint.assistant("cancel")),
              )
            }
          >
            Cancel remote request
          </button>
        </div>
      )}
      <div className="workspace">
        {contextualWorkspace?.suggestion && (
          <aside className="card" role="status">
            <p>
              Upcoming calendar meeting: {contextualWorkspace.suggestion.title}.
              EveryHint can help you prepare.
            </p>
            <button
              onClick={() => {
                setRequestedEventId(contextualWorkspace.suggestion!.eventId);
                navigate("calendar");
              }}
            >
              View meeting preparation
            </button>
            <button onClick={meetingCapture}>Choose capture sources</button>
          </aside>
        )}
        {dashboard && (
          <DashboardNav
            selected={settingsOpen ? "settings" : destination}
            navigate={navigate}
          />
        )}
        <section className="content" id="workspace-content" tabIndex={-1}>
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "calendar" && (
              <CalendarPage
                key={contextualWorkspace?.scopeId}
                requestedEventId={requestedEventId}
                prepareCapture={meetingCapture}
                openMeeting={openMeetings}
              />
            )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "people" && (
              <PeoplePage
                key={contextualWorkspace?.scopeId}
                openMeeting={openMeetings}
              />
            )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "modes" && (
              <ModesPage openAssistant={() => openAssistant(true)} />
            )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "knowledge" && <KnowledgePage />}
          {meetings.state && (
            <MeetingHistory
              state={meetings.state}
              ai={meetings.ai}
              assistant={assistant}
              visible={
                dashboard &&
                !settingsOpen &&
                !preparing &&
                destination === "meetings"
              }
              requestedId={requestedMeetingId}
              prepareCapture={meetingCapture}
              connection={meetingConnection}
            />
          )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "home" && (
              <DashboardHome
                app={app}
                assistant={assistant}
                openAssistant={() => navigate("assistant")}
                prepare={() => setPreparing(true)}
              />
            )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            plannedDestination(destination) && (
              <PlannedPage
                page={destination}
                openAssistant={() => navigate("assistant")}
              />
            )}
          {(error || session.error) && (
            <div className="error" role="alert">
              {error ?? session.error}
              {error && (
                <button
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                >
                  ×
                </button>
              )}
            </div>
          )}
          {settings.compact && app.warnings.length > 0 ? (
            <button
              className="compact-warning"
              title={app.warnings.join("\n")}
              onClick={() => {
                setSettingsOpen(true);
                setDestination("settings");
                setPreparing(false);
                save({ compact: false });
              }}
            >
              {app.warnings.length} desktop notice
              {app.warnings.length === 1 ? "" : "s"} · expand for details
            </button>
          ) : (
            app.warnings.length > 0 && (
              <details className="desktop-notices">
                <summary>
                  {app.warnings.length} desktop notice
                  {app.warnings.length === 1 ? "" : "s"} · view details
                </summary>
                {app.warnings.map((warning) => (
                  <p key={warning} className="warning" role="alert">
                    {warning}
                  </p>
                ))}
              </details>
            )
          )}
          <div hidden={!pageVisible}>
            {settingsOpen && (
              <div className="settings panel-stack">
                <div className="section-heading">
                  <h1>EveryHint settings</h1>
                  <span className="eyebrow">DESKTOP</span>
                </div>
                <h2>Appearance</h2>
                <label className="setting-row">
                  <span>
                    Theme
                    <small>EverySession light, or desktop Dark/System</small>
                  </span>
                  <select
                    aria-label="Colour theme"
                    value={settings.theme ?? "light"}
                    onChange={(event) =>
                      save({ theme: event.target.value as Settings["theme"] })
                    }
                    disabled={busy}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>
                    Window opacity
                    <small>
                      {Math.round((settings.opacity ?? 1) * 100)}% · lower
                      opacity can reduce contrast
                    </small>
                  </span>
                  <input
                    aria-label="Window opacity"
                    type="range"
                    min="80"
                    max="100"
                    step="5"
                    value={Math.round((settings.opacity ?? 1) * 100)}
                    onChange={(event) =>
                      save({ opacity: Number(event.target.value) / 100 })
                    }
                    disabled={busy}
                  />
                </label>
                <label className="setting-row">
                  <span>
                    Always on top
                    <small>Keep EveryHint above other windows</small>
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
                    Compact mode
                    <small>A smaller view with capture controls</small>
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
                <IntelligenceSettingsPanel
                  snapshot={intelligence}
                  capture={session}
                />
                {meetings.state && (
                  <MeetingPreferencesPanel state={meetings.state} />
                )}
                <ShortcutSettings settings={settings} save={save} />
                <PersonalSettings />
                <WorkspaceSettings />
                <TranscriptionPanel settings canEnable={active} />
                {app.hotkeys.map((hotkey) => (
                  <div className="shortcut" key={hotkey.action}>
                    <span>
                      {hotkey.action === "toggle"
                        ? "Show / hide"
                        : hotkey.action === "pause"
                          ? "Pause / resume"
                          : hotkey.action === "stop"
                            ? "Stop all capture"
                            : hotkey.action === "assist"
                              ? "Assist"
                              : "Clear context"}
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
                  Pause/resume only affects an authorised session.
                </p>
                <h2>Privacy by default</h2>
                <p className="muted">
                  Screenshots stay in memory on this device. Stop clears the
                  preview and session consent. Closing the overlay hides it to
                  the tray; capture continues while Active Mode is on.
                </p>
                <p className="muted">
                  Microphone, Windows audio and speech transcription stay local.
                  Assistant requests require reviewed context and an explicit
                  Ask.
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
            )}
            {!settingsOpen && preparing && (
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
                  Choose what EveryHint can see and hear. Nothing is captured
                  until you press Start capture.
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
                    Screen or application window
                    <small>Local snapshots only</small>
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
                    I authorise the selected capture sources and have any
                    required participant consent. I will follow meeting and
                    application rules.
                  </span>
                </label>
                {systemConsent && (
                  <p className="warning">
                    System audio can include other people's voices and unrelated
                    applications. Windows loopback briefly requires a display
                    track; EveryHint releases it immediately without analysing
                    its images.
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
                      <option value="default">
                        Windows default microphone
                      </option>
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
            )}
            <div hidden={settingsOpen || preparing}>
              <div className="session-workspace">
                {!settings.compact && (
                  <MeetingSessionControls
                    state={meetings.state}
                    ai={meetings.ai}
                    capture={session}
                    open={() => openMeetings()}
                    saved={openMeetings}
                  />
                )}
                <IntelligencePanel
                  snapshot={intelligence}
                  compact={settings.compact}
                  openReview={() => openAssistant(true)}
                />
                <Panel
                  title="Live transcript"
                  badge="LOCAL"
                  compact={settings.compact}
                >
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
                </Panel>
                <Panel
                  title="Conversation & context"
                  badge="MANUAL"
                  compact={settings.compact}
                >
                  <AssistantPanel
                    openMeetings={() => openMeetings()}
                    operatingMode={intelligence?.mode ?? "manual"}
                    compact={settings.compact}
                    hideImage={active && session.source?.kind === "screen"}
                    expand={openAssistant}
                    sourceName={
                      session.source
                        ? `${session.source.name} · ${session.state}`
                        : "No screen source selected"
                    }
                  />
                </Panel>
              </div>
              {session.source && (
                <div className="source-summary">
                  <Icon name="screen" />
                  <span title={session.source.name}>{session.source.name}</span>
                  <small>{session.state}</small>
                </div>
              )}
              {!settings.compact && (
                <>
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
                      <span className="eyebrow">LOCAL PREVIEW</span>
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
            </div>
          </div>
        </section>
      </div>

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
            <span className="version">v0.4</span>
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
