import { useState } from "react";
import type { ProviderId } from "../../shared/ai";
import { useAssistantSnapshot } from "./useAssistantSnapshot";

function unwrap<T>(
  r: { ok: true; value: T } | { ok: false; error: string },
): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
function useTask() {
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
  return { busy, error, run };
}
/** Claude API key and model, shown beside the ChatGPT account. */
export function ClaudePanel() {
  const snapshot = useAssistantSnapshot();
  const { busy, error, run } = useTask();
  const [key, setKey] = useState("");
  if (!snapshot) return null;
  const claude = snapshot.providers.find((p) => p.id === "claude")!;
  const active = snapshot.responses.some(
    (r) => r.status === "sending" || r.status === "generating",
  );
  const ready = claude.auth === "api-key" && snapshot.claudeApiBilling;
  return (
    <section
      className="account-panel panel-stack"
      aria-label="Claude API connection"
    >
      <div className="section-heading">
        <h2>Claude</h2>
        <span className="status-pill" role="status">
          {ready
            ? "Ready"
            : claude.auth === "api-key"
              ? "Key found · not enabled"
              : "No API key"}
        </span>
      </div>
      <form
        className="panel-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            unwrap(await window.everyhint.setClaudeKey(key));
            setKey("");
          });
        }}
      >
        <label>
          Anthropic API key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              claude.auth === "api-key"
                ? "Saved · paste to replace"
                : "sk-ant-…"
            }
            value={key}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <small>
          Create a key at console.anthropic.com. It is stored in your operating
          system's credential store, and saving it turns Claude on. Requests are
          billed to your Anthropic API account.
        </small>
        <div className="button-row">
          <button
            type="submit"
            className="primary"
            disabled={busy || !key.trim()}
          >
            Save key
          </button>
          {claude.auth === "api-key" && (
            <button
              type="button"
              className="secondary"
              disabled={busy || active}
              onClick={() =>
                void run(async () =>
                  unwrap(await window.everyhint.setClaudeKey(null)),
                )
              }
            >
              Remove key
            </button>
          )}
        </div>
      </form>
      <label>
        Claude model
        <select
          aria-label="Claude model"
          value={claude.selectedModel ?? ""}
          disabled={busy || active || !claude.modelDetails?.length}
          onChange={(event) => {
            const id = event.target.value;
            void run(async () =>
              unwrap(await window.everyhint.selectModel(id)),
            );
          }}
        >
          {claude.modelDetails?.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
/** Provider choice, ChatGPT model list and the environment-key opt-in. */
export function ProviderSettings() {
  const snapshot = useAssistantSnapshot();
  const { busy, error, run } = useTask();
  if (!snapshot) return null;
  const selected = snapshot.providers.find((p) => p.id === snapshot.selected)!;
  const chatgpt = snapshot.providers.find((p) => p.id === "codex")!;
  const active = snapshot.responses.some(
    (r) => r.status === "sending" || r.status === "generating",
  );
  return (
    <section aria-label="Advanced provider settings">
      <details className="assistant-connection">
        <summary>
          AI provider · {snapshot.selected === "codex" ? "ChatGPT" : "Claude"} ·{" "}
          {selected.ready ? "Ready" : "Not ready"}
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
          <strong>{selected.ready ? "Ready" : "Not ready"}</strong> ·{" "}
          {selected.message}
        </p>
        <div className="context-review">
          <button
            className="secondary"
            disabled={busy || active || chatgpt.auth !== "chatgpt"}
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
            not submit a question. Model access can still be denied when asking.
          </small>
          <label>
            ChatGPT model
            <select
              aria-label="ChatGPT model"
              value={chatgpt.selectedModel ?? ""}
              disabled={busy || active || !chatgpt.modelDetails?.length}
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
              {chatgpt.modelDetails?.map((model) => (
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
            Use ANTHROPIC_API_KEY from the environment for this app session.
            Requests are billed to that Anthropic API account. A key saved in
            Account &amp; AI turns this on automatically.
          </span>
        </label>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
