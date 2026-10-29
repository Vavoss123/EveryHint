import { useEffect, useState } from "react";
import type { PersonalState } from "../../shared/personal";

export function usePersonal() {
  const [state, setState] = useState<PersonalState | null>(null);
  useEffect(() => {
    const accept = (next: PersonalState) =>
      setState((old) => (!old || next.revision >= old.revision ? next : old));
    const off = window.everyhint.personal.onState(accept);
    void window.everyhint.personal.get().then((r) => {
      if (r.ok) accept(r.value);
    });
    return off;
  }, []);
  return state;
}
export async function personalCommand(
  state: PersonalState,
  value: Parameters<typeof window.everyhint.personal.command>[0]["value"],
) {
  const result = await window.everyhint.personal.command({
    scopeId: state.scopeId,
    value,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function ModeSelector() {
  const state = usePersonal(),
    [error, setError] = useState("");
  if (!state) return null;
  return (
    <div className="mode-selector">
      <label>
        AI mode{" "}
        <select
          aria-label="Active AI mode"
          value={state.config.activeModeId}
          onChange={(e) => {
            setError("");
            void personalCommand(state, {
              type: "select",
              id: e.target.value,
            }).catch((e) => setError(String(e.message)));
          }}
        >
          {state.config.modes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
