# P4 provider and permission decision — 2026-10-27

## Account sign-in follow-up

### Confirmed distribution scope

The user confirmed on 2026-10-27 that **other people will use EveryHint**. It is
therefore not treated as a private, self-operated Claude SDK project. Claude
subscription login stays disabled unless Anthropic expressly approves this app;
the documented alternative is API authentication, with separate explicit billing
consent. Distribution is not consent to API charges, and the instruction to make
no paid requests remains in force. No private-use bypass will be added.

The existing ChatGPT button is a local Codex-client prototype, not a completed
production Sign in with ChatGPT integration. OpenAI documents a direct registration
flow for eligible open-source/locally hosted apps, with an app/host identity and
per-user consent. Paid or remotely hosted apps must follow the partner-interest
and approval route. The user has not specified pricing/hosting, so no eligibility
or commercial approval is assumed. Before release, choose and implement the
applicable official SIWC route; do not treat the Codex client's OAuth identity as
a commercial app registration. Existing Codex inference restrictions and browser
acceptance checks remain open.

Sources:

- [Anthropic's third-party subscription sign-in restriction](https://code.claude.com/docs/en/agent-sdk/overview#get-started)
- [ChatGPT plan usage scope](https://developers.openai.com/siwc/token-sharing-open-source)
- [Open-source/local registration flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Commercial client-ID registration](https://developers.openai.com/siwc/request-client-id)

### Implemented local prototype

The user requested account login inside EveryHint. The ChatGPT button now invokes
the official bundled `codex login` browser flow, with `forced_login_method="chatgpt"`,
`cli_auth_credentials_store="keyring"` and a dedicated `CODEX_HOME` under the app's
`userData/chatgpt` directory. The native client owns OAuth, callback validation,
refresh and credential storage. EveryHint neither implements a password form nor
reads/copies OAuth tokens. Sign-out targets the same app profile, not the user's
normal Codex home. The existing shared login is no longer imported into EveryHint.
This is a local desktop integration; commercial/hosted deployment needs review
of OpenAI's Sign in with ChatGPT registration/approval requirements.

Login requires explicit button action, has a five-minute deadline and can be
cancelled. Duplicate operations are rejected, stale callbacks cannot replace a
newer operation, and process output is discarded. Completion is verified with
official local login status. Cancelling account operations on provider changes,
reload, lock/suspend and shutdown prevents a hidden pending callback process.
This flow does not request a model response or enable API billing. Codex inference
remains disabled for the separate permission limitation described below.

Anthropic's current Agent SDK overview still requires prior approval for a
third-party app to offer claude.ai subscription login. The plan support article
describes how authorised SDK usage is charged; it does not grant EveryHint that
approval. Claude account sign-in therefore remains visibly unavailable. No
credentials are hardcoded and no subscription/API-billing workaround is used.
The user has not completed the new ChatGPT browser flow yet; mocks are not proof
of a completed OAuth login. The earlier research record below is retained.

Official documentation was checked before implementation. Installed SDKs are
`@openai/codex-sdk` 0.164.0 and `@anthropic-ai/claude-agent-sdk` 0.3.311.

## Authentication

- Codex's official `login status` command detects existing ChatGPT authentication
  without reading credential files. ChatGPT usage and API billing are different.
  EveryHint never supplies an OpenAI API key or falls back to API billing.
- Anthropic explicitly prohibits third-party products from offering claude.ai
  login/subscription limits without prior approval. EveryHint has no such approval.
  Claude therefore uses only `ANTHROPIC_API_KEY`, with a separate, session-only
  API-billing opt-in. An existing Claude subscription/OAuth token is never reused.
  Detection of an environment key is not proof of successful authentication.
- Private SDK subscription use described in Anthropic's support material does not
  establish approval to distribute subscription login in EveryHint.

## Response-only enforcement

Claude exposes `tools: []`, `disallowedTools: ['*']`, `permissionMode: 'dontAsk'`
and a denying `canUseTool` callback. EveryHint also disables settings sources,
skills, plugins, MCP and hooks, uses the documented `--bare` and
`--disable-slash-commands` flags, and uses an isolated temporary config directory,
an empty working directory, an environment allowlist and no persisted sessions.
It does not use permission bypass. Image blocks remain in memory.

Codex's current SDK exposes a filesystem sandbox and approval policy, but no
supported deny-all built-in-tool control. Read-only mode can still run commands.
The official hook documentation says callback errors/timeouts can fail open and
some tool paths bypass hooks. Disabling selected feature flags or killing a
process after a tool event is insufficient proof of response-only execution.
**Codex inference is disabled**, including image submission; local authentication
detection remains implemented. No provider fallback is made. Re-enable only after
a supported fail-closed tool boundary is available and tested. This is the P4
request's explicit restricted-capability exception, not a successful Codex answer
integration. The SDK's normal threads persist in `~/.codex/sessions`; EveryHint
does not create them while blocked.

## Data and sessions

Only an explicit Ask sends an immutable, reviewed question/context snapshot.
Review and authentication inspection do not request inference. Captured text is
untrusted data. No raw audio is sent. No automatic question detection is included.
Conversation continuation resends bounded question/answer text only, shown in the
review. Prior screenshots and transcript excerpts are not retained in history.
Provider switches start a new conversation. Clear cancels local execution and
clears memory; it cannot delete provider-side records or recall transmitted data.
Claude `persistSession: false` prevents SDK transcript persistence, but SDK caches,
OS remnants and provider retention are separate from application memory.

Actual SDK loopback tests found that `settingSources: []`, `skills: []` and
`plugins: []` alone still discover bundled skills and plugins in CLI 2.1.311.
Bare mode, bundled-skill disabling, disabling the two bundled plugins and
disabling slash commands remove these. Runtime initialization must confirm
empty tools/skills/plugins/MCP, `dontAsk` permissions and `ANTHROPIC_API_KEY`
authentication before EveryHint accepts output. The actual SDK rejects injected
Bash/Read/Write/MCP calls in the loopback fixture; the write sentinel remains
absent. This is local protocol/security verification, not live AI inference.

The user explicitly declined paid live tests during P4. No API credentials are
configured and no live inference was performed. Codex's official local status
reports ChatGPT login, but its tool boundary remains unsupported. P4 live
acceptance remains open. No authentication restriction was bypassed.

Sources:

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex security](https://learn.chatgpt.com/docs/security)
- [Codex hooks and their limitations](https://learn.chatgpt.com/docs/hooks)
- [Claude Agent SDK overview and third-party authentication restriction](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Claude permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- [Claude SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Claude bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)
- [Claude CLI tool and command controls](https://code.claude.com/docs/en/cli-reference)
- [Claude plan SDK support](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
