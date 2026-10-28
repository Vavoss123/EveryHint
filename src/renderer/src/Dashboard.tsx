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
      <p className="eyebrow nav-heading">WORKSPACE</p>
      {DESTINATIONS.map((item) => (
        <button
          key={item.id}
          className="nav-item"
          aria-current={selected === item.id ? "page" : undefined}
          onClick={() => navigate(item.id)}
        >
          <Icon name={item.glyph} />
          <span>{item.label}</span>
        </button>
      ))}
      <p className="nav-footnote">
        <Icon name="lock" /> Capture is always your choice.
      </p>
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
  openAssistant,
  prepare,
}: {
  app: AppSnapshot;
  assistant: AssistantSnapshot | null;
  openAssistant: () => void;
  prepare: () => void;
}) {
  const provider = assistant?.providers.find(
    (item) => item.id === assistant.selected,
  );
  return (
    <section className="home-page panel-stack" aria-label="Home overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>A little context. A clearer next step.</h1>
        </div>
        <span className="status-pill">{app.session.state.toLowerCase()}</span>
      </div>
      <p className="muted">
        Capture and transcription stay local. You choose what goes into each AI
        request.
      </p>
      <div className="home-cards">
        <article className="card panel-stack">
          <span className="icon-tile">
            <Icon name="spark" />
          </span>
          <h2>Start with a question</h2>
          <p>Ask with text, then review any context you choose to include.</p>
          <p className="muted">
            {provider
              ? `${provider.id === "codex" ? "ChatGPT" : "Claude"} · ${provider.ready ? "ready" : "connection or model selection needed"}`
              : "Reading local provider status…"}
          </p>
          <button className="primary" onClick={openAssistant}>
            Open assistant
          </button>
        </article>
        <article className="card panel-stack">
          <span className="icon-tile">
            <Icon name="screen" />
          </span>
          <h2>Your current session</h2>
          <dl className="session-facts">
            {(["screen", "microphone", "systemAudio"] as const).map((id) => (
              <div key={id}>
                <dt>
                  {id === "screen"
                    ? "Screen"
                    : id === "microphone"
                      ? "Microphone"
                      : "System audio"}
                </dt>
                <dd>
                  {app.session.sources[id].state.toLowerCase()}
                  {app.session.sources[id].muted ? " · muted" : ""}
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            {app.session.frameCount} local frames in this session. Meeting
            history is available with separate local-saving consent.
          </p>
          <button className="secondary" onClick={prepare}>
            Choose capture sources
          </button>
        </article>
      </div>
      <div className="privacy-note">
        <Icon name="lock" />
        <p>
          Choose reviewed Manual Assist, local Auto-Hint suggestions, or
          separately authorised Live Assist. Capture and remote sharing have
          separate permissions.
        </p>
      </div>
    </section>
  );
}
