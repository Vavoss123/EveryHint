import { useEffect, useRef, useState } from "react";
import type {
  TranscriptionSettings,
  TranscriptionSnapshot,
} from "../../shared/transcription";
import type { Result } from "../../shared/contracts";
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function TranscriptionPanel({
  settings = false,
  compact = false,
  canEnable,
}: {
  settings?: boolean;
  compact?: boolean;
  canEnable: boolean;
}) {
  const [snapshot, setSnapshot] = useState<TranscriptionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const accept = (next: TranscriptionSnapshot) =>
      setSnapshot((old) =>
        !old || next.revision >= old.revision ? next : old,
      );
    const off = window.everyhint.onTranscription(accept);
    window.everyhint
      .getTranscription()
      .then((result) => accept(unwrap(result)))
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not read transcription state.",
        ),
      );
    return off;
  }, []);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [snapshot?.events]);
  async function run(task: () => Promise<unknown>) {
    setWorking(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Local transcription failed.",
      );
    } finally {
      setWorking(false);
    }
  }
  if (!snapshot)
    return (
      <p className="muted">{error ?? "Reading local transcription status…"}</p>
    );
  const selected = snapshot.models.find(
    (model) => model.id === snapshot.settings.model,
  );
  const enabled =
    snapshot.state === "LISTENING" || snapshot.state === "LOADING";
  const latest = snapshot.events.at(-1);
  const action = (value: "enable" | "pause" | "clear" | "inspect") => {
    void run(async () => unwrap(await window.everyhint.transcription(value)));
  };
  const save = (patch: Partial<TranscriptionSettings>) => {
    void run(async () =>
      unwrap(
        await window.everyhint.saveTranscriptionSettings({
          ...snapshot.settings,
          ...patch,
        }),
      ),
    );
  };
  if (compact)
    return (
      <div
        className="compact-transcript"
        title={
          latest?.text ??
          snapshot.error ??
          `Transcription ${snapshot.state.toLowerCase()}`
        }
      >
        <span>
          {latest
            ? `${latest.source === "microphone" ? "Mic" : "System"}${latest.state === "partial" ? " (partial)" : ""} · `
            : ""}
          {latest?.text || `Transcription ${snapshot.state.toLowerCase()}`}
        </span>
      </div>
    );
  if (settings)
    return (
      <section
        className="speech-settings panel-stack"
        aria-label="Local transcription settings"
      >
        <div className="section-heading">
          <h2>Local transcription</h2>
          <span className="eyebrow">WHISPER · CPU</span>
        </div>
        <p className="muted">
          {snapshot.runtimeInstalled
            ? "Local Whisper runtime installed."
            : "Runtime missing. Run npm run speech:build from the project directory."}{" "}
          Models download only when you choose Install. Audio and text stay on
          this device.
        </p>
        <label className="setting-row">
          <span>Speech model</span>
          <select
            aria-label="Speech model"
            value={snapshot.settings.model}
            disabled={working}
            onChange={(event) =>
              save({
                model: event.target.value as TranscriptionSettings["model"],
              })
            }
          >
            <option value="tiny.en">tiny.en · Faster English</option>
            <option value="base.en">base.en · Higher quality English</option>
          </select>
        </label>
        <label>
          Speech transcription language
          <select
            aria-label="Speech transcription language"
            value="en"
            disabled
          >
            <option value="en">English · English-only models</option>
          </select>
        </label>
        <p className="muted">
          tiny.en and base.en support English transcription. AI output language
          is a separate response preference. Multilingual Whisper models are not
          installed or offered; no model is downloaded automatically.
        </p>
        {snapshot.models.map((model) => (
          <div className="model-row" key={model.id}>
            <div>
              <strong>{model.id}</strong>
              <small>
                {(model.bytes / 1000000).toFixed(1)} MB · {model.state}
                {model.state === "downloading"
                  ? ` ${Math.round(model.progress * 100)}%`
                  : ""}
              </small>
              {model.error && <p className="error">{model.error}</p>}
            </div>
            <button
              className="secondary"
              disabled={
                working ||
                snapshot.models.some((item) =>
                  ["downloading", "verifying"].includes(item.state),
                )
              }
              onClick={() => {
                void run(async () =>
                  unwrap(await window.everyhint.installSpeechModel(model.id)),
                );
              }}
            >
              {model.state === "installed" ? "Reinstall" : "Install"} {model.id}
            </button>
          </div>
        ))}
        <button
          className="secondary full"
          disabled={working}
          onClick={() => action("inspect")}
        >
          Verify installed models
        </button>
        <label className="setting-row">
          <span>
            Speech sensitivity
            <small>Lower energy threshold hears quieter speech</small>
          </span>
          <select
            aria-label="Speech sensitivity"
            value={snapshot.settings.threshold}
            disabled={working}
            onChange={(event) =>
              save({ threshold: Number(event.target.value) })
            }
          >
            <option value={0.006}>High · quiet speech</option>
            <option value={0.012}>Balanced</option>
            <option value={0.025}>Low · noisy room</option>
          </select>
        </label>
        <label className="setting-row">
          <span>Finalise after silence</span>
          <select
            aria-label="Silence before finalisation"
            value={snapshot.settings.silenceMs}
            disabled={working}
            onChange={(event) =>
              save({ silenceMs: Number(event.target.value) })
            }
          >
            {[600, 900, 1200, 1500, 2000, 2500].map((value) => (
              <option key={value} value={value}>
                {value} ms
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Maximum speech segment</span>
          <select
            aria-label="Maximum speech segment"
            value={snapshot.settings.maxSegmentMs}
            disabled={working}
            onChange={(event) =>
              save({ maxSegmentMs: Number(event.target.value) })
            }
          >
            {[10000, 12000, 15000].map((value) => (
              <option key={value} value={value}>
                {value / 1000}s
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Segment overlap</span>
          <select
            aria-label="Segment overlap"
            value={snapshot.settings.overlapMs}
            disabled={working}
            onChange={(event) =>
              save({ overlapMs: Number(event.target.value) })
            }
          >
            {[0, 200, 400, 800, 1000].map((value) => (
              <option key={value} value={value}>
                {value} ms
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Transcript retention</span>
          <select
            aria-label="Transcript retention"
            value={snapshot.settings.retentionMinutes}
            disabled={working}
            onChange={(event) =>
              save({ retentionMinutes: Number(event.target.value) })
            }
          >
            {[1, 5, 15, 30, 60].map((value) => (
              <option key={value} value={value}>
                {value} min
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Maximum transcript lines</span>
          <select
            aria-label="Maximum transcript lines"
            value={snapshot.settings.maxEvents}
            disabled={working}
            onChange={(event) =>
              save({ maxEvents: Number(event.target.value) })
            }
          >
            {[20, 50, 100, 200, 500].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Changes pause transcription. Enable it again during authorised audio
          capture. Text is retained in memory only, with a hard limit of 50,000
          characters.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section className="transcription-panel" aria-label="Live transcription">
      <div className="section-heading">
        <h2>Live transcript</h2>
        <span className="transcription-state">
          {snapshot.state.toLowerCase()}
        </span>
      </div>
      <div className="transcription-controls">
        <button
          className="secondary grow"
          disabled={
            !enabled &&
            (!canEnable ||
              working ||
              !snapshot.runtimeInstalled ||
              selected?.state !== "installed")
          }
          onClick={() => action(enabled ? "pause" : "enable")}
        >
          {enabled
            ? "Pause transcription"
            : snapshot.state === "PAUSED"
              ? "Resume transcription"
              : "Enable transcription"}
        </button>
        <button className="secondary" onClick={() => action("clear")}>
          Clear transcript
        </button>
      </div>
      {!canEnable && !enabled && (
        <p className="muted">
          Start authorised audio capture, then enable transcription.
        </p>
      )}
      {(!snapshot.runtimeInstalled || selected?.state !== "installed") && (
        <p className="muted">
          Install the runtime and selected model in EveryHint settings.
        </p>
      )}
      {(error || snapshot.error) && (
        <p className="error" role="alert">
          {error ?? snapshot.error}
        </p>
      )}
      <div
        className="transcript-list"
        ref={list}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {!snapshot.events.length && (
          <p className="muted">
            Local speech will appear here. System audio may include several
            people; labels identify the audio source.
          </p>
        )}
        {snapshot.events.map((event) => (
          <article key={event.id} className={`transcript-line ${event.state}`}>
            <div>
              <strong>
                {event.source === "microphone" ? "Mic" : "System"}
              </strong>
              <time dateTime={new Date(event.startMs).toISOString()}>
                {new Date(event.startMs).toLocaleTimeString()}
              </time>
              <small>
                {event.state === "partial" ? "Provisional" : "Final"}
              </small>
            </div>
            <p>{event.text}</p>
          </article>
        ))}
      </div>
      <details className="diagnostics">
        <summary>Transcription diagnostics</summary>
        <dl className="speech-metrics">
          <dt>Model load</dt>
          <dd>{snapshot.diagnostics.loadMs.toFixed(0)} ms</dd>
          <dt>Average inference</dt>
          <dd>{snapshot.diagnostics.averageLatencyMs.toFixed(0)} ms</dd>
          <dt>Worker queue</dt>
          <dd>{snapshot.diagnostics.queueLength} / 4</dd>
          <dt>Dropped jobs / audio gaps</dt>
          <dd>
            {snapshot.diagnostics.droppedJobs} / {snapshot.diagnostics.gaps}
          </dd>
          <dt>Worker CPU (one-core %)</dt>
          <dd>{snapshot.diagnostics.workerCpuPercent?.toFixed(0) ?? "—"}%</dd>
          <dt>Worker working set</dt>
          <dd>
            {snapshot.diagnostics.workerMemoryBytes
              ? `${(snapshot.diagnostics.workerMemoryBytes / 1048576).toFixed(1)} MiB`
              : "—"}
          </dd>
        </dl>
        <p className="muted">
          Chunk-based partials are revised until final. Overload drops queued
          audio instead of growing memory. CPU can exceed 100% when several
          cores work.
        </p>
      </details>
    </section>
  );
}
