import { useState } from "react";
import type { Settings } from "../../shared/contracts";
import { AccountPanel } from "./AccountPanel";
import { ClaudePanel } from "./ProviderSettings";

export function SetupWizard({
  settings,
  complete,
}: {
  settings: Settings;
  complete: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [sources, setSources] = useState(
    settings.preferredSources ?? {
      microphone: true,
      systemAudio: true,
      screen: true,
    },
  );
  return (
    <section className="setup-wizard panel-stack" aria-label="EveryHint setup">
      <span className="eyebrow">WELCOME TO EVERYHINT · {step} OF 2</span>
      <h1>{step === 1 ? "Connect AI" : "Choose your sources"}</h1>
      {step === 1 && (
        <>
          <p className="muted">
            Connect ChatGPT, add a Claude API key, or both. You choose which one
            answers each time you start.
          </p>
          <AccountPanel />
          <ClaudePanel />
        </>
      )}
      {step === 2 && (
        <>
          <p className="muted">
            Remember your choices. You’ll approve capture for each session.
          </p>
          {(
            [
              ["microphone", "Microphone", "Hear what you say."],
              [
                "systemAudio",
                "System audio",
                "Hear the conversation playing on your computer.",
              ],
              ["screen", "Screen", "See the screen or application you choose."],
            ] as const
          ).map(([id, title, text]) => (
            <label className="consent-row" key={id}>
              <input
                type="checkbox"
                checked={sources[id]}
                onChange={(e) =>
                  setSources({ ...sources, [id]: e.target.checked })
                }
              />
              <span>
                {title}
                <small>{text}</small>
              </span>
            </label>
          ))}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        {step > 1 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            {step === 1 ? "Continue · AI can be connected later" : "Continue"}
          </button>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await complete({
                  setupComplete: true,
                  preferredSources: sources,
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Finish setup
          </button>
        )}
      </div>
    </section>
  );
}
