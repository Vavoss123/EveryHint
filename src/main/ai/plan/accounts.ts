import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AccountConnection } from "../../../shared/accounts";
import { record } from "../../../shared/validation";
import { ProviderError } from "../errors";
import { PlanHttpError } from "./http";
import {
  authorizationUrl,
  callbackCode,
  ISSUER,
  newAttempt,
  OpenAIOAuth,
  planAllowed,
  type PlanRegistration,
  type PlanTokens,
} from "./oauth";
import { KeyringVault, type CredentialVault } from "./vault";

type OAuth = Pick<OpenAIOAuth, "exchange" | "refresh" | "revoke">;
interface Stored {
  version: 1;
  hostId: string;
  selected: string | null;
  registrations: PlanRegistration[];
}
const hostPattern = /^urn:uuid:[a-f0-9-]{36}$/;
const terminalRefresh = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);
function stored(text: string): Stored {
  const value = record(JSON.parse(text));
  if (
    value.version !== 1 ||
    typeof value.hostId !== "string" ||
    !hostPattern.test(value.hostId) ||
    !Array.isArray(value.registrations) ||
    value.registrations.length > 4
  )
    throw new Error("Invalid account record.");
  const ids = new Set<string>();
  for (const item of value.registrations) {
    const account = record(item);
    if (
      typeof account.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(account.id) ||
      ids.has(account.id) ||
      account.issuer !== ISSUER ||
      typeof account.clientId !== "string" ||
      !/^[\w.:-]{1,200}$/.test(account.clientId) ||
      account.clientId === "dynamic_agent_client" ||
      typeof account.subject !== "string" ||
      !account.subject ||
      account.subject.length > 1000 ||
      (account.email !== null &&
        (typeof account.email !== "string" || account.email.length > 254))
    )
      throw new Error("Invalid account registration.");
    ids.add(account.id);
    if (account.tokens !== null) {
      const tokens = record(account.tokens);
      if (
        ["accessToken", "idToken"].some(
          (key) =>
            typeof tokens[key] !== "string" ||
            !(tokens[key] as string).length ||
            (tokens[key] as string).length > 24000,
        ) ||
        (tokens.refreshToken !== null &&
          (typeof tokens.refreshToken !== "string" ||
            tokens.refreshToken.length > 24000)) ||
        !Array.isArray(tokens.scopes) ||
        tokens.scopes.length > 40 ||
        tokens.scopes.some(
          (scope) => typeof scope !== "string" || scope.length > 128,
        ) ||
        typeof tokens.expiresAt !== "number" ||
        !Number.isFinite(tokens.expiresAt) ||
        typeof tokens.earliestRefreshAt !== "number" ||
        !Number.isFinite(tokens.earliestRefreshAt)
      )
        throw new Error("Invalid account session.");
    }
  }
  if (
    value.selected !== null &&
    (typeof value.selected !== "string" || !ids.has(value.selected))
  )
    throw new Error("Invalid account selection.");
  return value as unknown as Stored;
}

// All tokens and registration bindings stay in main and the native OS vault.
// Construction/restoration never contact OpenAI. Only explicit UI actions do.
export class ChatGptAccounts {
  private registrations: PlanRegistration[] = [];
  private selected: string | null = null;
  private hostId: string | undefined;
  private revision = 0;
  private state: AccountConnection["state"] = "signed-out";
  private message =
    "Continue with ChatGPT to grant EveryHint permission to use your plan.";
  private job:
    | {
        abort: AbortController;
        server: Server;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private refreshing:
    | { id: string; abort: AbortController; promise: Promise<PlanTokens> }
    | undefined;
  private generation = 0;
  private closed = false;
  private restored = false;
  private readonly vault: CredentialVault;
  private readonly oauth: OAuth;
  private readonly now: () => number;
  constructor(
    private readonly home: string,
    private readonly changed: (value: AccountConnection) => void,
    private readonly openBrowser: (url: string) => Promise<unknown>,
    options: {
      vault?: CredentialVault;
      oauth?: OAuth;
      now?: () => number;
      loginTimeoutMs?: number;
    } = {},
  ) {
    this.vault = options.vault ?? KeyringVault.forInstallation(home);
    this.oauth = options.oauth ?? new OpenAIOAuth();
    this.now = options.now ?? Date.now;
    this.loginTimeoutMs = options.loginTimeoutMs ?? 5 * 60000;
  }
  private readonly loginTimeoutMs: number;
  get registration(): PlanRegistration | undefined {
    return this.registrations.find((item) => item.id === this.selected);
  }
  get identity(): string | null {
    return this.registration?.id ?? null;
  }
  get value(): AccountConnection {
    return {
      revision: this.revision,
      state: this.state,
      message: this.message,
      planUsage: planAllowed(this.registration?.tokens ?? null),
      selectedAccount: this.selected,
      accounts: this.registrations.map((item) => ({
        id: item.id,
        label: `${
          item.email
            ? Array.from(item.email)
                .filter(
                  (character) =>
                    character.charCodeAt(0) >= 32 &&
                    character.charCodeAt(0) !== 127,
                )
                .join("")
            : "ChatGPT account"
        } · ${item.id.slice(0, 8)}`,
        signedIn: Boolean(item.tokens),
      })),
    };
  }
  private publish(state: AccountConnection["state"], message: string): void {
    if (this.closed) return;
    this.state = state;
    this.message = message;
    this.revision++;
    this.changed(this.value);
  }
  private localStatus(): void {
    const tokens = this.registration?.tokens;
    this.publish(
      tokens ? "signed-in" : "signed-out",
      tokens
        ? planAllowed(tokens)
          ? "ChatGPT plan permission granted. Refresh models explicitly before asking; model access is verified by a completed response."
          : "Identity connected, but ChatGPT plan permission is missing. Grant plan permission before requesting models or answers."
        : "Continue with ChatGPT to grant EveryHint permission to use your plan.",
    );
  }
  async restore(): Promise<void> {
    if (this.restored) return;
    try {
      const text = await this.vault.read();
      if (text !== null) {
        const value = stored(text);
        this.registrations = value.registrations;
        this.selected = value.selected;
        this.hostId = value.hostId;
      }
      this.restored = true;
      this.localStatus();
    } catch {
      this.publish(
        "error",
        "Could not restore the OS-protected ChatGPT registration. No credential file or API-key fallback is used.",
      );
    }
  }
  private async ensureHost(): Promise<string> {
    await mkdir(this.home, { recursive: true });
    const path = join(this.home, "host-id");
    try {
      const value = (await readFile(path, "utf8")).trim();
      if (!hostPattern.test(value) || (this.hostId && this.hostId !== value))
        throw new Error("Host identity mismatch.");
      this.hostId = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new ProviderError(
          "auth",
          "EveryHint’s saved installation identity is invalid. Sign-in was stopped.",
        );
      this.hostId ??= `urn:uuid:${randomUUID()}`;
      await writeFile(path, this.hostId, { flag: "wx", mode: 0o600 });
    }
    return this.hostId;
  }
  private async save(
    registrations = this.registrations,
    selected = this.selected,
  ): Promise<void> {
    if (!this.hostId) throw new Error("Missing installation identity.");
    await this.vault.write(
      JSON.stringify({
        version: 1,
        hostId: this.hostId,
        selected,
        registrations,
      } satisfies Stored),
    );
  }
  async select(id: unknown): Promise<void> {
    if (this.state === "signing-out")
      throw new Error("Wait for ChatGPT sign-out to finish.");
    if (
      typeof id !== "string" ||
      (id !== "new" && !this.registrations.some((item) => item.id === id))
    )
      throw new Error("Choose a saved ChatGPT registration or Add account.");
    this.cancel();
    const previous = this.selected;
    this.selected = id === "new" ? null : id;
    if (this.hostId) {
      try {
        await this.save();
      } catch {
        this.selected = previous;
        this.localStatus();
        throw new Error(
          "Could not save the account selection in the OS credential store.",
        );
      }
    }
    this.localStatus();
  }
  async signIn(consent = false): Promise<void> {
    if (!this.restored || this.closed)
      throw new Error("The operating-system account store is unavailable.");
    if (this.job || this.state === "signing-in" || this.state === "signing-out")
      throw new Error("A ChatGPT account operation is already in progress.");
    if (!this.registration && this.registrations.length >= 4)
      throw new Error(
        "This installation already has four registrations. Select a saved registration.",
      );
    this.cancel();
    const generation = this.generation;
    const previous = this.registration;
    const abort = new AbortController();
    const server = createServer();
    this.publish(
      "signing-in",
      "Complete ChatGPT sign-in and plan consent in your browser. No question is sent by signing in.",
    );
    try {
      const hostId = await this.ensureHost();
      if (generation !== this.generation) return;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      if (generation !== this.generation) {
        server.close();
        return;
      }
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Loopback listener unavailable.");
      const attempt = newAttempt(
        hostId,
        `http://127.0.0.1:${address.port}/auth/callback`,
        previous?.clientId ?? null,
      );
      let consumed = false;
      server.headersTimeout = 10000;
      server.requestTimeout = 10000;
      server.maxHeadersCount = 30;
      server.on("request", (request, response) => {
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader(
          "content-security-policy",
          "default-src 'none'; frame-ancestors 'none'",
        );
        if (
          consumed ||
          request.method !== "GET" ||
          !request.url ||
          request.url.length > 16384 ||
          request.headers.host !== `127.0.0.1:${address.port}`
        ) {
          response.writeHead(400).end("Invalid sign-in callback.");
          return;
        }
        let result: ReturnType<typeof callbackCode>;
        try {
          result = callbackCode(
            new URL(request.url, attempt.redirectUri),
            attempt,
          );
        } catch (error) {
          response
            .writeHead(400)
            .end(
              "Sign-in could not be verified. Return to EveryHint to cancel or try again.",
            );
          if (error instanceof ProviderError && error.code === "permissions") {
            consumed = true;
            this.stopJob(false);
            this.publish("error", error.message);
          }
          return;
        }
        consumed = true;
        void (async () => {
          try {
            const session = await this.oauth.exchange(
              attempt,
              result.code,
              result.clientId,
              abort.signal,
              previous,
            );
            if (generation !== this.generation || abort.signal.aborted) return;
            const registration: PlanRegistration = {
              id: previous?.id ?? randomUUID(),
              clientId: result.clientId,
              issuer: ISSUER,
              subject: session.subject,
              email: session.email,
              tokens: session.tokens,
            };
            const before = this.registrations,
              selectedBefore = this.selected;
            this.registrations = [
              ...before.filter((item) => item.id !== registration.id),
              registration,
            ];
            this.selected = registration.id;
            try {
              await this.save();
            } catch (error) {
              this.registrations = before;
              this.selected = selectedBefore;
              throw error;
            }
            if (generation !== this.generation) return;
            response.end(
              "ChatGPT connected to EveryHint. Return to the app to select a model and review your question.",
            );
            this.stopJob(false);
            this.localStatus();
          } catch (error) {
            if (generation !== this.generation) return;
            response
              .writeHead(400)
              .end(
                "ChatGPT connection failed. Return to EveryHint for details.",
              );
            this.stopJob(false);
            this.publish(
              "error",
              error instanceof ProviderError
                ? error.message
                : "Could not finish ChatGPT sign-in or save OS-protected credentials.",
            );
          } finally {
            if (!response.writableEnded) response.end("Sign-in cancelled.");
          }
        })();
      });
      const timer = setTimeout(() => {
        if (generation === this.generation) {
          this.cancel();
          this.publish(
            "error",
            "ChatGPT sign-in timed out. Start again explicitly.",
          );
        }
      }, this.loginTimeoutMs);
      this.job = { abort, server, timer };
      await this.openBrowser(authorizationUrl(attempt, previous, consent));
    } catch (error) {
      server.close();
      if (generation === this.generation) {
        this.stopJob();
        this.publish(
          "error",
          error instanceof ProviderError
            ? error.message
            : "Could not open the official ChatGPT sign-in flow.",
        );
      }
    }
  }
  private stopJob(force = true): void {
    if (!this.job) return;
    const job = this.job;
    this.job = undefined;
    clearTimeout(job.timer);
    job.abort.abort();
    job.server.close();
    if (force) job.server.closeAllConnections();
  }
  cancel(): void {
    this.generation++;
    const pending = Boolean(this.job) || this.state === "signing-in";
    this.stopJob();
    this.refreshing?.abort.abort();
    this.refreshing = undefined;
    if (pending)
      this.publish(
        "cancelled",
        "Sign-in cancelled. Previously saved account registrations are retained.",
      );
  }
  async token(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    const registration = this.registration;
    if (!registration?.tokens || !planAllowed(registration.tokens))
      throw new ProviderError(
        "auth",
        "Continue with ChatGPT and grant plan permission first. No API-key fallback is available.",
      );
    if (registration.tokens.expiresAt > this.now() + 60000)
      return registration.tokens.accessToken;
    if (registration.tokens.earliestRefreshAt > this.now())
      throw new ProviderError(
        "auth",
        "This ChatGPT session is not yet refreshable. Continue with ChatGPT again.",
      );
    if (!this.refreshing || this.refreshing.id !== registration.id) {
      const abort = new AbortController(),
        generation = this.generation;
      const promise = (async () => {
        try {
          const session = await this.oauth.refresh(
            registration,
            AbortSignal.any([signal, abort.signal]),
          );
          if (generation !== this.generation)
            throw new ProviderError(
              "cancelled",
              "The ChatGPT account changed during refresh.",
            );
          // Do not expose a rotated token before its complete token set is committed.
          await this.save(
            this.registrations.map((item) =>
              item === registration
                ? { ...item, tokens: session.tokens }
                : item,
            ),
          );
          registration.tokens = session.tokens;
          if (generation !== this.generation)
            throw new ProviderError(
              "cancelled",
              "The ChatGPT account changed during refresh.",
            );
          this.localStatus();
          return session.tokens;
        } catch (error) {
          if (
            generation === this.generation &&
            error instanceof PlanHttpError &&
            error.providerCode &&
            terminalRefresh.has(error.providerCode)
          ) {
            registration.tokens = null;
            await this.save();
            this.publish(
              "signed-out",
              "The ChatGPT session expired or was revoked. Continue with ChatGPT to reconnect this registration.",
            );
          }
          throw error;
        }
      })();
      this.refreshing = { id: registration.id, abort, promise };
      void promise
        .finally(() => {
          if (this.refreshing?.promise === promise) this.refreshing = undefined;
        })
        .catch(() => {});
    }
    const tokens = await this.refreshing.promise;
    signal.throwIfAborted();
    if (registration !== this.registration || !planAllowed(tokens))
      throw new ProviderError(
        "auth",
        "The ChatGPT plan grant changed. Reconnect and refresh models.",
      );
    return tokens.accessToken;
  }
  async signOut(): Promise<void> {
    this.cancel();
    const registration = this.registration;
    if (!registration?.tokens) {
      this.localStatus();
      return;
    }
    this.publish(
      "signing-out",
      "Revoking this ChatGPT session and clearing its OS-protected tokens…",
    );
    const revoked = await this.oauth.revoke(
      registration,
      AbortSignal.timeout(10000),
    );
    const previous = registration.tokens;
    registration.tokens = null;
    try {
      await this.save();
      this.publish(
        "signed-out",
        revoked
          ? "Signed out. Tokens cleared; the client registration is retained for your next sign-in."
          : "Local tokens cleared. Remote revocation could not be confirmed; disconnect EveryHint in ChatGPT settings if needed.",
      );
    } catch {
      registration.tokens = previous;
      this.publish(
        "error",
        "Could not clear the OS credential store. Sign-out was not completed.",
      );
    }
  }
  dispose(): void {
    this.cancel();
    this.closed = true;
    this.registrations = [];
  }
}
