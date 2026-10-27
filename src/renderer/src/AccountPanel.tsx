import { useEffect, useState } from "react";
import type { AccountAction, AccountConnection } from "../../shared/accounts";
import type { ProviderId } from "../../shared/ai";

export function AccountPanel({ provider }: { provider: ProviderId }) {
  const [connection, setConnection] = useState<AccountConnection | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const accept = (value: AccountConnection): void =>
      setConnection((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const off = window.everyhint.onAccountConnection(accept);
    void window.everyhint
      .getAccountConnection()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        accept(result.value);
      })
      .catch(() => setError("Could not read account connection."));
    return off;
  }, []);
  async function act(action: AccountAction): Promise<void> {
    setWorking(true);
    setError(null);
    try {
      const result = await window.everyhint.account(action);
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Account connection failed.",
      );
    } finally {
      setWorking(false);
    }
  }
  if (provider === "claude")
    return (
      <div className="context-review" aria-label="Claude account connection">
        <strong>Claude account sign-in</strong>
        <button
          className="secondary"
          disabled
          title="Anthropic approval is required for third-party Claude subscription sign-in"
        >
          Sign in with Claude — unavailable
        </button>
        <p className="muted">
          Anthropic requires approval before apps like EveryHint can offer
          Claude subscription sign-in. This app has no such approval. The API
          option below uses separate billing and stays disabled until you opt
          in.
        </p>
      </div>
    );
  const pending =
    connection?.state === "signing-in" || connection?.state === "signing-out";
  return (
    <div className="context-review" aria-label="ChatGPT account connection">
      <strong>ChatGPT account</strong>
      <p role="status">
        {connection?.message ?? "Reading account connection…"}
      </p>
      <div className="ai-actions">
        <button
          className="primary"
          disabled={working || pending || !connection}
          onClick={() => void act("sign-in")}
        >
          {connection?.state === "signed-in"
            ? "Switch ChatGPT account"
            : "Sign in with ChatGPT"}
        </button>
        {pending ? (
          <button className="secondary" onClick={() => void act("cancel")}>
            {connection?.state === "signing-out"
              ? "Cancel sign-out"
              : "Cancel sign-in"}
          </button>
        ) : (
          <button
            className="secondary"
            disabled={working || connection?.state !== "signed-in"}
            onClick={() => void act("sign-out")}
          >
            Sign out of ChatGPT
          </button>
        )}
      </div>
      <small>
        Your browser handles sign-in. Credentials are saved by the official
        Codex client in your operating-system credential store for EveryHint
        only. Signing in does not send a question or enable API billing.
      </small>
      <p className="muted">
        ChatGPT sign-in connects your account. Answers through Codex are still
        unavailable until its response-only permission limitation is resolved.
      </p>
      {(error || connection?.state === "error") && (
        <p className="error-message" role="alert">
          {error ?? connection?.message}
        </p>
      )}
    </div>
  );
}
