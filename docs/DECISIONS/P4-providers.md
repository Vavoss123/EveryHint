# P4 provider and permission decision — 2026-10-27

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
