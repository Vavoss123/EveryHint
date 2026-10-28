# EveryHint milestones

## P10 — Calendar, People, memory and preparation (current delivery)

Implemented on `153846c` through five checkpoints; [design/gates](DECISIONS/P10-context.md), [verification/manual scenarios](TESTING.md), [delivery/changed files](DELIVERY.md). Official read-only Google desktop OAuth and finite selected-calendar cache/reminders; working Calendar/People; separate optional Contacts consent/import/deltas; source-grounded opt-in encrypted memory/review/exclusions/retention; exact-source briefs using existing ChatGPT/modes/knowledge; P8/recurring associations and optional scoped Live context. Local/capture/Google/remote permissions remain separate. No dependency/provider was added.

External gates: configured Google Cloud Desktop client, APIs/consent/test users plus explicit test permission for genuine Calendar/Contacts lifecycle; public OAuth brand/domain/privacy/sensitive-scope verification and distribution review. Genuine P10 brief inference requires fresh scoped authorisation; dry-run is not real inference. Current status is in TESTING. No feature is marked COMPLETE and no Google event/contact was created or modified.

Open: all 23 P10 Windows scenarios and unresolved P1–P9 real audio/hardware/calls, P5 visual/DPI/multi-monitor, accessibility/keyboard/Narrator, account switching/sign-out/OS permission lifecycle, long-duration CPU/RSS/capture/Whisper coexistence, P7 genuine automatic acceptance and broad multilingual/output/source quality. Restricted P6 profiles and the blocked historical P8 Temp directory remain untouched.

Deferred: approved external professional research; foreground/conferencing-app detection; Calendar incremental/unbounded historical sync (finite window delivered); automatic background AI briefs; semantic retrieval; multilingual Whisper/OCR; hosted sharing/mail/CRM/ATS/cloud sync; P11 enterprise, P12 mobile and P13 packaging. Stop after P10. Commit: `feat: add EveryHint calendar people and memory`.

## P9 — Modes, personal knowledge, languages and templates (historical delivery)

Implemented on `bf92396` in checkpoint order; [architecture and gates](DECISIONS/P9-personalisation.md), [verification](TESTING.md), [delivery](DELIVERY.md). Typed shared modes/legacy mapping, functional editors and profile-encrypted persistence; native PDF/DOCX/TXT/MD extraction and local bounded retrieval; independent global/mode output languages; honest English-only Whisper model management; grounded ordered custom meeting templates and prior-summary preservation; manual/Live source-review/permission integration. Two expressly authorised genuine gpt-6.1-sol requests passed without retries or paid fallback. Prior P1–P8 automated coverage remains enabled.

Open: real native file-picker interaction; broad PDF/DOCX/encoding/adversarial resource/partial-page evaluation; real-call note/source quality; multilingual output quality; physical Windows mic/playback/calls; visual/DPI/multi-monitor/accessibility/keyboard acceptance; base.en/ARM64/older CPUs; 15-minute combined CPU/RSS/endurance; account lifecycle/release acceptance. Carry forward the user's unresolved P7 acceptance item without reclassifying it from historical synthetic evidence. Restricted P6 profiles and the previously blocked P8 temporary folder remain untouched.

Deferred: multilingual Whisper models/language detection (no new downloads), OCR/scanned/image documents, legacy DOC/RTF/HTML/spreadsheets, embedded DOCX objects/headers/comments and layout page numbers, semantic/embedding retrieval/stemming/full-library global ranking, rich arbitrary template schemas beyond seven grounded categories, cloud sync/automatic uploads, independent semantic citation verification, hosted sharing/Gmail, P10 calendar/people, P11 enterprise and P12 mobile. Stop after P9. Intended commit: `feat: add EveryHint custom AI modes and knowledge`.

## P8 — Meeting Notes, History and Intelligence (historical delivery)

Implemented on baseline 2047110. Four checkpoints passed independently: encrypted opt-in persistence; grounded AI drafts/one-attempt End consent; scoped history/search/editing/meeting AI; explicit exports/clipboard/email handoff. Final automated results and all limits are in [TESTING.md](TESTING.md), architecture in [P8 design](DECISIONS/P8-meetings.md), and changed-file manifest in [DELIVERY.md](DELIVERY.md). P1–P7 capabilities and EverySession styling remain. No dependency, raw-audio storage, tool executor, hidden sync or paid fallback was added.

Genuine P8 summary generation/review/Apply passed with synthetic microphone, actual tiny.en and one separately authorised gpt-6.1-sol request: 11.028 s, 1,090 input / 795 output tokens, one supported decision and one action with unknown owner left unassigned. An earlier separately authorised request also produced a validated draft, but a test-harness completion-ID lookup prevented further inspection; the corrected replacement passed without automatic retry. Both test records were deleted, preferences restored and synthetic capture disposed. This does not establish physical microphone/system-audio or broad summary accuracy.

Remaining acceptance: all 18 P8 human Windows scenarios, real audio/calls/overlap/noise and summary quality, physical keyboard/Narrator, multi-monitor/DPI/contrast/opacity, external mail-client behavior, base.en/ARM64/older CPUs, long-session CPU/RSS and release/distribution/security review. The automated restart/crash/retention/encryption results do not close those manual gates. Lost-key recovery needs the original OS credential; there is no plaintext reset. SSD/remote/export erasure is not guaranteed.

Deferred capability: hosted share links with authentication/revocation/expiry/backend; direct Gmail/OAuth/send; automatic speaker identification; global title sort; semantic search/embeddings; custom templates/modes/personal knowledge (P9), calendar/people (P10). Current search is literal bounded local work; meeting QA/follow-up/automatic End have deterministic provider tests, while genuine remote verification covers the reviewed summary path only. EH-039/EH-042 remain partial. The four restricted P6 editor profiles and the automatic-review-blocked P8 Temp directory remain untouched.

Delivery commit: feat: add EveryHint meeting history and AI notes. Do not begin P9 as part of this delivery.


## P7 -- Automatic Conversation Intelligence (previous delivery)

P7.1 local final-question/keyword/stable-screen detection and correlation, P7.2 seven reviewed/local actions and ranked suggestions, and P7.3 separate expiring Live sharing are implemented on baseline `e68bfe7`. Each checkpoint was verified before the next. Existing P6 controllers/transport/EverySession tokens remain in use. Manual and Auto-Hint never submit automatically; Live is off at startup and has independent exact-source/account/model consent, expiry, cooldown, conservative attempt cap, one active request and cancellation. One separately authorised genuine gpt-6.1-sol automatic answer completed through synthetic microphone and real local Whisper (one request, 8.995 s, grant closed at cap). Measurements and scope are recorded in [TESTING.md](TESTING.md); no physical-hardware or broad accuracy claim follows from synthetic audio.

Remaining P7 acceptance: physical mic/Windows playback/both and consented calls; real speech with VS Code; screen-change/duplicate usability; human Live expiry/cap/Pause/Stop/account revocation; compact/expanded/DPI/multi-monitor/Narrator; 15-minute CPU/RSS. English-only rules and source labels are not multilingual transcription/diarisation. Screen differences are not OCR or semantic question recognition. Fixed keyword cues are implemented; personal keyword-list editing remains absent. Context-only Fact Check, retained-window Recap and user-provided Who do not complete independent web research, P8 notes or P10 people research. P8 has since been implemented below its separately verified scope. The four restricted P6 editor profiles remain untouched.

Commit: `feat: add EveryHint automatic conversation intelligence`. Resolve remaining manual gates and distribution eligibility before release.

## P6 -- Screen-Aware manual Assist (historical delivery)

Implemented optional-question Get Answer, three fixed built-in presets, fresh authorised screen context, final independently selected source/time-labelled transcripts, per-item removal, exact review/approval, client-side follow-up history, reviewed regeneration, safe rich streaming/copy and configurable global Assist/Clear chords. Existing controllers/public ChatGPT plan transport are extended; no tool executor, paid fallback, persistence or P7 automatic behaviour is introduced. All automated checks pass. Two separately authorised genuine gpt-6.1-sol requests verified a real VS Code screenshot explanation and text-only follow-up; capture was stopped and the temporary screenshot deleted. [TESTING.md](TESTING.md) retains physical-shortcut, real audio/device/account variants and all outstanding P5 Windows/visual gates. Commit: `feat: add EveryHint screen-aware AI Assist`. Software delivery does not close those remaining manual requirements.

## P1 — Desktop Foundation

Implemented in `e2e4ecb`. **Windows manual acceptance remains pending, confirmed by the user during P2.** P1's 62 regression tests pass. The reported paused screenshot was a retained image, not an ongoing scheduler; `ee3fc00` now clears it when pausing. No other blocking implementation defect is known from automated checks. This does not substitute for physical Windows acceptance.

## P2 — Live Audio Capture

**Implementation complete; automated verification passes; hardware/real-call acceptance pending.** P3 is now explicitly authorised and implemented below. P1/P2 hardware acceptance is still open.

| Checkpoint                | Dependencies                                       | Completion criteria                                                                                    | State                                                             |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| P1 pause correction       | Existing session/screen service                    | No retained screenshot on pause or stop; late frames rejected                                          | Complete; P1 regression suite passes                              |
| Independent consent/state | Existing session/IPC                               | All seven combinations; disabled sources stay disabled; exact booleans and participant acknowledgement | Complete; automated                                               |
| Microphone                | Browser media APIs, Windows permissions            | Default/selected device, metadata selection, mute, errors and disconnection handling                   | Implemented; mocked/synthetic verification; hardware pending      |
| System playback           | Electron supported Windows loopback                | Speakers unmuted; managed companion video; no screen-analysis coupling                                 | Implemented; grant/lifecycle tests; real Windows playback pending |
| Capture isolation         | Sandbox, contextBridge, isolated in-memory session | Exact worker/sender permissions, no camera or overlay media grants, duplicate-operation prevention     | Complete; automated                                               |
| Diagnostics               | Web Audio / AudioWorklet                           | Separate source names/status/meters, zero levels on pause/stop, mute/error visibility                  | Complete; real Electron with synthetic media                      |
| Resource lifecycle        | Session/worker orchestration                       | Dispose tracks/nodes/contexts/timers/buffers; pending startup, shutdown, lock/sleep handling           | Complete; automated; OS/driver release acceptance pending         |
| Future PCM contract       | Shared audio types                                 | Source/time/rate/channels/float PCM/stream lifetime, bounded memory; no transcription                  | Complete                                                          |
| Verification and delivery | All checkpoints                                    | Typecheck, lint, all tests, production build, Electron smoke, docs and clean commit                    | Automated complete; manual checks pending                         |

Baseline: **102 unit tests in 11 files**, **47 Electron smoke assertions**, strict TypeScript/lint/build passing. Smoke uses synthetic media and does not verify hardware or native playback. CPU and Windows memory performance are not certified. Documented bounds cover application PCM caches, not total Chromium/OS memory.

Known Windows limits: loopback is a playback mix rather than per-application isolation; DRM/exclusive routing/drivers can restrict it; hardware/app mute states may only appear as silence; device-change notifications are imperfect. Use the [manual checklist](TESTING.md) and [capture boundaries](ARCHITECTURE.md). Consider native WASAPI only if supported Electron loopback fails documented MVP needs after real testing.

## P3 — Local Live Speech Transcription

**Implementation and automated verification complete; real-device/long-run acceptance pending.** The user authorised the tiny.en/fixture download for real local inference. No P4/P5 implementation has started.

| Checkpoint               | Dependencies / completion criteria                                                                                                            | State                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Integration decision     | Official whisper.cpp C API; dedicated CPU helper; preserve P2 capture and all seven source combinations                                       | Complete; [decision](DECISIONS/P3-transcription.md)                           |
| Runtime/model setup      | Pinned helper build, explicit tiny.en/base.en install, exact size/SHA-256 validation, settings/status, no automatic downloads                 | Complete; native build and tiny.en verified; base.en actual inference pending |
| PCM preparation          | Validated source/stream metadata, audio-clock timestamps, mono/FIR 16 kHz conversion, bounded histories and gap handling                      | Complete; deterministic tests and real Electron pipeline                      |
| Speech segmentation      | Energy gate, conservative settings, partial/final jobs, silence/max boundaries and limited overlap                                            | Complete; tests and known speech fixture                                      |
| Inference scheduling     | Single loaded model, fair source queue, bounded backlog and observable drops                                                                  | Complete; lifecycle/fairness/overload tests                                   |
| Live transcript UI       | Source/time/provisional labels, ordering/replacement/deduplication, auto-scroll, compact view, clear/pause/settings                           | Complete; actual inference through both synthetic P2 streams                  |
| Context contract/storage | Typed session/event/model metadata; memory-only rolling text; retention/character limits and expiry                                           | Complete; no AI memory/question detection                                     |
| Privacy/lifecycle        | Explicit enable after authorised audio; no media activation; run/job guards; cancellation on capture pause/stop/clear/shutdown; model release | Complete; unit and Electron checks                                            |
| Performance/acceptance   | Load/inference/CPU/RSS/queue/drop diagnostics, real fixture results, hardware/15-minute checklist                                             | Software measurements recorded; hardware and long-run tests pending           |

Current P3 baseline: **157 unit tests across 17 files**, **47 core + 11 speech Electron smoke assertions**, strict TypeScript/lint/production build, native helper build, and actual tiny.en fixture inference all pass. P2's original 102 tests remain, with additional PCM-gating/timestamp checks. No npm dependency was added.

Remaining acceptance: real microphone and Windows loopback transcription; consented calls; base.en quality/switching; ARM64/older CPU builds; a 15-minute conversation with CPU/RSS/stability measurements. Current energy VAD can react to noise, chunked inference can revise words, overload deliberately drops queued audio, and overlap deduplication is approximate. Keep all P1/P2 physical checks open. See [Testing](TESTING.md).

## P4.2 -- ChatGPT plan AI responses

**Implemented and live-verified for one account/model.** On 2026-10-28, gpt-6.1-sol returned **EveryHint is connected.** using EveryHint's signed ChatGPT plan grant. The initial authorised attempt failed at an overly strict MIME gate; a frame-based fix passed new tests and the separately authorised second attempt completed. No API-key fallback or paid Claude request occurred. Other models/accounts, real captured-context transfer, hardware and release acceptance remain open. See [decision](DECISIONS/P4.2-chatgpt-plan.md), [testing](TESTING.md) and [delivery](DELIVERY.md).

| Checkpoint | State |
| --- | --- |
| Original restriction diagnosed | Codex CLI session was not an EveryHint direct-plan registration; SDK 0.164.0 lacks fail-closed deny-all tools |
| Official pathway | SIWC dynamic registration/returning issued client, stable host identity, plan scopes; public Responses API avoids agent tools |
| OAuth validation/credentials | PKCE/state/nonce, RS256/JWKS claims, callback binding, OS-native chunked atomic vault; no plaintext or shared-Codex token reuse |
| Account lifecycle | Saved registration picker, explicit consent, switch/cancel/sign-out/revocation, serialized rotating refresh; real browser sign-in/plan grant and restart verified; switch/sign-out acceptance open |
| Model selection | Explicit account-specific model discovery; five-minute memory catalog; selectable visible slugs; entitlement unverified until completion |
| Real transport | Streaming Responses POST with storage off and no tools; actual loopback HTTP verified; gpt-6.1-sol completed a genuine plan-backed response after the MIME parser fix |
| Images/context | Frozen model and independently selected transcripts/screenshot/question/history; unknown image support blocks screenshot; no raw audio |
| Errors/cancellation | Auth/permission/unavailable model/rate limit/service failures, failed/incomplete streams, abort, no retries or billing fallback |
| UI/IPC/privacy | Current transport labels, narrow validated routes, safe code/copy, bounded memory, stale-result protection, no automatic requests |
| Claude | Existing abstraction preserved, API opt-in off, subscription login disabled pending Anthropic approval; no paid test |
| Regression | P1-P3 retained; unit, native-vault/local HTTP, SDK, Electron and real tiny.en checks recorded in TESTING.md |
| Release/manual acceptance | Other account/model entitlements and real Windows devices/screens/calls, restart/account switching/revocation, 15-minute performance, base.en/ARM64/older CPUs pending |

Distribution remains an eventual goal. This is a private-use prototype; eligibility for the documented open-source/local route must be established for release, and paid/hosted registration or approval requirements must be resolved. No commercial or Anthropic subscription approval is claimed. P4.1's legacy Codex modules remain restricted and unused by application startup. P5–P7 software is implemented; P8+ remains deferred and remaining Windows/hardware/manual gates remain open.

## P5 -- EverySession design and interface foundation (delivered; human checks open)

Implemented the source-verified theme, licensed local Poppins/Inter, semantic tokens, Light/Dark/System appearance, bounded opacity, native layout sizing, compact/expanded/dashboard shell, accessible focus/reduced motion, panel collapse, honest future destinations and complete product inventory. Existing controllers, consent gates, OAuth/OS storage and answer-only providers remain intact. UI navigation preserves draft/review state and never starts capture, auth, inference or API billing. Automated evidence is recorded in TESTING.md; human visual and real Windows acceptance remain pending.

Deliverables: [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [FEATURE_MATRIX.md](FEATURE_MATRIX.md) with exactly 103 requirements and nine action mappings, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), central token source/generator, appearance/window tests and real Electron UI smoke/screenshots. EverySession source remains read-only. P6/P7 delivery is recorded above; P8+ remains specification only.

## Master roadmap -- supersedes the previous P5/P6 numbering

The earlier Context Intelligence/Optimisation phase names are superseded by the user's 2026-10-28 master specification. P5 now means the design/interface foundation; detection is P7 and release is P13. Historical P1-P4 records above describe their own delivery-time state. A planned destination is not a completed capability. Each phase requires its own task authorisation before implementation.

| Phase | Scope and dependencies | Testable acceptance / exit gate | Current state |
| --- | --- | --- | --- |
| P1 | Desktop overlay, screen capture, tray, fixed hotkeys | Explicit consent; pause/stop clears frames; safe IPC; physical Windows display/tray/hotkey checks | Existing implementation and automation; manual open |
| P2 | Independent mic/system capture and diagnostics; P1 | All source combinations; no bot/raw uploads; disconnect/permission loss stops sources; consented real calls | Synthetic automation passed; devices/calls pending |
| P3 | Offline local transcription; P2 and verified runtime/models | Real licensed speech fixture on each source; bounded queues/retention; actual devices/base.en/15-minute CPU/RSS | tiny.en verified; broader manual acceptance open |
| P4 | Official ChatGPT inference and permitted Claude; P1-P3 security | Real plan grant and completed reply; no tool executor/API fallback; provider/account/image/cancel isolation | gpt-6.1-sol text verified; Claude paid test not authorised; subscription approval blocked |
| P5 | Authentic EverySession tokens and three-layout UI; P1-P4 | Provenance; unchanged source; 103-row matrix; offline fonts; contrast/focus; no layout-induced requests; visual/DPI/keyboard checks | Foundation implemented; automated verification; human visual acceptance open |
| P6 | Screen-aware manual Assist, configurable shortcuts, follow-ups and rich responses; accepted P5 and permitted P4 provider | Explicit approved source/model review; genuine image/follow-up acceptance; safe Markdown/code; hotkey conflicts/fallbacks; no arbitrary actions | P6 manual workflow verified automatically and with one genuine gpt-6.1-sol image/follow-up; remaining human Windows gates tracked in TESTING.md |
| P7 | Local question/keyword detection, dynamic suggestions, multilingual/supported speaker intelligence; P3/P6 | Detection precision/recall fixtures; zero Auto-Hint transmission before approval; separately expiring Live Assist scope with source/frequency/usage limits, filtering, deduplication and immediate Stop | English local rules, actions/suggestions and scoped Live implemented and tested; multilingual/diarisation and physical/manual/endurance acceptance remain open |
| P8 | Notes, history, search, summaries, decisions/actions, exports, follow-up drafts; P4 and storage design | Opt-in encrypted retention; grounded spans; no fabricated owners/dates; restart/search/isolation tests; deletion covers indexes/blobs/shares; publishing/sending separately confirmed | PLANNED; no persistent meeting records |
| P9 | Modes, custom instructions/templates and personal documents; P6/P8 and safe parsing | Versioned bounded prompts cannot override safety; uploads validate type/size; isolated retrieval with evidence; mode changes invalidate old review; language fixtures | PLANNED; three built-in P6 presets exist, full custom modes remain absent |
| P10 | Calendar, reminders, people/research and cross-session memory; P8/P9 | Least-privilege connect/revoke; timezone/DST/offline tests; real source citations; namesake uncertainty; deletion/expiry and per-record sharing scope | PLANNED; no connected accounts or memory backend |
| P11 | Enterprise identity, RBAC, knowledge/RAG, CRM/ATS, coaching, analytics and admin; P8-P10 | Server-enforced tenant/role isolation and revocation; reviewed idempotent writes; grounded scorecards; actual metrics; audits and privacy/retention evaluation | PLANNED; no enterprise backend |
| P12 | Mobile recording, transcription, AI, notes, sync/share; P8-P11 contracts and platform decision | Visible consented recording; approved auth; battery/offline/interruption tests; encrypted scoped sync, conflicts and deletion propagation; no silent raw-media upload | PLANNED; no mobile application |
| P13 | Accessibility, performance, privacy, signing/packaging, startup, updates, security and release; prior accepted scopes | Screen reader/keyboard/high-contrast/DPI; measured long-run CPU/RSS; secure installer and signed update rollback; startup never captures; threat review; distribution eligibility and supported-platform matrix | PLANNED; earlier manual checks retained |

## Next recommendation

Complete the P7 Windows checklist and retained P1–P6 visual/device/account/endurance gates in TESTING.md. Stop after P7; do not start P8 records, calendar/people research, enterprise or mobile implicitly. Resolve release eligibility; Claude subscription remains blocked pending Anthropic approval and paid API usage needs separate opt-in.

## Dependencies

Version is **0.4.0**. P4 adds pinned `@openai/codex-sdk` **0.164.0** and `@anthropic-ai/claude-agent-sdk` **0.3.311**, including their upstream dependencies/platform binaries. P4.2 also adds pinned `jose` **6.2.13** and `@napi-rs/keyring` **2.1.2** for signed OAuth validation and native OS storage. No credentials were added. The native helper remains official whisper.cpp **v1.9.5**, pinned to `d1be6fde11ac6e0407606b4e42fe72d34add8037`; source/model/runtime files remain outside Git. Existing React/Electron/Vite/TypeScript/Vitest/ESLint/Playwright versions are unchanged. Node 24 LTS and Visual Studio C++/CMake support development. P5–P7 software is implemented; P8+ remains deferred and remaining Windows/hardware/manual gates remain open.
