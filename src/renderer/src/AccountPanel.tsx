import { useEffect, useState } from "react";
import type { AccountAction, AccountConnection } from "../../shared/accounts";
import type { ProviderId } from "../../shared/ai";
import { connectionLabel } from "../../shared/connection";
import { useAssistantSnapshot } from "./useAssistantSnapshot";

export function AccountPanel({
  provider = "codex",
}: {
  provider?: ProviderId;
}) {
  const assistant = useAssistantSnapshot();
  const [connection, setConnection] = useState<AccountConnection | null>(null);
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const accept = (next: AccountConnection) =>
      setConnection((old) =>
        !old || next.revision >= old.revision ? next : old,
      );
    const off = window.everyhint.onAccountConnection(accept);
    void window.everyhint.getAccountConnection().then((result) => {
      if (result.ok) accept(result.value);
      else setError(result.error);
    });
    return off;
  }, []);
  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setWorking(true);
    setError("");
    try {
      const result = await task();
      if (!result.ok) throw new Error(result.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const act = (action: AccountAction) =>
    void run(() => window.everyhint.account(action));
  const status = assistant?.providers.find((p) => p.id === "codex");
  const label = error
    ? "Connection problem"
    : connectionLabel(status, connection);
  const selected = connection?.accounts?.find(
    (a) => a.id === connection.selectedAccount,
  );
  const pending =
    working ||
    connection?.state === "signing-in" ||
    connection?.state === "signing-out";
  if (provider === "claude")
    return (
      <p>
        Claude subscription sign-in is unavailable. Its optional API integration
        requires a separate billing opt-in in Advanced.
      </p>
    );
  return (
    <section
      className="account-panel panel-stack"
      aria-label="ChatGPT account connection"
    >
      <div className="section-heading">
        <h2>ChatGPT</h2>
        <span className="status-pill" role="status">
          {label}
        </span>
      </div>
      {selected?.signedIn && <p>{selected.label}</p>}
      <div className="button-row">
        {label !== "Ready" && (
          <button
            className="primary"
            disabled={pending || !connection}
            onClick={() => {
              if (connection?.planUsage && selected?.signedIn)
                void run(() => window.everyhint.discoverModels());
              else act("grant-plan");
            }}
          >
            {connection?.planUsage && selected?.signedIn
              ? "Set up model"
              : "Connect ChatGPT"}
          </button>
        )}
        {connection?.state === "signing-in" && (
          <button onClick={() => act("cancel")}>Cancel sign-in</button>
        )}
        {selected?.signedIn && (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => act("sign-out")}
          >
            Sign out
          </button>
        )}
      </div>
      {label !== "Ready" && (
        <small>
          Connect in your browser, then check available models. No question is
          sent.
        </small>
      )}
      {status?.selectedModel && (
        <small>
          Model:{" "}
          {status.modelDetails?.find((m) => m.id === status.selectedModel)
            ?.name ?? status.selectedModel}
          . Availability checked against your account’s catalog; answer access
          is confirmed by a completed response.
        </small>
      )}
      <details>
        <summary>Choose account or model</summary>
        <div className="panel-stack">
          <label>
            ChatGPT account
            <select
              aria-label="ChatGPT registration"
              value={connection?.selectedAccount ?? "new"}
              disabled={pending}
              onChange={(e) =>
                void run(() =>
                  window.everyhint.selectChatgptAccount(e.target.value),
                )
              }
            >
              <option value="new">Add account</option>
              {connection?.accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.signedIn ? "" : " · signed out"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select
              aria-label="ChatGPT model"
              value={status?.selectedModel ?? ""}
              disabled={pending || !status?.modelDetails?.length}
              onChange={(e) =>
                void run(() => window.everyhint.selectModel(e.target.value))
              }
            >
              <option value="" disabled>
                Set up a model first
              </option>
              {status?.modelDetails?.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={pending || !connection?.planUsage}
            onClick={() => void run(() => window.everyhint.discoverModels())}
          >
            Refresh available models
          </button>
          <small>
            Refresh requests your authorised model list from OpenAI. It does not
            send conversation content.
          </small>
        </div>
      </details>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
