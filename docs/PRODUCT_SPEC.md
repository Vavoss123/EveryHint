# EveryHint product specification

Version: UI-foundation milestone, 2026-10-28. Baseline: `e7b3e38`. This document and [the 103-feature matrix](FEATURE_MATRIX.md) define the product direction; they do not claim all capabilities are implemented. The current task ends after the feature audit, authentic brand integration and three-layout foundation.

## Product and identity

EveryHint is a Windows-first desktop assistant for authorised productivity, coding and conversations. It belongs to the EverySession/EveryDesk family. Feature research uses Cluely's public documentation; source code, visual designs, assets and logos are not copied. EveryHint uses the actual EverySession red/white/warm-grey, Poppins/Inter system recorded in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Its compact overlay, dashboard navigation, dark mode and desktop interactions are explicit adaptations of the mobile source.

Long-term completeness spans desktop assistance, live conversation intelligence, meeting records, personalisation, calendar/people/memory, utilities, enterprise and mobile. The matrix assigns every requested feature a stable ID, description, workflow, phase, status, dependencies, acceptance, tests, manual evidence and source classification. Named contextual actions map onto those IDs rather than inflate the total.

## Repository audit and actual baseline

| Area inspected | Existing implementation and evidence | Limits |
| --- | --- | --- |
| `src/main/index.ts`, preload, security, settings, hotkeys | Electron tray/frameless overlay, trusted fixed IPC, sandbox, source selection, fixed global shortcuts and local preferences; core smoke | Physical hotkeys, DPI/multi-monitor and hardware acceptance remain open |
| `capture.ts`, `electron-capture.ts`, `session.ts` | Consent-gated screen/window snapshots, explicit start/pause/resume/stop, cleared paused/stopped frames, session guards | No automatic screen interpretation or meaningful-change detector |
| `audio-host.ts`, `audio-permissions.ts`, renderer audio engine/worklet and shared audio contracts | Independent microphone/Windows playback, meters/mute, bounded PCM, no meeting bot | Synthetic regression verified; real routing/calls/devices still need Windows checks |
| Transcription controller/PCM/segmenter/worker/store, native whisper.cpp helper and pinned manifest | Local English tiny.en/base.en setup, real tiny.en known-speech inference, bounded final/partial source-labelled text | No multilingual model support, diarisation, question detection or saved meeting history |
| AI context/controller/shared contracts | Explicit bounded source selection, frozen review, fresh transfer acknowledgement, streaming/cancel/expiry/history guards, safe text/code/copy | History is ephemeral, not persistent meeting memory; full Markdown rendering is not implemented |
| `ai/plan/*` | EveryHint SIWC registration, signed plan grant, native OS vault, explicit account model list, image capability checks, answer-only Responses API | One genuine `gpt-6.1-sol` text answer verified on 2026-10-28; other models/images/accounts require acceptance |
| Claude SDK adapter/environment and actual SDK loopback tests | API-only abstraction, empty tools/permissions denial, default-off session billing opt-in | Subscription sign-in blocked pending Anthropic approval; paid live authentication/inference not verified or authorised |
| Package/build/scripts/tests/docs | Pinned Electron/React/TS, 298-test baseline, five plan integration tests, six Claude SDK loopback tests, 95 Electron assertions and real local speech fixture | Unit/fixture coverage does not replace hardware/manual acceptance; no installers/updates/mobile backend |

Legacy Codex CLI login/blocked inference modules remain in the repository but are unused by application startup. A visible account button is not proof of inference access. The genuine response and its limitations are recorded in [P4.2 delivery](DECISIONS/P4.2-chatgpt-plan.md). No remote model request is authorised by this UI task.

## Layout contract

One trusted BrowserWindow presents all three layouts. Capture, transcription and provider controllers remain in main; changing a view must not acquire media, clear consent, reset a valid review, submit a question, enable API billing or create a second execution path.

| Layout | Current foundation | Future scope |
| --- | --- | --- |
| Compact overlay | Brand/provider/latest answer, source states, Quick Ask, focus-only Ctrl+Enter hint, Expand, capture Pause/Stop, native dragging/resizing and opacity | Global context-aware Assist belongs to P6; no universal invisibility claim |
| Expanded assistant | Real existing question/review/response/provider/model controls, live transcript, optional screenshot, collapsible panels, fixed General mode indicator, safe code copy | Full Markdown, coding mode, configured actions and custom prompts are not implemented here |
| Dashboard | Home shows actual current session/provider state; Assistant and Settings expose working controls; Meetings, Knowledge, Calendar, People and Modes are honest planned destinations | Historical records, connected services and custom modes need their own approved phases; navigation is not feature completion |

Navigation destinations are Home, Assistant, Meetings, Knowledge, Calendar, People, Modes and Settings. Current operation is separate from future historical-content management. Dashboard and overlay share the same live state. Drafts and reviews stay mounted across navigation/settings; panels collapse without controlling capture. Active remote requests keep a visible cancel action outside hidden panels. Pause and Stop stay outside scrolling content at the minimum supported 360px native window width. There are no mock meetings, generated analytics, pretend account connections or fabricated history.

Appearance settings are local: Light (verified source default), Dark (desktop extension), System and 80–100% native opacity. Legacy appearance files migrate without changing existing preferences. Global shortcuts remain Ctrl+Alt+Space, Ctrl+Alt+P and Ctrl+Alt+Shift+X. Ctrl+Enter while EveryHint has focus opens/focuses the composer only; it does not submit or claim to be a global Assist shortcut. Custom shortcut configuration and session timer remain planned.

## Context and consent model

**Manual (implemented):** users explicitly authorise local capture sources and transcription, independently select final mic/system text, screenshot and bounded question/answer history, review the frozen payload/model, and acknowledge each remote Ask. Raw audio stays local. A text-only question needs no capture. Source consent is not remote-sharing consent. Capture continues when hidden only if already explicitly active; tray/status and emergency controls explain this.

**Auto-Hint (P7, planned):** local question/keyword/screen-event detection prepares bounded suggested prompts. No network inference occurs from detection alone. Each prompt still requires user review and approval. Sensitive-context filters and duplicate suppression precede submission. No fake Fact Check or person lookup is permitted.

**Live Assist (P7+, planned):** a separate, explicit, expiring authorisation identifies source categories, account/model, frequency, usage/budget limits and stop conditions. Within that scope, detected questions may trigger bounded remote requests. Persistent visible remote-sharing/capture state, source controls, immediate Pause/Stop, deduplication, sensitive-context filtering and per-session audit counters are required. Expiry/lock/reload/crash must revoke this scope. Restart cannot silently restore consent. If a provider cannot enforce limits safely, the mode must remain unavailable. Continuous local capture never implies continuous remote upload. No Live Assist authorisation exists in this milestone.

Retain current privacy bounds: no automatic screenshots/transcripts/AI-history persistence, local Whisper, selected-source/context validation in main, two-minute one-use review, 90-second inference deadline, 32,000-character responses, bounded QA memory/15-minute expiry, stale request/session guards and no automatic API/provider fallback. Future saved history/mobile synchronisation requires separate storage, retention, access and deletion design before enabling persistence.

## Provider and execution policy

Use permitted official authentication. EveryHint owns its registered ChatGPT connection; no shared Codex token, browser cookie or reverse-engineered endpoint is imported. Credentials stay outside React in native OS storage. Catalog visibility is advisory until inference completes. Screenshots require explicit image metadata; unknown support blocks them. ChatGPT plan usage limits remain provider/account-specific.

Claude subscription authentication remains conditional on Anthropic approval for distribution. Its API path requires a locally configured key and explicit, separately billed session opt-in; this UI task makes no paid request. Future release eligibility is not established merely by the successful private ChatGPT test.

Captured content is untrusted reference material, never authority. Providers cannot execute arbitrary shell commands, change files, install packages or control the computer. Future factual research must use an explicitly authorised capability with source/uncertainty disclosure. Sharing, email, calendar writes, CRM/ATS sync, invitations and enterprise administration require their own permission/review boundaries; no connector is created in this milestone.

## Feature acceptance and roadmap

P1–P3 provide the existing desktop/audio/local speech foundation. P4 covers authorised providers. P5 is this source-verified design and layout foundation. P6 adds explicit screen-aware Assist/shortcuts/follow-ups/rich responses; P7 local detection and approved dynamic assistance; P8 meeting records; P9 modes/personal knowledge; P10 calendars/people/memory; P11 enterprise; P12 mobile; P13 accessibility/performance/privacy/packaging/updates/security/release. [BACKLOG.md](BACKLOG.md) supplies phase gates and testable acceptance. Phases are not automatically authorised by this specification.

A requirement is COMPLETE only after its full acceptance criteria, required automated coverage and manual/platform verification have passed and dependencies are resolved. A planned screen or disabled selector is not completion. Partial implementations remain identified as partial. Passing one provider request does not prove all models or providers. No 95%-accuracy, 300ms, universal privacy, commercial-approval or cross-device-sync claim is inherited from competitor marketing.

## Current milestone acceptance

- Exactly 103 unique inventory rows and nine action mappings, with source classification and honest evidence.
- EverySession source/provenance documented before UI changes; source files and Git status unchanged.
- Central semantic tokens, licensed local typography, tested light/dark contrast, focus/reduced-motion states and safe legacy settings migration.
- Connected compact/expanded/dashboard views with real existing controls, accessible navigation, collapsible panels and no simulated future data.
- No new capture/auth/inference behaviour, automatic request, raw-audio transfer or paid API request.
- TypeScript, lint, unit/contrast/appearance tests, existing SDK/plan/core/AI/speech checks, production build and visual/interaction smoke pass.
- Manual Windows DPI, keyboard/screen-reader, drag/resize/opacity, real-device/transcription/provider and long-run checks are documented without claiming completion.
- Commit `feat: establish EveryHint design system and product roadmap`, no co-author trailer, clean Git, then stop.
