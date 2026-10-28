# P6 delivery -- Screen-Aware AI Assist

Implemented the authorised manual workflow on baseline `f00bf2a`, retaining EverySession tokens, red/Poppins/Inter and all three layouts. P5 human Windows/visual checks remain open. No P7 detection or automatic request was added.

- **Assist:** Get Answer, optional question with actual selected context, General/Code/Conversation presets, source/time-labelled frozen preview, per-item removal and fresh remote-transfer approval. Configurable persisted global Assist opens/focuses the same composer and prepares its selected context for review; Clear cancels/reset local context. Chords are validated against emergency controls and native conflicts are reported.
- **Screen/transcripts:** on-demand capture through the existing serial service with source/session/generation guards; JPEG fitted to 1600×900 with selected 1.5 MB default / 4 MB maximum. Freshness/capability/unavailable/paused/duplicate-image checks fail visibly. Final mic/system text is independently optional, chronological, deduplicated and limited to selected 30/60/180/300-second windows. Raw audio, credentials/settings/diagnostics and unrelated files are excluded.
- **Conversations/responses:** bounded account/provider/session-isolated question/answer history; reviewed follow-up/regeneration; cancel/stale guards; safe streamed Markdown headings/lists/code/language labels/per-code copy/simple tables. HTML, links/images and generated code remain inert. Regenerate does not reattach previous images/transcripts; source-only answers may need a question or selected context. Clear cannot recall transmitted data.
- **Transport:** existing own-registration ChatGPT plan OAuth/model discovery/public Responses endpoint. At most one selected JPEG is `input_image.image_url` alongside `input_text`; storage off, streaming on, tools empty/tool choice none. No server conversation/previous-response state, mandatory OCR, Files API, shared Codex tokens, API-key fallback or paid Claude request. Claude subscription remains unavailable pending approval; API billing opt-in remains default off.

**Genuine live integration passed twice with gpt-6.1-sol**, under the user's explicit two-request authorisation. A real VS Code sample-window screenshot (1440×900 / 52,459 bytes), fresh review and acknowledgement produced a correct `count_colours` explanation and sample result `{'red': 3, 'blue': 2, 'green': 1}`. The text-only follow-up “Why did it use a dictionary?” correctly used the preceding answer and acknowledged it had no screenshot. First request: 1,803 input / 321 output tokens, first text 3.190 s, total 9.346 s. Follow-up: 571 / 195 tokens, first text 3.142 s, total 7.583 s. Both required terminal `response.completed`; no inference retry, audio, API fallback or paid Claude call occurred. Capture was stopped afterwards and the temporary screenshot deleted. Details: [TESTING.md](TESTING.md); ignored text evidence: artifacts/p6-live-result.json. These observations do not establish all-model/account/platform performance or release eligibility.

Verification: **367 unit tests / 30 files**, **5 real local HTTP/native-vault plan fixtures**, **6 installed SDK loopback tests**, **146 Electron assertions (47 core + 44 AI + 11 speech + 44 UI)**, real cached tiny.en JFK inference, theme/spec consistency, strict TypeScript, zero-warning lint and production build pass. No npm dependency was added; version remains 0.4.0. Stricter screen-state validation required updating old synthetic screenshot fixtures to represent ACTIVE authorised capture.

Files: extended `shared/{ai,contracts,validation}.ts`, added `shared/shortcuts.ts`; extended main capture/native capture/session/hotkeys/index and existing `ai/{context,controller}` with narrow preload additions. Updated renderer AssistantPanel/main/styles; added ResponseText and ShortcutSettings. Added three Assist test files and the harmless Python example; extended lifecycle/context/native/hotkey/migration/local-HTTP fixtures and AI/UI smoke. Updated product/architecture/backlog/testing/delivery/README, JSON inventory and generated matrix/metadata. Full modified file list is recorded by this commit.

Remaining: P5 human visual/Windows acceptance, physical shortcuts, real audio/call-backed assistance, broader model/account lifecycle, DPI/accessibility/long-run/device/ARM64 checks and distribution eligibility. Markdown is a practical subset without syntax highlighting. Native enumeration may transiently thumbnail other sources, retaining only the chosen frame. Submitted image hashes suppress unchanged uploads within a conversation; model refresh resets context. No permanent conversation storage is added. The final build is open with capture IDLE, its own plan connection restored and no startup model discovery/inference; all five chords registered, with physical acceptance still pending.

Delivery commit: `feat: add EveryHint screen-aware AI Assist`, with no AI co-author trailer. Stop after P6; P7 remains unstarted. Inventory records preserve partial/manual limits and no COMPLETE claims. Automatic approval review blocked deletion of four unused editor setup profiles in Windows Temp; they remain outside the repository. The live screenshot and ordinary automated test profiles were cleaned successfully.

---

# P5 delivery -- historical record: authentic design system and product roadmap

Implemented the authorised **feature audit and UI foundation only**. No calendar, saved meeting history, enterprise/mobile backend, automatic detection, autonomous assistance or additional paid/provider request was added. The previous ChatGPT inference result remains verified at baseline; Claude subscription approval and paid live verification remain unresolved.

## EverySession provenance

The real project was found at C:\Users\Victor\OneDrive\Documents\mmaapp\MMAsyncApp, identified as EverySession by app.json. Inspected actual theme/typography, club theme, Button/Card/form/header/navigation/login source, font loading, design audit and icon assets. Source HEAD: 1256e54dffebfd7b839d8b4b849dd62d22f372e5. All 15 inspected source/assets have matching before/after SHA-256 and the source repository stays clean. No EverySession code or asset was modified. PeerDesk was a secondary reference only.

Confirmed palette: **#E01A34** primary/danger, **#5C0F26** maroon, **#FFFFFF** background, **#F6F5F5** surface, **#EAE8E8** decorative border, **#181818** text, **#7A7878** original muted and **#1E8E5A** source success. Confirmed **Poppins headings / Inter body**, 14px cards, 10px inputs, pill buttons and 4/8/12/16/20/28 spacing. Secondary/status ink, control boundaries, warning/focus/hover and Dark/System are documented accessible desktop extensions; no exact dark-theme or pixel parity claim is made. Six authentic unmodified local font faces and their OFL notices ship offline. EveryHint retains its own mark; no Cluely artwork/design was copied. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## UI and behaviour

Central JSON tokens and generated CSS replace the purple placeholder palette. Native tray/window colours share the same source. The new dashboard navigation/Home/planned pages, reusable icons/disclosure panels, local appearance controls, three-layout sizing and root remote-request status build around the working assistant, account, transcript and capture components. Settings/theme/layout changes preserve draft/review state and never acquire media or submit AI. Active request cancellation and emergency capture controls remain outside hidden/collapsed content. Quick Ask/focused Ctrl+Enter only open the composer. Legacy preferences migrate safely; native opacity is bounded to 80-100%.

Home reports actual current session/provider state. Assistant and Settings work. Meetings, Knowledge, Calendar, People and Modes show planned scope with no simulated content or connections. General is a truthful fixed-instruction indicator; custom modes are not enabled. Existing microphone/system/screen controls, local Whisper, OAuth/OS credentials, provider/model selection, review/acknowledgement/Ask, streaming, safe code/copy, cancel/clear and IPC isolation are retained. No provider/authentication/transcription core was rewritten.

## Requirements and missing features

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) defines scope, consent/execution contracts and Manual/Auto-Hint/Live Assist distinctions. [FEATURE_MATRIX.md](FEATURE_MATRIX.md) covers **all 103 unique requirements** and **nine named contextual-action mappings**, with all requested evidence/acceptance fields and separate CURRENT/HISTORICAL/ENTERPRISE-ONLY/UNVERIFIED reference categories. Its validated JSON source generates the Markdown.

Current counts: **18 AUTOMATED VERIFIED, 2 MANUAL VERIFIED, 7 IMPLEMENTED, 76 PLANNED, 0 COMPLETE**. Verification applies only to each row's stated scope. Claude subscription authentication is separately BLOCKED under the account feature, not double-counted. Existing capabilities include overlay/window/tray/hotkeys, consented capture, source/mute/diagnostics, English local transcripts, bounded reviewed AI/context/history, ChatGPT plan login and one genuine text reply, and the new theme/navigation foundation. Partial image transport/code formatting/general mode/multi-monitor support retain explicit limits.

Missing capabilities include global screen Assist/custom hotkeys/session timer/full Markdown, local question/keyword/multilingual/speaker intelligence, automatic suggestion/live-sharing sessions, persistent meeting notes/history/search/sharing, custom modes/prompts/documents, calendars/people/cross-session memory, enterprise integrations/permissions/coaching and all mobile functions. None is marked complete because its navigation exists. The master P1-P13 roadmap in [BACKLOG.md](BACKLOG.md) replaces the old future-phase numbering and defines testable exit gates.

## Verification and remaining acceptance

**315 unit tests / 27 files**, **5 native-vault/local HTTP plan tests**, **6 installed Claude SDK loopback tests**, **136 Electron assertions (47 core + 37 AI + 11 speech + 41 UI)**, real cached tiny.en speech inference, TypeScript, zero-warning lint, token/spec checks and production build pass. The UI suite produces five app-only screenshots and forbids network requests. Build output includes both font licences. No new npm dependency was added; the app version remains 0.4.0. See [TESTING.md](TESTING.md) for evidence, commands and exact manual limits.

Human EverySession visual acceptance, Windows display scaling/mixed monitors, native dragging/resizing/opacity, Narrator/high contrast, physical keyboard/shortcut/tray behaviour, actual capture/transcription/provider workflows and the original devices/calls/base.en/ARM64/15-minute checks remain pending. Source-code verification and automated screenshots do not replace those checks. Existing separate app use caused expected hotkey-conflict notices during isolated smoke tests.

**Next recommendation:** complete P5 human Windows visual acceptance, then explicitly scope P6 manual screen-aware Assist, configurable shortcuts and safe rich responses using the permitted ChatGPT pathway. Do not start P7-P13 features implicitly. This delivery stops after the requested foundation and uses commit **feat: establish EveryHint design system and product roadmap**, with no AI co-author trailer.

---

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
