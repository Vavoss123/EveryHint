import { useEffect, useState } from "react";
import type { MeetingPage, MeetingState } from "../../shared/meetings";
import { DEFAULT_MEETING_QUERY } from "../../shared/meetings";
import { connectionLabel } from "../../shared/connection";
import { SessionControls } from "./SessionControls";
import type { SessionAction } from "../../shared/contracts";
import type { AppSnapshot } from "../../shared/contracts";
import type { AssistantSnapshot } from "../../shared/ai";
import { DESTINATIONS, type Destination } from "../../shared/navigation";
import { Icon } from "./components/Icon";

export function DashboardNav({
  selected,
  navigate,
}: {
  selected: Destination;
  navigate: (id: Destination) => void;
}) {
  return (
    <nav className="dashboard-nav" aria-label="Main navigation">
      {DESTINATIONS.map((item) => (
        <button
          key={item.id}
          className="nav-item"
          aria-label={item.label}
          aria-current={selected === item.id ? "page" : undefined}
          onClick={() => navigate(item.id)}
        >
          <Icon name={item.glyph} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
export function PlannedPage({
  page,
  openAssistant,
}: {
  page: Destination;
  openAssistant: () => void;
}) {
  const item = DESTINATIONS.find((item) => item.id === page)!;
  return (
    <section
      className="planned-page panel-stack"
      aria-label={`${item.label} roadmap`}
    >
      <div className="page-heading">
        <span className="icon-tile">
          <Icon name={item.glyph} />
        </span>
        <div>
          <p className="eyebrow">PLANNED · {item.milestone}</p>
          <h1>{item.label}</h1>
        </div>
      </div>
      <p>{item.description}</p>
      <div className="card panel-stack">
        <h2>Not available yet</h2>
        <p className="muted">
          This section establishes navigation for a future milestone. No
          records, connections or background jobs have been created.
        </p>
        {page === "meetings" && (
          <p>
            Current transcripts remain in memory. Meeting history and saved
            recordings are not enabled.
          </p>
        )}
        {page === "calendar" && (
          <p>
            No calendar account is connected, and no events are read or changed.
          </p>
        )}
        {page === "people" && (
          <p>Person research and cross-session memory are not enabled.</p>
        )}
        {page === "knowledge" && (
          <p>Document uploads and retrieval are not enabled.</p>
        )}
        {page === "modes" && (
          <p>
            The current assistant uses fixed answer-only instructions. Custom
            modes and prompts are not enabled.
          </p>
        )}
        <button className="secondary" onClick={openAssistant}>
          Open working assistant
        </button>
      </div>
    </section>
  );
}
export function DashboardHome({
  app,
  assistant,
  prepare,
  navigate,
  meetings,
  action,
  openAccount,
}: {
  app: AppSnapshot;
  assistant: AssistantSnapshot | null;
  prepare: () => void;
  navigate: (id: Destination) => void;
  meetings: MeetingState | null;
  action: (action: SessionAction) => void;
  openAccount: () => void;
}) {
  const [recent, setRecent] = useState<MeetingPage | null>(null);
  useEffect(() => {
    let current = true;
    setRecent(null);
    if (meetings && !meetings.locked)
      void window.everyhint.meetings
        .list({
          scopeId: meetings.scopeId,
          input: { ...DEFAULT_MEETING_QUERY },
        })
        .then((result) => {
          if (current && result.ok) setRecent(result.value);
        });
    return () => {
      current = false;
    };
  }, [meetings?.scopeId, meetings?.locked, meetings?.revision]);
  const provider = assistant?.providers.find(
    (item) => item.id === assistant.selected,
  );
  const running = ["ACTIVE", "PAUSED", "READY"].includes(app.session.state);
  return (
    <section className="home-page" aria-label="Home overview">
      <div className="home-topline">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <button className="connection-badge" onClick={openAccount}>
          <span className={`tiny-dot ${provider?.ready ? "connected" : ""}`} />
          {provider?.id === "claude" ? "Claude" : "ChatGPT"} ·{" "}
          {connectionLabel(provider)}
        </button>
      </div>
      <div className="home-hero">
        <div className="brand-mark hero-mark">
          e<span>h</span>
        </div>
        <h1>Make room for a clearer answer.</h1>
        <p className="muted">
          Help with your conversations, meetings and work.
        </p>
        {!running && (
          <SessionControls
            state={app.session.state}
            action={action}
            start={prepare}
          />
        )}
        {running && (
          <button className="primary" onClick={() => navigate("assistant")}>
            Open your session
          </button>
        )}
        <div className="source-indicators" aria-label="Capture source states">
          {(["microphone", "systemAudio", "screen"] as const).map((id) => (
            <span
              key={id}
              className={
                app.session.sources[id].state === "CAPTURING" ? "source-on" : ""
              }
            >
              {id === "microphone"
                ? "Microphone"
                : id === "systemAudio"
                  ? "System audio"
                  : "Screen"}
              <small>
                {app.session.sources[id].state === "CAPTURING"
                  ? app.session.sources[id].muted
                    ? "Muted"
                    : "On"
                  : app.session.sources[id].state === "PAUSED"
                    ? "Paused"
                    : "Off"}
              </small>
            </span>
          ))}
        </div>
      </div>
      <div className="quick-links">
        {(["modes", "calendar", "knowledge"] as const).map((id) => (
          <button key={id} onClick={() => navigate(id)}>
            <Icon name={id === "knowledge" ? "book" : id} />
            <span>{id[0]!.toUpperCase() + id.slice(1)}</span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <section className="recent-meetings">
        <div className="section-heading">
          <h2>Recent meetings</h2>
          <button className="text-button" onClick={() => navigate("meetings")}>
            View all
          </button>
        </div>
        {recent?.items.length ? (
          recent.items.slice(0, 4).map((item) => (
            <button
              className="recent-meeting"
              key={item.id}
              onClick={() => navigate("meetings")}
            >
              <Icon name="calendar" />
              <strong>{item.title}</strong>
              <span>
                {new Date(
                  item.startedAt ?? item.createdAt,
                ).toLocaleDateString()}{" "}
                · {Math.round(item.durationMs / 60000)} min
              </span>
            </button>
          ))
        ) : (
          <div className="home-empty">
            <Icon name="calendar" />
            <div>
              <strong>
                {meetings?.locked
                  ? "Your meetings, in one place"
                  : "No saved meetings yet"}
              </strong>
              <p className="muted">
                Save a meeting when you’re ready to keep its notes.
              </p>
            </div>
            <button className="secondary" onClick={() => navigate("meetings")}>
              Open meetings
            </button>
          </div>
        )}
      </section>
      <small className="home-shortcut">
        Show / hide overlay{" "}
        <kbd>
          {(
            app.hotkeys.find((h) => h.action === "toggle")?.accelerator ??
            "Control+Alt+Space"
          )
            .replace("Control", "Ctrl")
            .replaceAll("+", " + ")}
        </kbd>
        {app.hotkeys.find((h) => h.action === "toggle")?.registered === false &&
          " · Shortcut unavailable; use the tray"}
      </small>
    </section>
  );
}
