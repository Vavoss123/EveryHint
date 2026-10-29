import { useEffect, useState } from "react";
import type { AppSnapshot, Settings } from "../../shared/contracts";
import type { DesktopStatus } from "../../shared/desktop";
import type { UpdateAction } from "../../shared/updates";

export function DesktopPrivacy({
  app,
  save,
  updatesOnly = false,
}: {
  app: AppSnapshot;
  save: (value: Partial<Settings>) => void;
  updatesOnly?: boolean;
}) {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const unsubscribe = window.everyhint.onUpdates((updates) =>
      setStatus((previous) => (previous ? { ...previous, updates } : previous)),
    );
    void window.everyhint.desktopStatus().then((result) => {
      if (result.ok) setStatus(result.value);
      else setError(result.error);
    });
    return unsubscribe;
  }, []);
  const update = async (action: UpdateAction): Promise<void> => {
    setError("");
    const result = await window.everyhint.update(action);
    if (result.ok)
      setStatus((previous) =>
        previous ? { ...previous, updates: result.value } : previous,
      );
    else setError(result.error);
  };
  const updateState = status?.updates.state;
  const updateBusy =
    updateState === "checking" ||
    updateState === "downloading" ||
    updateState === "cancelling" ||
    updateState === "installing";
  return (
    <section
      className="card panel-stack desktop-privacy"
      aria-label="Desktop privacy and updates"
    >
      {!updatesOnly && (
        <>
          <h2>Window Content Protection</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={app.settings.protectWindow === true}
              onChange={(event) =>
                save({ protectWindow: event.target.checked })
              }
            />
            Window Content Protection (Windows)
          </label>
          <p role="status">
            {app.privacy?.state === "configured"
              ? "Windows capture exclusion is configured."
              : app.privacy?.state === "off"
                ? "Capture exclusion is off."
                : (app.privacy?.message ??
                  "Protection has not been confirmed.")}
          </p>
          <small>
            Other capture methods can still include EveryHint. Confirm on a
            receiving device before sharing sensitive content.
          </small>
          <details>
            <summary>Screen-sharing privacy details</summary>
            <p>
              Hide to Tray removes the local window. Minimise leaves it
              available on the taskbar. Sharing a specific application window
              limits the selected source. Windows capture exclusion asks
              supported capture methods to omit EveryHint’s windows.
            </p>
            <p>
              These are separate controls. Discord, Teams, Zoom and recorder
              compatibility must be checked on real receiving devices.
              Protection never guarantees invisibility.
            </p>
            <p>{app.privacy?.message}</p>
          </details>
        </>
      )}
      {updatesOnly && (
        <>
          <h3>Version and updates</h3>
          <p>
            EveryHint {status?.version ?? "…"}
            {status
              ? ` · ${status.platform} ${status.arch} · ${status.packaged ? "Packaged application" : "Development build"}`
              : ""}
          </p>
          <p role="status">
            {status?.updates.message ?? "Reading local update configuration…"}
          </p>
          {status?.updates.progress !== null &&
            status?.updates.progress !== undefined && (
              <progress
                max={100}
                value={status.updates.progress}
                aria-label="Update download progress"
              />
            )}
          <div className="button-row">
            <button
              disabled={!status || updateState === "unconfigured" || updateBusy}
              onClick={() => void update("check")}
            >
              Check for updates
            </button>
            {updateState === "available" && (
              <button onClick={() => void update("download")}>
                Download {status?.updates.availableVersion}
              </button>
            )}
            {updateState === "downloaded" && (
              <button onClick={() => void update("install")}>
                Restart and install
              </button>
            )}
            {(updateState === "checking" || updateState === "downloading") && (
              <button onClick={() => void update("cancel")}>
                Cancel update
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
