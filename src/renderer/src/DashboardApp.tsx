import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsPage, type SettingsSection } from "./SettingsPage";
import { SetupWizard } from "./SetupWizard";
import {
  SharingFields,
  SpeechSetup,
  noSharing,
  useListen,
} from "./ListenControls";
import { SpeechControl } from "./SpeechControl";
import type {
  AppSnapshot,
  CaptureSource,
  Consent,
  Result,
  SessionAction,
  Settings,
  MicrophoneDevice,
} from "../../shared/contracts";
import type { ProviderId } from "../../shared/ai";
import "./styles.css";
import "./ux.css";
import { Icon } from "./components/Icon";
import { DashboardNav, DashboardHome, PlannedPage } from "./Dashboard";
import { plannedDestination, type Destination } from "../../shared/navigation";
import { useAssistantSnapshot } from "./useAssistantSnapshot";
import { AssistantPanel } from "./AssistantPanel";
import { useMeetings } from "./useMeetings";
import { SessionControls } from "./SessionControls";
const IS_OVERLAY = false;
import {
  MeetingStatus,
  MeetingSessionControls,
} from "./MeetingSessionControls";
import { MeetingHistory } from "./MeetingHistory";
import { CalendarPage, PeoplePage, useWorkspace } from "./WorkspacePages";
import { ModesPage, KnowledgePage } from "./PersonalPages";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function DashboardApp() {
  const contextualWorkspace = useWorkspace();
  const listen = useListen();
  const [sessionSharing, setSessionSharing] = useState({ ...noSharing });
  // Chosen on every Start so the answering AI is always a deliberate choice.
  const [answerWith, setAnswerWith] = useState<ProviderId | null>(null);
  const [hideFromCapture, setHideFromCapture] = useState(true);
  const [saveNotes, setSaveNotes] = useState(true);
  const [dismissedNotes, setDismissedNotes] = useState<string | null>(null);
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
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("General");
  const [screenConsent, setScreenConsent] = useState(false);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [systemConsent, setSystemConsent] = useState(false);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("default");
  const [acknowledged, setAcknowledged] = useState(false);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  // Once capture is authorised, select the whole screen by default; the
  // dropdown can still switch to a single window.
  useEffect(() => {
    if (!preparing || !screenConsent || !acknowledged || sources.length) return;
    let current = true;
    void window.everyhint.listSources(consent()).then((result) => {
      if (!current || !result.ok) return;
      setSources(result.value);
      const whole = result.value.find((source) => source.kind === "screen");
      if (whole) setSourceId((chosen) => chosen || whole.id);
    });
    return () => {
      current = false;
    };
  }, [preparing, screenConsent, acknowledged, sources.length]);
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
  async function controlWindow(
    action: Parameters<typeof window.everyhint.window>[0],
  ): Promise<void> {
    const result = await window.everyhint.window(action);
    if (!result.ok) setError(result.error);
  }
  function openAssistant(review = false): void {
    focusComposer.current = !review;
    focusReview.current = review;
    setDestination("assistant");
    setSettingsOpen(false);
    setPreparing(false);
    if (IS_OVERLAY) return;
  }
  function navigate(id: Destination): void {
    setDestination(id);
    setPreparing(false);
    setSettingsOpen(id === "settings");
    if (id === "assistant") focusComposer.current = true;
  }
  function openMeetings(id?: string): void {
    if (IS_OVERLAY) {
      void window.everyhint.openMeetings(id);
      return;
    }
    setRequestedMeetingId(id ?? null);
    setDestination("meetings");
    setSettingsOpen(false);
    setPreparing(false);
  }
  function providerReady(id: ProviderId): boolean {
    const status = assistant?.providers.find((p) => p.id === id);
    return id === "codex"
      ? status?.auth === "chatgpt"
      : status?.auth === "api-key" && !!assistant?.claudeApiBilling;
  }
  function meetingCapture(): void {
    setSessionSharing({ transcript: true, screen: true, acknowledged: false });
    setAnswerWith(null);
    setHideFromCapture(app?.settings.protectWindow !== false);
    setSaveNotes(true);
    setSettingsOpen(false);
    setPreparing(true);
    setAcknowledged(false);
    // Screen, microphone and system audio are on unless setup chose otherwise.
    setScreenConsent(
      (app?.settings.preferredSources?.screen ?? true) &&
        app?.screenCaptureSupported !== false,
    );
    setMicrophoneConsent(app?.settings.preferredSources?.microphone ?? true);
    setSystemConsent(
      (app?.settings.preferredSources?.systemAudio ?? true) &&
        !!app?.systemAudioSupported,
    );
    setSources([]);
    setSourceId("");
  }
  function meetingConnection(): void {
    openAssistant();
  }
  useEffect(() => window.everyhint.onAssist(openAssistant));
  useEffect(
    () =>
      window.everyhint.onAccountSettings(() => {
        setSettingsSection("Account & AI");
        navigate("settings");
      }),
    [],
  );
  useEffect(
    () =>
      window.everyhint.onMeetingNavigate((id) => {
        setRequestedMeetingId(id ?? null);
        navigate("meetings");
      }),
    [],
  );
  useEffect(() => {
    const response = assistant?.responses.at(-1);
    if (response?.automatic && response.requestId !== lastAutomatic.current) {
      lastAutomatic.current = response.requestId;
      if (
        app &&
        !settingsOpen &&
        !preparing &&
        (IS_OVERLAY || destination === "assistant")
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
    document.documentElement.dataset.theme = app?.settings.theme ?? "dark";
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
      !settingsOpen &&
      !preparing &&
      (IS_OVERLAY || destination === "assistant")
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
      if (!answerWith) throw new Error("Choose ChatGPT or Claude first.");
      unwrap(await window.everyhint.selectProvider(answerWith));
      // Must be chosen before capture starts so the transcript saves live.
      unwrap(await window.everyhint.sessionNotesStart(saveNotes));
      unwrap(
        await window.everyhint.saveSettings({
          ...app!.settings,
          protectWindow:
            hideFromCapture && app?.privacy?.state !== "unsupported",
          preferredSources: {
            screen: screenConsent,
            microphone: microphoneConsent,
            systemAudio: systemConsent,
          },
        }),
      );
      unwrap(
        await window.everyhint.listen.start({
          capture: {
            ...(screenConsent ? { sourceId } : {}),
            ...(microphoneConsent ? { microphoneDeviceId } : {}),
            consent: consent(),
          },
          sharing: {
            ...sessionSharing,
            transcript:
              sessionSharing.transcript && (microphoneConsent || systemConsent),
            screen: sessionSharing.screen && screenConsent,
          },
        }),
      );
      setSessionSharing({ ...noSharing });
      setPreparing(false);
      setDestination("assistant");
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

  const { session } = app;
  const settings = app.settings;
  const dashboard = !IS_OVERLAY;
  const pageVisible =
    !dashboard || destination === "assistant" || settingsOpen || preparing;
  const response = assistant?.responses.at(-1);
  // Meeting chat shows its own progress and Stop button.
  const sharing =
    (response?.status === "sending" || response?.status === "generating") &&
    response.meetingPurpose !== "ask";
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

  const diagnostics = (
    <div>
      {" "}
      <details className="diagnostics">
        <summary>
          Capture diagnostics <span>{session.frameCount} local frames</span>
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
              {new Date(session.frame.capturedAt).toLocaleTimeString()}
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
      <div className="audio-diagnostics" aria-label="Live audio diagnostics">
        <div className="section-heading">
          <h2>Live audio</h2>
          <span className="eyebrow">LOCAL PREVIEW</span>
        </div>
        {(["microphone", "systemAudio"] as const).map((id) => {
          const source = session.sources[id];
          const level =
            source.state === "CAPTURING" && !source.muted ? source.level : 0;
          return (
            <div className="audio-source" key={id}>
              <div className="audio-heading">
                <strong>
                  {id === "microphone" ? "Microphone" : "System audio"}
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
                {source.deviceId && <small>Device: {source.deviceId}</small>}
              </p>
              <meter
                aria-label={`${id === "microphone" ? "Microphone" : "System audio"} level`}
                min={0}
                max={1}
                value={level}
              />
              {source.error && <p className="error">{source.error}</p>}
              {id === "microphone" && source.state === "CAPTURING" && (
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
                  {source.muted ? "Unmute microphone" : "Mute microphone"}
                </button>
              )}
            </div>
          );
        })}
        <p className="muted">
          Silent means no signal is arriving. Another app's mute button may not
          mute this input. No audio is saved or uploaded.
        </p>
      </div>
    </div>
  );

  return (
    <main
      className={`app mode-manual ${dashboard ? "is-dashboard" : "is-assistant"}`}
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
        </div>
        <div className="window-actions">
          <details className="window-menu">
            <summary aria-label="Window menu" title="Window menu">
              •••
            </summary>
            <div className="menu-popover">
              <button
                onClick={() =>
                  void controlWindow(IS_OVERLAY ? "dashboard" : "overlay")
                }
              >
                {IS_OVERLAY ? "Open dashboard" : "Show / hide overlay"}
              </button>
              <button onClick={() => void controlWindow("hide")}>
                Hide to Tray
              </button>
              {IS_OVERLAY && (
                <label>
                  <input
                    type="checkbox"
                    checked={settings.alwaysOnTop}
                    onChange={(event) =>
                      save({ alwaysOnTop: event.target.checked })
                    }
                  />
                  Pin on Top
                </label>
              )}
              <button onClick={() => void controlWindow("quit")}>
                Quit EveryHint
              </button>
            </div>
          </details>
          <button
            className="icon-button"
            aria-label="Minimise EveryHint"
            title="Minimise"
            onClick={() => void controlWindow("minimize")}
          >
            −
          </button>
          {!IS_OVERLAY && (
            <button
              className="icon-button"
              aria-label="Maximise or restore EveryHint"
              title="Maximise / restore"
              onClick={() => void controlWindow("maximize")}
            >
              □
            </button>
          )}
          <button
            className="icon-button"
            aria-label={IS_OVERLAY ? "Dismiss overlay" : "Close EveryHint"}
            title={IS_OVERLAY ? "Dismiss overlay" : "Close"}
            onClick={() => void controlWindow("close")}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>

      {(IS_OVERLAY ||
        active ||
        resumable ||
        ready ||
        settings.protectWindow) && (
        <div
          className={`capture-status state-${session.state.toLowerCase()}`}
          role="status"
        >
          <span className="status-dot" />
          <span
            className="privacy-indicator"
            title={app.privacy?.message}
            aria-label={`Screen recording visibility: ${app.privacy?.state ?? "off"}`}
          >
            {app.privacy?.state === "configured"
              ? "Hidden from screen recordings"
              : app.privacy?.state === "error"
                ? "Hiding not confirmed"
                : app.privacy?.state === "unsupported"
                  ? "Hiding unavailable"
                  : "Visible in screen recordings"}
          </span>
          <span>{status}</span>
          <span className="status-detail">
            {assistant?.selected === "claude" ? "CLAUDE" : "CHATGPT"}
          </span>
        </div>
      )}
      {app.sessionNotes &&
        dismissedNotes !== JSON.stringify(app.sessionNotes) && (
          <div className="session-notes-status" role="status">
            <span>{app.sessionNotes.message}</span>
            {app.sessionNotes.meetingId && !app.sessionNotes.working && (
              <button
                className="secondary"
                onClick={() => openMeetings(app.sessionNotes!.meetingId!)}
              >
                Open notes
              </button>
            )}
            {!app.sessionNotes.working && (
              <button
                className="icon-button"
                aria-label="Dismiss"
                onClick={() =>
                  setDismissedNotes(JSON.stringify(app.sessionNotes))
                }
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
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
                : listen?.managed
                  ? "Sending approved conversation context"
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
        {dashboard && contextualWorkspace?.suggestion && (
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
            destination === "home" &&
            settings.setupComplete === false && (
              <SetupWizard
                settings={settings}
                complete={async (patch) => {
                  unwrap(
                    await window.everyhint.saveSettings({
                      ...app.settings,
                      ...patch,
                    }),
                  );
                }}
              />
            )}
          {dashboard &&
            !settingsOpen &&
            !preparing &&
            destination === "home" &&
            settings.setupComplete !== false && (
              <DashboardHome
                app={app}
                assistant={assistant}
                navigate={navigate}
                meetings={meetings.state}
                action={action}
                openAccount={() => {
                  setSettingsSection("Account & AI");
                  navigate("settings");
                }}
                prepare={meetingCapture}
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
          {dashboard && app.warnings.length > 0 && (
            <details className="desktop-notices">
              <summary>
                {app.warnings.length} desktop notice
                {app.warnings.length === 1 ? "" : "s"}
              </summary>
              {app.warnings.map((warning) => (
                <p key={warning} className="warning" role="alert">
                  {warning}
                </p>
              ))}
            </details>
          )}
          <div className="assistant-host" hidden={!pageVisible}>
            {settingsOpen && (
              <SettingsPage
                key={settingsSection}
                initial={settingsSection}
                app={app}
                save={save}
                meetings={meetings.state}
                diagnostics={diagnostics}
                chooseSources={meetingCapture}
              />
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
                  <h1>Start EveryHint</h1>
                </div>
                <fieldset className="answer-with">
                  <legend>Answer with</legend>
                  {(["codex", "claude"] as const).map((id) => {
                    const status = assistant?.providers.find(
                      (p) => p.id === id,
                    );
                    const connected =
                      !!status &&
                      (id === "codex"
                        ? status.auth === "chatgpt"
                        : status.auth === "api-key" &&
                          !!assistant?.claudeApiBilling);
                    return (
                      <label className="consent-row" key={id}>
                        <input
                          type="radio"
                          name="answer-with"
                          checked={answerWith === id}
                          onChange={() => setAnswerWith(id)}
                        />
                        <span>
                          {id === "codex" ? "ChatGPT" : "Claude"}
                          <small>
                            {connected
                              ? id === "codex"
                                ? "Connected · uses your ChatGPT plan"
                                : `Ready · ${status?.selectedModel ?? "Claude"} · billed to your Anthropic API account`
                              : id === "codex"
                                ? "Not connected"
                                : "Add an Anthropic API key first"}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                  {answerWith && !providerReady(answerWith) && (
                    <button
                      className="secondary full"
                      onClick={() => {
                        setPreparing(false);
                        setSettingsSection("Account & AI");
                        navigate("settings");
                      }}
                    >
                      {answerWith === "codex"
                        ? "Connect ChatGPT"
                        : "Add Claude API key"}
                    </button>
                  )}
                </fieldset>
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={saveNotes}
                    onChange={(event) => setSaveNotes(event.target.checked)}
                  />
                  <span>
                    Save this session with notes
                    <small>
                      The transcript is saved encrypted on this PC (kept{" "}
                      {meetings.state?.preferences.retentionDays === null
                        ? "until you delete it"
                        : `${meetings.state?.preferences.retentionDays ?? 30} days`}
                      ). When you end the session it is sent to{" "}
                      {answerWith === "claude" ? "Claude" : "ChatGPT"} to write
                      notes, saved in Meetings.
                    </small>
                  </span>
                </label>
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={
                      hideFromCapture && app.privacy?.state !== "unsupported"
                    }
                    disabled={app.privacy?.state === "unsupported"}
                    onChange={(event) =>
                      setHideFromCapture(event.target.checked)
                    }
                  />
                  <span>
                    Hide EveryHint from screen recordings
                    <small>
                      {app.privacy?.state === "unsupported"
                        ? "Window-content protection is unavailable on this platform. Hiding the window does not exclude it from capture."
                        : "Windows window-content protection is separate from hiding. Check your sharing app; capture exclusion is not guaranteed."}
                    </small>
                  </span>
                </label>
                <p className="muted">Choose what EveryHint can see and hear.</p>
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={screenConsent}
                    disabled={app.screenCaptureSupported === false}
                    onChange={(event) => {
                      setScreenConsent(event.target.checked);
                      setSources([]);
                      setSourceId("");
                    }}
                  />
                  <Icon name="screen" />
                  <span>
                    Screen or application window
                    <small>
                      {app.screenCaptureSupported === false
                        ? "Screen context needs an X11/Xorg Linux session. Audio remains available under Wayland."
                        : "Understand the screen or application you choose."}
                    </small>
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
                    Microphone<small>Hear what you say.</small>
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
                      {app.systemAudioDescription ??
                        (app.systemAudioSupported
                          ? "Hear conversations playing on your computer."
                          : "System audio is unavailable on this system.")}
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
                    applications. Any accompanying display track is released
                    without image analysis.
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
                      <option value="default">Default microphone</option>
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
                      {busy ? "Working…" : "Choose a screen or window"}
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
                {(microphoneConsent || systemConsent) && <SpeechSetup />}
                <SharingFields
                  provider={answerWith === "claude" ? "Claude" : "ChatGPT"}
                  audio={microphoneConsent || systemConsent}
                  screen={screenConsent}
                  value={sessionSharing}
                  change={setSessionSharing}
                />
                <button
                  className="primary full"
                  disabled={
                    (((sessionSharing.transcript &&
                      (microphoneConsent || systemConsent)) ||
                      (sessionSharing.screen && screenConsent)) &&
                      !sessionSharing.acknowledged) ||
                    (!screenConsent && !microphoneConsent && !systemConsent) ||
                    (screenConsent && !sourceId) ||
                    !answerWith ||
                    !acknowledged ||
                    busy
                  }
                  onClick={prepare}
                >
                  Start EveryHint
                </button>
              </div>
            )}
            <div className="assistant-body" hidden={settingsOpen || preparing}>
              <div className="session-workspace">
                <AssistantPanel
                  capture={session}
                  limits={settings.contextLimits}
                  connect={() => {
                    if (IS_OVERLAY) void controlWindow("account");
                    else {
                      setSettingsSection("Account & AI");
                      navigate("settings");
                    }
                  }}
                  openMeetings={() => openMeetings()}
                  hideImage={active && session.source?.kind === "screen"}
                  sourceName={session.source?.name ?? "No screen selected"}
                />
                <details className="session-options">
                  <summary>Session options</summary>
                  <SpeechControl capture={session} />
                  <MeetingSessionControls
                    state={meetings.state}
                    ai={meetings.ai}
                    capture={session}
                    open={() => openMeetings()}
                    saved={openMeetings}
                  />
                </details>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer
        className={
          active || resumable || ready ? "session-footer" : "idle-footer"
        }
      >
        <SessionControls state={session.state} action={action} busy={busy} />
        {(active || resumable) && (
          <span className="muted">
            {active
              ? listen?.managed
                ? listen.phase === "listening"
                  ? "Listening"
                  : listen.phase === "transcription-paused"
                    ? "Transcription paused � capture on"
                    : "Starting local transcription"
                : "Session active"
              : "Session paused"}{" "}
            · Answering with{" "}
            {assistant?.selected === "claude" ? "Claude" : "ChatGPT"}
          </span>
        )}
      </footer>
    </main>
  );
}
