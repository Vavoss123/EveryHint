# P4.2 delivery -- ChatGPT plan inference

Live verification on **2026-10-28 succeeded** with **gpt-6.1-sol** using EveryHint's own SIWC ChatGPT plan grant and the public Responses endpoint. The approved question was **Reply exactly: EveryHint is connected.** The actual completed answer was **EveryHint is connected.** No screenshot, transcript, history or raw audio was sent. The response reported **167 input / 9 output tokens**, first text in **4.214 s** and completion in **4.299 s**. No API-key/provider fallback or paid Claude request was made. These are a single observation, not a latency guarantee, quota balance or dollar-cost estimate.

1. **Original restriction:** the old button opened a Codex-client session rather than EveryHint's own direct-plan registration. Codex SDK 0.164.0 lacks a supported fail-closed deny-all built-in-tool boundary; read-only still allows commands. Those protections were retained.
2. **Chosen pathway:** official SIWC OAuth with PKCE, fresh state/nonce, stable host, issued client reuse, signed JWT/plan-scope validation and native OS storage; public /v1/models and streaming /v1/responses. Requests use store:false, stream:true, tools:[] and tool_choice:none. There is no agent executor, OpenAI API-key or alternate-provider fallback. See [decision and official sources](DECISIONS/P4.2-chatgpt-plan.md).
3. **Plan access:** the user completed the official browser consent and EveryHint verified its signed plan grant. Real account-specific model discovery and one completed gpt-6.1-sol response confirm the intended pathway for that account/model. Existing Codex/IDE credentials were neither read nor migrated. No billing ledger, unlimited usage or access for every model is claimed.
4. **Genuine answer:** the exact approved reply completed with the model/usage/timing above. Two plan requests were made, each separately authorised. The first was rejected by an overly strict SSE MIME check before any text was displayed. The corrected parser validates bounded SSE data frames independently of MIME metadata, still requires response.completed, rejects non-streaming JSON as completion and cleans up its reader. Three regression cases cover this. The second authorised request completed genuinely; no automatic inference retry occurred. Either attempt may consume the user's plan allowance.
5. **Models/limits:** eight visible models were returned in server order; all advertise image input. The user picker uses current account metadata with a five-minute memory cache. Only gpt-6.1-sol text inference was exercised; other models, images, other accounts/workspaces/regions and future limits need acceptance. Unknown image support blocks screenshots. Context/history, response size and deadlines stay bounded.
6. **Verification:** strict TypeScript, zero-warning lint, **298 unit tests/25 files**, **5 native-vault/local HTTP tests**, **6 installed Claude SDK loopback tests**, production build, **47 core + 37 AI + 11 speech Electron assertions (95)** and actual tiny.en fixture inference pass. See [testing details](TESTING.md).
7. **Remaining Windows checks:** real screens/windows/microphone/playback, consented calls, real captured context with AI, sign-out/revocation/account switching, 15-minute combined performance/stability, base.en, ARM64/older CPUs and distribution eligibility remain pending.

The full token/registration record stays in the asynchronous native OS vault, chunked below Windows limits and atomically committed. Only the public host ID is a file. No credentials reach renderer IPC/logs/source, and captured context is never automatically saved or submitted. Account/model changes cancel work and reset context. Identity-only consent blocks requests until explicit plan permission. Revocation failures are visible. Local Whisper and remote inference are clearly separated. The first MIME failure prompted a frame-based parser fix; no permission restriction was weakened.

Claude subscription sign-in remains disabled without Anthropic approval. Its API abstraction and session-only billing opt-in are preserved and default off; no paid Claude request was made. This is a private-use prototype designed for eventual distribution. A successful personal plan test does not establish commercial approval or release readiness. P5 has not started.

Created: src/main/ai/plan/{accounts,http,oauth,provider,vault}.ts; tests/plan-{accounts,oauth,provider,vault}.test.ts; tests/plan-fixtures.ts; tests/plan.integration.ts; vitest.plan.config.ts; and the P4.2 decision. Updated main/preload/shared contracts/controller, account/assistant UI, AI smoke, README/architecture/backlog/testing/delivery and package manifest/lock. Pinned dependencies added: jose 6.2.13 and @napi-rs/keyring 2.1.2. App version remains 0.4.0. No credential, captured media, model/runtime binary or ignored test artifact is committed.

Run npm run build, then npm start. Use Continue with ChatGPT, Refresh ChatGPT models, select a model, review chosen context, acknowledge and Ask ChatGPT. Successful work is committed as **feat: enable EveryHint ChatGPT inference**. Historical records below describe earlier deliveries and are superseded by this P4.2 result where applicable.

---

# Account sign-in follow-up

**Distribution clarification:** The user confirmed that other people will use EveryHint. Claude subscription sign-in therefore remains blocked pending Anthropic approval; there is no private-use exception enabled. The ChatGPT control remains a local prototype and must not be represented as a completed commercial SIWC integration. The appropriate official registration route depends on open-source/local versus paid/hosted deployment. This clarification changes documentation/release requirements only; no authentication, model request, credential handling or billing behavior was changed, and no paid request was made. See the [recorded requirements and official sources](DECISIONS/P4-providers.md#confirmed-distribution-scope).

Added **Sign in with ChatGPT**, **Switch ChatGPT account**, **Cancel sign-in** and **Sign out of ChatGPT** inside EveryHint. The official bundled Codex client opens the browser and owns authentication. It uses a dedicated `userData/chatgpt` profile and mandatory OS-keyring storage, never hardcoded passwords/API keys, token copying, or the user's shared CLI/IDE account. Native status verifies completion. Unfinished login is cancelled on provider switch, reload/crash, lock/suspend or shutdown; duplicate attempts, stale completions and timeouts are guarded.

Claude account sign-in is visibly unavailable: Anthropic still requires approval for third-party apps to offer subscription login. EveryHint has no approval. Existing API billing remains opt-in, and **no paid request was made**. ChatGPT authentication does not unlock Codex inference; its response-only permission limitation remains open. The user must complete the browser login to verify OAuth end to end; this was not replaced with a mocked success claim.

Created: `src/shared/accounts.ts`, `src/main/ai/accounts.ts`, `src/renderer/src/AccountPanel.tsx`, `tests/accounts.test.ts`. Modified: narrow preload/shared contracts, main lifecycle/IPC, Codex status probing, assistant account controls, `scripts/smoke-ai.mjs` and the five project docs plus provider decision record. No dependency was added.

Verification: **234 unit tests / 21 files**, strict TypeScript, zero-warning lint and production build pass. **33 AI Electron assertions** pass, including real isolated-profile status inspection, rejection of untrusted sign-in IPC, available ChatGPT login controls and clearly unavailable Claude login. Core Electron smoke (**47** assertions), speech Electron smoke (**11** assertions with real tiny.en) and installed-Claude-SDK loopback tests (**6**) also pass. Electron assertions total **91**. Account UI transitions use labelled fixtures; browser OAuth completion remains manual. The shared official `codex login status` remains ChatGPT-authenticated after testing. The P4 baseline record follows.

---

# P4 delivery — explicit AI provider requests (baseline)

P4 adds the shared provider architecture, authentication/capability inspection, a real response-only Claude API adapter, manual provider selection, independently selected context, immutable payload review, fresh transfer consent, streaming/cancel/errors, bounded isolated conversations, safe code display/copy, compact status and teardown. Working capture and local transcription services were preserved. Version is **0.4.0**. **P4 is not fully live-accepted:** Codex inference is deliberately blocked and Claude live authentication/inference is unverified. P5 was not started.

## Connection and real-request status

| Provider | Actual status | Inference |
| --- | --- | --- |
| Codex | Official bundled CLI **0.164.0** and the Electron adapter detect existing **ChatGPT login**. No auth files/tokens were read by EveryHint. | **Blocked:** SDK **0.164.0** has no supported deny-all built-in-tool boundary. Read-only mode still permits commands; hooks can fail open. No agent was launched and no API fallback used. |
| Claude | SDK **0.3.311**, bundled CLI **2.1.311**. No `ANTHROPIC_API_KEY` is configured. Subscription login is unsupported in EveryHint without Anthropic approval. | API-only adapter implemented, disabled by default and gated by a session-only billing opt-in. The user explicitly chose **“Leave live verification pending; make no paid requests.”** No live test was run. |

**Actual live AI requests completed: 0. Paid requests: 0.** The installed Claude SDK/CLI was executed against synthetic loopback HTTP fixtures to verify protocol handling and tool blocking. Those fixtures and renderer test events are not AI responses and are never offered as production output. The limitation follows the task's instruction to disable unsupported functionality rather than grant broad permissions; a successful live Codex/Claude integration is not claimed. Official policy and permission sources are linked in [the decision record](DECISIONS/P4-providers.md).

## Architecture and data

The React renderer has no provider network access or credentials. Narrow IPC checks the exact overlay sender, main frame and document before parsing input. Main owns the provider registry, auth/billing gates, capture-session/conversation/request IDs and one active request. Codex's adapter uses only the official local login-status command. Claude's official SDK owns an isolated CLI child with fixed arguments, hidden windows and an allowlisted environment.

Claude uses an empty tool set, wildcard tool denial, `dontAsk`, an always-denying permission callback, no MCP/configuration/agents, disabled hooks/plugins/memory/bundled skills, bare mode and disabled slash commands. Initialization must confirm the expected restrictions and environment API-key source. Actual SDK tests reject injected Bash/Read/Write/MCP calls; no file sentinel is created. No commands, filesystem exploration, package installation or external actions are exposed to answers.

Only **Review → acknowledgement → Ask** can send selected context. A one-time two-minute review freezes the exact serialized question, selected current-session final transcript excerpts, optional image and bounded question/answer history. Each source is independently selected; raw audio is excluded. Text/image budgets and recent duration are configurable. The prompt treats captured data as untrusted reference material. Screenshots stay in memory and use Claude's native base64 image blocks; no screenshot temp file is needed. Duplicate image hashes avoid unchanged resubmission. No OCR, second-provider fallback, automatic trigger or question detection is introduced.

History holds four completed pairs / 12,000 characters, eight displayed bounded responses and a 15-minute idle expiry. Provider/capture switches reset context. Cancel aborts the SDK and closes/kills its process; request/session guards reject late events, including old results arriving after a new request in the same conversation. Requests have a 90-second deadline and 32,000 response-character bound. Clear also removes the draft and pending review. It does not delete provider records or recall transmitted content.

Claude has one turn, 4,096 output tokens and a $1 SDK estimated-budget threshold, which is **not a guaranteed billing cap**. Usage/cost and timing come from SDK/result events; no balance or quota is invented. Model discovery is not performed automatically; actual init supplies the selected model. No application retries or billing fallback run. SDK internal transport behavior is separate.

`persistSession: false` disables Claude conversation logging. Its temporary config/working directory is removed after success/error/cancel; shutdown allows up to five seconds for teardown. SDK caches, OS/crash remnants and remote retention are independent. Normal Codex SDK sessions would persist in `~/.codex/sessions`, but no Codex thread is created while disabled. No credential, captured media, model or conversation was added to Git.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, zero-warning lint, **219 unit/regression tests in 20 files**, production build |
| `npm run test:ai-sdk` | **6 passed**, installed SDK/CLI with synthetic loopback responses, real-process cancellation and temporary cleanup; no account/provider verification |
| `npm run smoke` | **47 assertions passed**, synthetic media; all hotkeys registered |
| `npm run smoke:ai` | **26 assertions passed**; actual IPC/auth inspection, review/billing rejection, code safety/copy, compact/clear controls |
| `npm run speech:test` | Real tiny.en JFK recognition verified twice through one loaded helper; offline cached model/fixture |
| `npm run smoke:speech` | **11 assertions passed**, real tiny.en via both synthetic P2 sources |
| Production artifacts | Main **99.92 kB**, renderer JS **250.69 kB**, CSS **12.10 kB**, separate sandboxed preloads/audio document/worklet; SDK packages remain external |
| `git diff --check` | Passed |

P1–P3's **157** tests remain in the suite; P4 adds **62** deterministic AI cases. Electron assertions total **84** across the three scripts. Tests cover registry/auth restrictions/API opt-in, source selection/truncation, exact review consent, secure IPC, stream/cancel/deadline/errors/crashes, conversation/capture isolation, cleanup, prohibited tools, duplicates and late results. The actual SDK test discovered unintended bundled skill/plugin loading; documented flags/settings now remove it and runtime init verifies the inventory. Copy uses bounded main-process IPC after Electron's existing browser permission policy correctly denied browser clipboard access. Final checks have no suppressed failures.

Single-sample performance: assistant startup through local auth **665 ms**, text review through UI/main **168 ms**, main RSS **124.4 → 127.6 MB**. These are local synthetic smoke measurements, not real AI latency or whole-app memory. The standalone tiny.en helper loaded in **138 ms**, processed real fixture jobs in **603 / 520 ms**, and used **172.6 MB** / **384–397%** of one logical core. The Electron speech pipeline loaded in **106 ms**, averaged **530 ms** over **11 jobs**, and had **zero queued/dropped jobs/gaps** at the snapshot, with **173.9 MB** helper memory / **384%** CPU. CPU may exceed 100% because four inference threads run. Reports remain in ignored `artifacts/`; combined live-provider/hardware performance remains unmeasured.

## Files

Created:

```text
docs/DECISIONS/P4-providers.md
scripts/smoke-ai.mjs
src/main/ai/claude.ts
src/main/ai/codex.ts
src/main/ai/context.ts
src/main/ai/controller.ts
src/main/ai/environment.ts
src/main/ai/errors.ts
src/renderer/src/AssistantPanel.tsx
src/shared/ai.ts
tests/ai-context.test.ts
tests/ai-controller.test.ts
tests/ai-providers.test.ts
tests/claude-sdk.integration.ts
vitest.sdk.config.ts
```

Modified:

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
package.json
package-lock.json
scripts/smoke.mjs
src/main/index.ts
src/preload/index.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/contracts.ts
```

Only the two requested upstream SDKs were added as direct runtime dependencies. Their platform binaries and required upstream/peer dependencies are locked. No heavyweight Markdown/highlighting package was added. Existing capture/transcription modules and native code were not rewritten. Temporary formatter tooling was used without adding a repository dependency.

## Open acceptance and reproduction

Codex needs a supported fail-closed response-only tool boundary before inference can be enabled. Claude needs a later explicit API-billing authorisation, locally configured API key and a genuine live request; the current user instruction forbids paid tests. No policy exception or credentials were fabricated. Provider/model availability, true remote streaming latency, real authentication expiry/rate/network behavior and real screenshot reasoning remain unverified.

All earlier physical acceptance stays open: real Windows microphone/loopback, consented calls, P1 controls on actual devices, base.en quality, ARM64/older CPUs and a 15-minute conversation. A combined real provider/transcription CPU/RSS/responsiveness run is also pending. The full **20-item P4 manual checklist** and P1–P3 lists are in [TESTING.md](TESTING.md). These are not replaced by mocks or synthetic-media checks.

Run the commands in [TESTING.md](TESTING.md) after `npm ci`; speech checks reuse the already-installed verified helper/model/fixture and require no further download. Start the app with `npm run dev` or `npm start` after building. Claude remains disabled until a later explicit in-app opt-in and API-key setup. Inspect the delivery commit with `git log -1 --oneline` and `git status --short`; intended commit message is `feat: integrate EveryHint AI providers`, without co-author trailers. No push/deployment was requested. P5 is not started.

---

# Historical P3 delivery — local live speech transcription

P3 connects the existing independent microphone/system PCM streams to one CPU whisper.cpp helper, with validated transport, mono/16 kHz conversion, energy-based speech segmentation, bounded fair scheduling, provisional/final transcript replacement, overlap deduplication, ordered source-labelled text and a rolling memory-only transcript store. Models/settings/diagnostics are available in the overlay, including compact mode. Capture controls, all seven source combinations and P1/P2 privacy indicators remain.

## Verification

| Check                                                     | Result                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Strict TypeScript / lint                                  | Passed                                                                                          |
| Unit tests                                                | **157 passed, 0 failed, 17 files**                                                              |
| Production build                                          | Passed                                                                                          |
| Native helper build/install                               | Passed, official pinned whisper.cpp v1.9.5; upstream compiler/CMake warnings visible            |
| Core Electron smoke                                       | **47 assertions passed**; synthetic media; all hotkeys registered                               |
| Speech Electron smoke                                     | **11 assertions passed**; actual tiny.en inference through both synthetic P2 sources            |
| Actual helper inference                                   | Verified upstream JFK speech twice through one loaded model; expected recognised phrase checked |
| Real microphone/Windows loopback/calls                    | **Pending**                                                                                     |
| Base.en actual inference / 15-minute conversation / ARM64 | **Pending**                                                                                     |

The user explicitly authorised the official tiny.en model and known speech fixture downloads for verification. Both checksums match. Tiny.en and the CPU runtime are installed under local application data; no model or runtime binary is committed. Base.en install/selection and its pinned checksum are implemented, but it was not downloaded or claimed as inference-tested.

One recorded four-thread CPU fixture run: model load **86.3 ms**, consecutive ~11-second jobs **648.0/528.2 ms**, working set about **165 MiB**, helper CPU about **373–395 one-core percent** during inference. A recorded dual-source Electron run averaged **487.4 ms** over ten chunk jobs, with queue **0**, dropped jobs **0**, gaps **0**, and ~**166 MiB** working set. These short warm-cache observations do not establish long-run/hardware performance. Latest per-run fixture measurements are in ignored `artifacts/inference.json` and `artifacts/speech-smoke.json`.

## Architecture and limits

- One native helper/model per enabled run; sequential C API inference, source-fair scheduling and no shell/HTTP server/native Node binding. Models release on transcription/capture pause, Stop, Clear, settings/model changes, failure and shutdown.
- Native audio-clock spacing, strict PCM validation, channel averaging and bounded FIR resampling preserve source/time provenance. Gaps reset conversion and separate speech segments.
- P2's original two-second/768,000-byte caches are unchanged. P3 adds 10–15-second speech segments, up to two queued jobs per source, and one in-flight inference. Overload replaces superseded partials and drops older queued work visibly.
- Partials are actual chunk inference and can change. Stable utterance IDs replace provisional text; finals commit it. Limited overlapping multiword text is deduplicated without merging sources or claiming speaker identities.
- Transcript retention defaults to 15 minutes/200 events, with a 50,000-character cap and scheduled expiry. Text stays in memory, survives pause for review, clears on request/new session, and is never saved automatically.
- Transcription starts OFF and cannot activate audio. Enable requires authorised ACTIVE audio capture. Random run/session/job guards reject old PCM/results. Clear cancels pending work and leaves transcription paused. Capture Resume also requires an explicit transcription Resume.
- Tiny.en/base.en downloads are explicit, bounded and checksum-verified; default model tiny.en. No external transcription/AI calls, telemetry, conversation export, question detection or AI memory was added.

Remaining limits: energy gating is sensitive to noise/quiet speech; max-boundary overlap deduplication is approximate; overload can lose text; Windows loopback routing/protection/mute limitations remain. The tested x64 native backend uses AVX2/FMA/F16C/BMI2. ARM64 and older CPU rebuilds, real devices/calls, base.en quality and a 15-minute Windows stability run require manual acceptance. P1/P2 acceptance remains open; no synthetic result is presented as hardware acceptance.

See [Architecture](ARCHITECTURE.md), the [decision record](DECISIONS/P3-transcription.md), [Testing](TESTING.md) and [Backlog](BACKLOG.md).

## Files changed

Modified:

```text
.gitignore
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
package.json
package-lock.json
scripts/smoke.mjs
scripts/synthetic-audio.mjs
src/main/audio-host.ts
src/main/index.ts
src/main/session.ts
src/preload/audio.ts
src/preload/index.ts
src/renderer/audio/engine.ts
src/renderer/audio/main.ts
src/renderer/audio/worklet.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/audio-ipc.ts
src/shared/contracts.ts
tests/audio-engine.test.ts
tests/audio-host.test.ts
```

Created:

```text
docs/DECISIONS/P3-transcription.md
native/transcriber/CMakeLists.txt
native/transcriber/main.cpp
resources/speech-models.json
scripts/build-transcriber.ps1
scripts/install-model.mjs
scripts/smoke-transcription.mjs
scripts/speech-fixture.mjs
scripts/test-inference.mjs
src/main/transcription/controller.ts
src/main/transcription/model-files.ts
src/main/transcription/models.ts
src/main/transcription/pcm.ts
src/main/transcription/segmenter.ts
src/main/transcription/transcripts.ts
src/main/transcription/worker.ts
src/renderer/src/TranscriptionPanel.tsx
src/shared/transcription.ts
tests/speech-models.test.ts
tests/transcription-controller.test.ts
tests/transcription-pcm.test.ts
tests/transcription-segments.test.ts
tests/transcripts.test.ts
tests/whisper-worker.test.ts
```

No npm dependency was added. Application version is 0.3.0. Native/source/model/fixture caches live outside source control, and test reports/screenshots remain ignored. No unrelated files were modified.

## Run and reproduce

With Node 24, Git, Visual Studio C++ Build Tools/Windows SDK and CMake 3.24+:

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run speech:build
npm run speech:model -- tiny.en
npm run dev
```

The helper and tiny.en are already installed locally from this verification; repeating their setup is optional. For an additional model, explicitly run `npm run speech:model -- base.en` or use settings.

```powershell
npm run check
npm run smoke
npm run speech:test -- --install-fixture
npm run smoke:speech
```

Only the first fixture test needs `--install-fixture`; subsequent speech tests are offline. The Node helper test uses Node 24's experimental type-transform flag to import the production TypeScript worker; the packaged application uses compiled JavaScript and does not need that flag. Native source is pinned to `d1be6fde11ac6e0407606b4e42fe72d34add8037` and its published root license (the ggml authors' MIT license) is installed beside the helper.

The verified P3 commit uses `feat: add EveryHint local live speech transcription`. Inspect `git log -1 --oneline` and `git status --short`. P4/P5 have not started.
