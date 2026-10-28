# EveryHint product specification

Version: P7 Automatic Conversation Intelligence, 2026-10-28. Baseline: `e68bfe7`. P7 reuses the P1–P6 controllers and EverySession design. P5 Windows/visual and physical hardware/endurance acceptance remains open. P8 is not started.

## P6 manual Assist contract

Get Answer opens a frozen transmission review. A question is optional when selected, available screen/transcript/previous-exchange context exists. General Assist, Code Assist and Conversation Assist are fixed response presets beneath immutable answer-only safety instructions. Empty context is rejected. This explicit Manual contract is retained alongside the separate P7 modes below. The custom-mode editor remains P9.

Screen inclusion obtains an on-demand frame from the current consented, ACTIVE source through the existing serial capture service. No arbitrary renderer image/path/source is accepted. Native JPEG snapshots fit within 1600 by 900 pixels, with a selected byte cap (default 1.5 MB, maximum 4 MB). Main validates dimensions, data URL, freshness within 10 seconds and at most one second of future clock skew. Source name, timestamp and exact image are shown in the review; unknown image capability, paused/stopped/unavailable capture, stale/oversized images and already-submitted image hashes fail explicitly. Review/submission expires within two minutes of the image timestamp. For a full-screen source, pause to inspect its frozen review image, or select an external application window for a live preview. EveryHint's own windows are excluded; there is no evasion feature. A paused frozen review remains independently reviewable until expiry; Stop clears it.

Microphone and system transcripts are independently optional. Windows are 30, 60, 180 or 300 seconds. Only consented, current-session final utterances wholly within the window are eligible. Source/time labels and chronological order survive trimming; overlapping duplicate final text is suppressed per source. System audio identifies a capture source, not a known person. Raw audio never enters requests. Users may remove individual excerpts, previous exchanges or the image from a frozen review. Each removal creates a new review ID and resets approval; removed utterance IDs stay excluded for that conversation. Settings, diagnostics and credentials are not context inputs.

After inspecting the exact prompt/image, users must acknowledge this specific remote transfer, then Ask. Selected information goes to OpenAI for ChatGPT plan inference. The existing public Responses transport uses `input_text` plus an optional JPEG data URL `input_image`, `store:false`, `stream:true`, `tools:[]`, `tool_choice:"none"` and a frozen account/model. No server-side conversation ID, previous-response state, API-key fallback, Files API or tool executor is used. Claude remains default-off and requires its separately permitted API configuration and billing opt-in.

Follow-ups explicitly review selected bounded question/answer history (four pairs / 12,000 characters, 15-minute idle expiry); screenshots and transcripts must be selected again. Clear context cancels execution and clears in-memory history/review; account/provider/capture-session changes isolate conversations. Regenerate prepares the latest question and earlier exchanges for a new review without reattaching previous images/transcripts or feeding the answer being replaced back into history. A context-only answer may need a question or freshly selected context before another request. New manual approval is always required; Live uses its own bounded, independently acknowledged grant. Late/cancelled requests cannot update a newer session.

Safe React-rendered Markdown supports paragraphs, headings, lists, emphasis, inline/fenced code, language labels, per-code copy and simple tables, including incomplete streaming fences. HTML, links and images remain inert text; there is no code execution or syntax-colour claim. Compact mode shows provider/latest response/Get Answer/Expand; capture Pause/Stop and remote Cancel remain accessible.

Settings configure global Assist (default Ctrl+Alt+A) and Clear context (Ctrl+Alt+Shift+C). Chords are validated against each other and fixed Show/hide/Pause/Stop controls; OS conflicts are reported with UI/tray fallbacks. Assist opens/focuses the composer and prepares selected context for review, never inference. Local Ctrl+Enter only opens/focuses while EveryHint is focused. Physical hotkey and P5 Windows checks remain manual acceptance, separate from simulated-event tests. Live image/follow-up evidence is recorded in [TESTING.md](TESTING.md); mocks do not establish image reasoning.

## Product and identity

EveryHint is a Windows-first desktop assistant for authorised productivity, coding and conversations. It belongs to the EverySession/EveryDesk family. Feature research uses Cluely's public documentation; source code, visual designs, assets and logos are not copied. EveryHint uses the actual EverySession red/white/warm-grey, Poppins/Inter system recorded in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Its compact overlay, dashboard navigation, dark mode and desktop interactions are explicit adaptations of the mobile source.

Long-term completeness spans desktop assistance, live conversation intelligence, meeting records, personalisation, calendar/people/memory, utilities, enterprise and mobile. The matrix assigns every requested feature a stable ID, description, workflow, phase, status, dependencies, acceptance, tests, manual evidence and source classification. Named contextual actions map onto those IDs rather than inflate the total.

## Repository audit and actual baseline

| Area inspected | Existing implementation and evidence | Limits |
| --- | --- | --- |
| `src/main/index.ts`, preload, security, settings, hotkeys | Electron tray/frameless overlay, trusted fixed IPC, sandbox, source selection, fixed emergency/window shortcuts, configurable Assist/Clear and local preferences; core smoke | Physical hotkeys, DPI/multi-monitor and hardware acceptance remain open |
| `capture.ts`, `electron-capture.ts`, `session.ts` | Consent-gated screen/window snapshots, explicit start/pause/resume/stop, cleared paused/stopped frames, session guards | P7 detects stable visual changes locally; no OCR or semantic question/error recognition |
| `audio-host.ts`, `audio-permissions.ts`, renderer audio engine/worklet and shared audio contracts | Independent microphone/Windows playback, meters/mute, bounded PCM, no meeting bot | Synthetic regression verified; real routing/calls/devices still need Windows checks |
| Transcription controller/PCM/segmenter/worker/store, native whisper.cpp helper and pinned manifest | Local English tiny.en/base.en setup, real tiny.en known-speech inference, bounded final/partial source-labelled text | No multilingual model support, diarisation or saved meeting history; P7 analyses English final questions |
| AI context/controller/shared contracts | Shared P6 builder, optional question/presets, fresh image, final transcript selection/removal, frozen review/approval, history/stream/cancel/stale guards, safe Markdown/code/copy | Ephemeral history; simple Markdown subset; no custom modes or persistent meeting memory |
| `ai/plan/*` | EveryHint SIWC registration, signed plan grant, native OS vault, explicit account model list, image capability checks, answer-only Responses API | Genuine gpt-6.1-sol text, P6 VS Code image/follow-up and P7 automatic answer via synthetic microphone/real Whisper verified; physical audio and other models/sources/accounts require acceptance |
| Claude SDK adapter/environment and actual SDK loopback tests | API-only abstraction, empty tools/permissions denial, default-off session billing opt-in | Subscription sign-in blocked pending Anthropic approval; paid live authentication/inference not verified or authorised |
| Package/build/scripts/tests/docs | Pinned Electron/React/TS, 315-test P5 baseline; 458 current unit tests, five plan integration tests, six Claude SDK loopback tests, 174 Electron assertions and real local speech fixture | Unit/fixture coverage does not replace hardware/manual acceptance; no installers/updates/mobile backend |

Legacy Codex CLI login/blocked inference modules remain in the repository but are unused by application startup. A visible account button is not proof of inference access. The genuine response and its limitations are recorded in [P4.2 delivery](DECISIONS/P4.2-chatgpt-plan.md). Live test requests require explicit scope recorded in TESTING.md; ordinary app Live sharing requires the separate in-app grant.

## Layout contract

One trusted BrowserWindow presents all three layouts. Capture, transcription and provider controllers remain in main; changing a view must not acquire media, clear consent, reset a valid review, submit a question, enable API billing or create a second execution path.

| Layout | Current foundation | Future scope |
| --- | --- | --- |
| Compact overlay | Brand/provider/latest answer, source states, Get Answer, focus-only Ctrl+Enter, Expand, capture Pause/Stop, native dragging/resizing and opacity | Mode/question/top suggestion/latest answer and persistent Live status; global Assist prepares manual review; no universal invisibility claim |
| Expanded assistant | Real existing question/review/response/provider/model controls, live transcript, optional screenshot, collapsible panels, three built-in presets, safe Markdown/code copy and reviewed regeneration | Full custom modes/prompts remain P9; safe Markdown is a bounded subset |
| Dashboard | Home shows actual current session/provider state; Assistant and Settings expose working controls; Meetings, Knowledge, Calendar, People and Modes are honest planned destinations | Historical records, connected services and custom modes need their own approved phases; navigation is not feature completion |

Navigation destinations are Home, Assistant, Meetings, Knowledge, Calendar, People, Modes and Settings. Current operation is separate from future historical-content management. Dashboard and overlay share the same live state. Drafts and reviews stay mounted across navigation/settings; panels collapse without controlling capture. Active remote requests keep a visible cancel action outside hidden panels. Pause and Stop stay outside scrolling content at the minimum supported 360px native window width. There are no mock meetings, generated analytics, pretend account connections or fabricated history.

Appearance settings are local: Light (verified source default), Dark (desktop extension), System and 80–100% native opacity. Legacy appearance files migrate without changing existing preferences. Global shortcuts remain Ctrl+Alt+Space, Ctrl+Alt+P and Ctrl+Alt+Shift+X. Ctrl+Enter while EveryHint has focus opens/focuses the composer only; it does not submit or claim to be a global Assist shortcut. P6 configures Assist/Clear separately; a session timer remains outside this task.

## Context and consent model

**Manual (implemented):** users explicitly authorise local capture sources and transcription, independently select final mic/system text, screenshot and bounded question/answer history, review the frozen payload/model, and acknowledge each remote Ask. Raw audio stays local. A text-only question needs no capture. Source consent is not remote-sharing consent. Capture continues when hidden only if already explicitly active; tray/status and emergency controls explain this.

**Auto-Hint (implemented):** selected consented final microphone/system transcripts and stable screen changes are analysed locally. At most three ranked suggestions can be accepted into the shared frozen review, dismissed, suppressed as similar or allowed to expire. Acceptance never submits; remote Ask still needs review/acknowledgement. Screen changes alone only propose reviewing current context.

**Live Assist (implemented):** a separate acknowledged grant binds the current ChatGPT account/model, assistant/capture session and epoch, exact selected screen/window, transcript/image/history categories, trigger and limits. Defaults: 30 minutes, minimum 30 seconds between attempts, maximum 20 attempts. Limits are attempt counts, not monetary estimates; failed/uncertain attempts count. Only fresh high-confidence final spoken questions from shared sources trigger automatic Get Answer. One active request and at most one fresh pending candidate are allowed. Manual reviews have priority. No Claude automatic requests, retries or paid fallback exist. Mode and grant never persist. Capture Pause/Stop, Pause Live, cancellation, expiry, source/account/model/provider/intelligence-setting changes, Clear, lock/suspend/reload/crash/quit revoke sharing; Resume does not restore it. Root status, native title and tray show remote-enabled state even between requests or while the overlay is hidden. The existing five-minute model catalog may pause a longer grant early; refresh, reselect and authorise explicitly.

Retain current privacy bounds: no automatic screenshots/transcripts/AI-history persistence, local Whisper, selected-source/context validation in main, two-minute one-use review, 90-second inference deadline, 32,000-character responses, bounded QA memory/15-minute expiry, stale request/session guards and no automatic API/provider fallback. Future saved history/mobile synchronisation requires separate storage, retention, access and deletion design before enabling persistence.

## P7 local algorithms, actions and bounds

English interrogative/help rules do not require punctuation. They suppress reported/rhetorical/unrelated/incomplete cues and provisional/repeated/cross-source echoes, then combine relevance with a heuristic score (default 0.85; configurable 0.85–0.99, not a calibrated probability). Context uses nearby source-labelled final excerpts within 30 seconds and an optional current selected screen; it never identifies a person from a voice/source. A distinct authored classifier fixture comparison did not justify adding a model or dependency. Multilingual models and diarisation remain unimplemented.

Encoded screen hashes avoid repeated decoding. Changed images are reduced to 32×18 intensity samples; substantial mean/fractional differences must stabilise over at least 600 ms. No continuous images are uploaded. A screen change is not evidence of a question/error and never triggers remote inference alone. Windows OCR was evaluated but not added to this unpackaged prototype. Source exclusion covers a selected window/monitor handle, not selective masking of other apps inside a monitor image.

Seven typed actions use fixed instructions and the existing builder: Get Answer, What Should I Say Next, Suggest Follow-up Questions, Fact Check, Recap, Who Am I Talking To and Dynamic Suggestion. Fact Check remains visibly **unverified/context-only** without external retrieval. Recap uses only the selected retained window, not full-session P8 notes. Who returns user-provided participant information or unknown locally; there is no research/calendar/biometric lookup. Other actions prepare explicit reviews. Local event retention defaults to five minutes (1–15); bounds include 100 events, 20 questions, 100/12,000-character recent excerpts, 2,000 seen IDs and three suggestions. Question suggestions expire within 90 seconds and remaining retained time. Live rejects stale triggers older than 30 seconds and pre-authorisation questions. Immutable provider instructions treat all captured content as untrusted reference data. Removed transcript IDs cannot become automatic questions.

See [architecture](ARCHITECTURE.md), [design and checkpoint measurements](DECISIONS/P7-intelligence.md) and [verification/manual gates](TESTING.md).

## Provider and execution policy

Use permitted official authentication. EveryHint owns its registered ChatGPT connection; no shared Codex token, browser cookie or reverse-engineered endpoint is imported. Credentials stay outside React in native OS storage. Catalog visibility is advisory until inference completes. Screenshots require explicit image metadata; unknown support blocks them. ChatGPT plan usage limits remain provider/account-specific.

Claude subscription authentication remains conditional on Anthropic approval for distribution. Its API path requires a locally configured key and explicit, separately billed session opt-in; P7 makes no paid request. Future release eligibility is not established merely by the successful private ChatGPT test.

Captured content is untrusted reference material, never authority. Providers cannot execute arbitrary shell commands, change files, install packages or control the computer. Future factual research must use an explicitly authorised capability with source/uncertainty disclosure. Sharing, email, calendar writes, CRM/ATS sync, invitations and enterprise administration require their own permission/review boundaries; no connector is created in this milestone.

## Feature acceptance and roadmap

P1–P3 provide the existing desktop/audio/local speech foundation. P4 covers authorised providers. P5 delivered the source-verified design/layout foundation with human acceptance open. P6 implements explicit screen-aware Assist/shortcuts/follow-ups/rich responses; P7 local detection and approved dynamic assistance; P8 meeting records; P9 modes/personal knowledge; P10 calendars/people/memory; P11 enterprise; P12 mobile; P13 accessibility/performance/privacy/packaging/updates/security/release. [BACKLOG.md](BACKLOG.md) supplies phase gates and testable acceptance. Phases are not automatically authorised by this specification.

A requirement is COMPLETE only after its full acceptance criteria, required automated coverage and manual/platform verification have passed and dependencies are resolved. A planned screen or disabled selector is not completion. Partial implementations remain identified as partial. Passing one provider request does not prove all models or providers. No 95%-accuracy, 300ms, universal privacy, commercial-approval or cross-device-sync claim is inherited from competitor marketing.

## Current milestone acceptance

- Exactly 103 unique inventory rows and nine action mappings, with source classification and honest evidence.
- EverySession source/provenance documented before UI changes; source files and Git status unchanged.
- Central semantic tokens, licensed local typography, tested light/dark contrast, focus/reduced-motion states and safe legacy settings migration.
- Connected compact/expanded/dashboard views with real existing controls, accessible navigation, collapsible panels and no simulated future data.
- P6 Manual Assist preserved; P7 local detection/correlation, seven actions, bounded suggestions and separate scoped Live requests. No raw-audio transfer, tool execution, automatic Claude or paid API fallback.
- TypeScript, lint, unit/contrast/appearance tests, existing SDK/plan/core/AI/speech checks, production build and visual/interaction smoke pass.
- Manual Windows DPI, keyboard/screen-reader, drag/resize/opacity, real-device/transcription/provider and long-run checks are documented without claiming completion.
- Commit `feat: add EveryHint automatic conversation intelligence`, no co-author trailer, clean Git, then stop after P7.
