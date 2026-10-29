import { useState } from "react";
import type { ProviderId } from "../../shared/ai";
import { useAssistantSnapshot } from "./useAssistantSnapshot";
export function ProviderSettings() {
  const snapshot = useAssistantSnapshot();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function unwrap<T>(
    r: { ok: true; value: T } | { ok: false; error: string },
  ): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
  if (!snapshot) return null;
  const selected = snapshot.providers.find((p) => p.id === snapshot.selected)!;
  const active = snapshot.responses.some(
    (r) => r.status === "sending" || r.status === "generating",
  );
  return (
    <section aria-label="Advanced provider settings">
      {" "}
      <details className="assistant-connection">
        <summary>
          {snapshot.selected === "codex" ? "ChatGPT plan" : "Claude API"} ·{" "}
          {selected.ready ? "Ready" : "Connection settings"}
        </summary>
        <div className="provider-row">
          <label htmlFor="ai-provider">AI provider</label>
          <select
            id="ai-provider"
            aria-label="AI provider"
            value={snapshot.selected}
            disabled={busy}
            onChange={(event) => {
              void run(async () =>
                unwrap(
                  await window.everyhint.selectProvider(
                    event.target.value as ProviderId,
                  ),
                ),
              );
            }}
          >
            <option value="codex">ChatGPT · plan usage</option>
            <option value="claude">Claude · API billing</option>
          </select>
        </div>
        <p className="provider-status" role="status">
          <strong>{selected.ready ? "Ready" : "Not connected"}</strong> ·{" "}
          {selected.message}
        </p>
        {snapshot.selected === "codex" && (
          <div className="context-review">
            <button
              className="secondary"
              disabled={busy || active || selected.auth !== "chatgpt"}
              onClick={() =>
                void run(async () =>
                  unwrap(await window.everyhint.discoverModels()),
                )
              }
            >
              Refresh ChatGPT models
            </button>
            <small>
              Refresh sends an authorised model-list request to OpenAI. It does
              not submit a question. Model access can still be denied when
              asking.
            </small>
            <label>
              ChatGPT model
              <select
                aria-label="ChatGPT model"
                value={selected.selectedModel ?? ""}
                disabled={busy || active || !selected.modelDetails?.length}
                onChange={(event) => {
                  const id = event.target.value;
                  void run(async () =>
                    unwrap(await window.everyhint.selectModel(id)),
                  );
                }}
              >
                <option value="" disabled>
                  Choose a model
                </option>
                {selected.modelDetails?.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.images
                      ? " · images supported"
                      : " · image support unconfirmed"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button
          className="secondary"
          disabled={busy || active}
          onClick={() =>
            void run(async () =>
              unwrap(await window.everyhint.inspectProviders()),
            )
          }
        >
          Check connection
        </button>
        {snapshot.selected === "claude" && (
          <label className="ai-choice billing-choice">
            <input
              type="checkbox"
              checked={snapshot.claudeApiBilling}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                void run(async () =>
                  unwrap(await window.everyhint.setClaudeApiBilling(enabled)),
                );
              }}
            />
            <span>
              Enable separately billed Claude API requests for this app session.
              My Claude subscription is not used.
            </span>
          </label>
        )}
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
