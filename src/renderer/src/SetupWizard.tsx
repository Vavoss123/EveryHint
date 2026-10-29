import { useState } from "react";
import type { Settings } from "../../shared/contracts";
import type { OperatingMode } from "../../shared/intelligence";
import { AccountPanel } from "./AccountPanel";

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
      systemAudio: false,
      screen: false,
    },
  );
  const [help, setHelp] = useState<OperatingMode>(
    settings.preferredHelp ?? "manual",
  );
  return (
    <section className="setup-wizard panel-stack" aria-label="EveryHint setup">
      <span className="eyebrow">WELCOME TO EVERYHINT · {step} OF 3</span>
      <h1>
        {step === 1
          ? "Connect AI"
          : step === 2
            ? "Choose your sources"
            : "How can EveryHint help?"}
      </h1>
      {step === 1 && <AccountPanel />}
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
      {step === 3 && (
        <>
          <div className="help-choices">
            {(
              [
                [
                  "manual",
                  "Ask manually",
                  "Review and send each question yourself.",
                ],
                [
                  "auto-hint",
                  "Suggest answers",
                  "Spot useful moments locally. Review before sending.",
                ],
                [
                  "live",
                  "Live assistance",
                  "Make automatic remote AI requests only within your separately authorised, time-limited session.",
                ],
              ] as const
            ).map(([id, title, text]) => (
              <label
                className={`consent-row ${help === id ? "selected" : ""}`}
                key={id}
              >
                <input
                  type="radio"
                  name="help"
                  checked={help === id}
                  onChange={() => setHelp(id)}
                />
                <span>
                  {title}
                  <small>{text}</small>
                </span>
              </label>
            ))}
          </div>
          <small>
            These preferences grant no recording or remote-sharing permission.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        {step > 1 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 3 ? (
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
                  preferredHelp: help,
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
