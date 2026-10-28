import { createHash } from "node:crypto";
import { AsyncEntry } from "@napi-rs/keyring";
import { KeyringVault, type CredentialVault } from "../ai/plan/vault";
import type { GoogleConnection, GoogleService } from "../../shared/workspace";
import {
  GoogleOAuth,
  googleLoopback,
  storedGoogleTokens,
  type GoogleTokens,
} from "./oauth";
import {
  googleError,
  googleFetch,
  GoogleError,
  limitedJson,
  type GoogleFetch,
} from "./http";

export class GoogleAccount {
  private tokens: GoogleTokens | null = null;
  private abort?: AbortController;
  private operation?: Promise<unknown>;
  private generation = 0;
  private closed = false;
  private state: GoogleConnection;
  constructor(
    readonly service: GoogleService,
    private vault: CredentialVault,
    private openBrowser: (url: string) => Promise<void>,
    private changed: () => void,
    private oauth = new GoogleOAuth(),
    private transport: GoogleFetch = googleFetch,
    private now: () => number = Date.now,
  ) {
    this.state = {
      service,
      state: "disconnected",
      subject: null,
      email: null,
      message:
        "Configure a Google Desktop OAuth client and connect explicitly.",
      configured: false,
    };
  }
  static forProfile(
    profile: string,
    service: GoogleService,
    openBrowser: (url: string) => Promise<void>,
    changed: () => void,
  ) {
    const owner = createHash("sha256")
      .update(`${profile}/${service}`)
      .digest("hex");
    return new GoogleAccount(
      service,
      new KeyringVault(
        (slot) =>
          new AsyncEntry("EveryHint.GoogleOAuth.v1", `${owner}/${slot}`),
      ),
      openBrowser,
      changed,
    );
  }
  get value(): GoogleConnection {
    return structuredClone(this.state);
  }
  get subject(): string | null {
    return this.tokens?.subject ?? null;
  }
  private publish(message?: string) {
    if (message) this.state.message = message;
    if (!this.closed) this.changed();
  }
  async restore(clientId: string): Promise<void> {
    this.state.configured = Boolean(clientId);
    try {
      const content = await this.vault.read();
      if (this.closed) return;
      if (content) {
        const tokens = storedGoogleTokens(JSON.parse(content), this.service);
        if (tokens.clientId !== clientId) {
          this.state.message =
            "Client configuration changed; disconnect the previous grant before reconnecting.";
        } else {
          this.tokens = tokens;
          this.state = {
            service: this.service,
            state: "connected",
            subject: tokens.subject,
            email: tokens.email,
            message:
              "OS-protected Google connection restored. No data was fetched by restoring sign-in.",
            configured: true,
          };
        }
      }
      this.publish();
    } catch {
      this.state.state = "error";
      this.publish(
        "Google credential storage could not be restored. No plaintext fallback is used.",
      );
    }
  }
  connect(clientId: string): Promise<void> {
    if (this.operation || this.closed)
      return Promise.reject(
        new Error("Wait for the current Google account operation."),
      );
    const generation = ++this.generation,
      previous = this.tokens,
      abort = new AbortController();
    this.abort = abort;
    const timer = setTimeout(() => abort.abort(), 5 * 60000);
    this.state.state = "connecting";
    this.state.configured = Boolean(clientId);
    this.publish(
      "Complete the selected read-only Google permission in your system browser. Contacts and Calendar are separate connections.",
    );
    this.operation = (async () => {
      try {
        const callback = await googleLoopback(
            clientId,
            this.service,
            this.openBrowser,
            abort.signal,
          ),
          tokens = await this.oauth.exchange(
            callback.attempt,
            callback.code,
            abort.signal,
          );
        if (
          generation !== this.generation ||
          abort.signal.aborted ||
          this.closed
        )
          throw new Error("Google sign-in cancelled.");
        await this.vault.write(JSON.stringify(tokens));
        if (
          generation !== this.generation ||
          abort.signal.aborted ||
          this.closed
        ) {
          if (previous) await this.vault.write(JSON.stringify(previous));
          else await this.vault.clear();
          throw new Error("Google sign-in cancelled before commit.");
        }
        this.tokens = tokens;
        this.state = {
          service: this.service,
          state: "connected",
          subject: tokens.subject,
          email: tokens.email,
          configured: true,
          message:
            "Google read-only permission connected. No OpenAI sharing was authorised.",
        };
        this.publish();
      } catch (error) {
        this.tokens = previous;
        this.state = {
          service: this.service,
          state: previous ? "connected" : "error",
          subject: previous?.subject ?? null,
          email: previous?.email ?? null,
          configured: Boolean(clientId),
          message:
            error instanceof GoogleError
              ? error.message
              : abort.signal.aborted
                ? "Google sign-in cancelled. No new grant was committed."
                : "Google sign-in could not be verified. Check the Desktop client, read-only consent and enabled APIs.",
        };
        this.publish();
        throw new Error(this.state.message, { cause: error });
      } finally {
        clearTimeout(timer);
        this.abort = undefined;
        this.operation = undefined;
      }
    })();
    return this.operation as Promise<void>;
  }
  cancel(): void {
    this.generation++;
    this.abort?.abort();
  }
  async disconnect(): Promise<void> {
    this.cancel();
    await this.operation?.catch(() => {});
    const tokens = this.tokens;
    this.tokens = null;
    let revocationError: unknown;
    try {
      if (tokens) await this.oauth.revoke(tokens);
    } catch (error) {
      revocationError = error;
    }
    await this.vault.clear();
    this.state = {
      service: this.service,
      state: "disconnected",
      subject: null,
      email: null,
      configured: this.state.configured,
      message: revocationError
        ? "Local Google sign-out completed. Remote revocation was not confirmed; review Google account app permissions."
        : "Google access disconnected/revoked. Project-wide revocation can also invalidate the other Google connection.",
    };
    this.publish();
    if (revocationError)
      throw new Error(this.state.message, { cause: revocationError });
  }
  private async token(
    signal: AbortSignal,
    force = false,
  ): Promise<GoogleTokens> {
    if (!this.tokens || this.closed || this.operation)
      throw new Error("Connect this Google permission before requesting data.");
    const previous = this.tokens;
    if (!force && previous.expiresAt > this.now() + 60000) return previous;
    const generation = this.generation;
    try {
      const tokens = await this.oauth.refresh(previous, this.service, signal);
      if (signal.aborted || generation !== this.generation || this.closed)
        throw new Error("Google refresh cancelled.");
      await this.vault.write(JSON.stringify(tokens));
      if (signal.aborted || generation !== this.generation || this.closed)
        throw new Error("Google refresh scope changed.");
      this.tokens = tokens;
      this.state.state = "connected";
      this.publish();
      return tokens;
    } catch (error) {
      if (
        error instanceof GoogleError &&
        (error.reason === "invalid_grant" || error.status === 401)
      ) {
        this.tokens = null;
        await this.vault.clear();
        this.state.state = "error";
        this.state.subject = null;
        this.state.email = null;
        this.publish(error.message);
      }
      throw error;
    }
  }
  async read(url: string, signal: AbortSignal): Promise<unknown> {
    const generation = this.generation;
    for (let attempt = 0; attempt < 2; attempt++) {
      const tokens = await this.token(signal, attempt === 1);
      if (generation !== this.generation || signal.aborted)
        throw new Error("Google read cancelled.");
      const response = await this.transport(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: "application/json",
        },
        signal,
      });
      if (generation !== this.generation || signal.aborted)
        throw new Error("Google read scope changed.");
      if (response.ok) return limitedJson(response, 2 * 1024 * 1024);
      const error = await googleError(response);
      if (response.status === 401 && attempt === 0) continue;
      if (
        response.status === 401 ||
        (response.status === 403 && !error.retryAfterMs)
      ) {
        this.tokens = null;
        await this.vault.clear();
        this.state.state = "error";
        this.state.subject = null;
        this.state.email = null;
        this.publish(error.message);
      }
      throw error;
    }
    throw new Error("Google permission is unavailable.");
  }
  async close(): Promise<void> {
    this.closed = true;
    this.cancel();
    await this.operation?.catch(() => {});
    this.tokens = null;
  }
}
