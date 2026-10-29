# EveryHint desktop UX milestone — 2026-10-29

Baseline: `e00813a`, version **0.5.0**. This is a source UX restructuring milestone. The existing private installer was not rebuilt, replaced, published or distributed. Earlier packaged RC results describe that earlier artifact, not this source revision. Existing physical-device, genuine-provider, Google and receiver release gates remain open.

## Before and after

| Before | After |
| --- | --- |
| One window switched between dashboard and overlay; its topmost setting affected both | Separate dashboard and floating assistant. Dashboard is always an ordinary, focusable Windows window; only the assistant can be pinned |
| Close hid the only window; Minimise was absent | Minimise, maximise/restore, labelled Hide to Tray, explicit Quit, tray restoration and actual custom shortcut display |
| Stop appeared while capture was off | Capture-state-driven Start, Pause, Resume and Stop. Idle/Stopped/Error show no Stop or Pause |
| Home repeated technical explanations and configuration | One Start EveryHint action, connection status, compact source indicators, recent meetings and direct Modes/Calendar/Knowledge links |
| Asking required passing provider, transcript and context settings | Answers first, message input, a small mode selector, Attach Context and a secondary conversation menu |
| History was preceded by encryption and persistence configuration | History/search/date groups/titles/durations first; retention, saving, lock and deletion are in Privacy & Data |
| Every start repeated setup; signed-out registrations looked connected | Three-step setup for new installations; upgrades reuse settings. Distinct account/model readiness and explicit Connect ChatGPT |
| Mode cards exposed many controls | Two-column mode list/editor, active indication, New Mode and six starting templates; advanced options remain available |
| Large mixed settings page and duplicate Settings navigation | One Settings entry with six focused sections |

EveryHint retains #E01A34, bundled Poppins headings and Inter body. New installations use near-black dark surfaces. Existing light/system preferences remain. No competitor branding or assets were copied, and no reference screenshots were attached to this task.

## Checkpoints

1. **UX.1 — Window behaviour:** first verified with nine new session-control cases and twelve real Windows Electron window assertions before the dashboard restructuring. Subsequent lifecycle coverage includes native Windows shortcut injection, actual native close-dialog choices, tray callbacks, startup and full restart.
2. **UX.2 — Dashboard and assistant:** verified with nineteen initial Windows assertions covering setup, single Start/Settings entries, composer draft preservation, separate overlay and pinning. Later UI checks cover frozen reviews, context availability, themes, typography and cross-window navigation.
3. **UX.3 — Meetings and settings:** actual encrypted worker/native-key tests verify readable existing history after restart, unchanged opt-in saving, account/profile separation and all meeting editing/search/export/resume flows. Account states are tested independently from genuine OAuth. Custom modes/documents and Calendar/People/memory regressions remain included.
4. **UX.4 — Polish and regression:** the complete source gate and all ten Electron suites are recorded in [the execution receipt](evidence/ux-verification.json). Automation is distinguished from human and receiving-device acceptance below.

## Window and session verification

The dashboard uses `alwaysOnTop:false`, `skipTaskbar:false`, normal activation and explicit `minimize()`, `restore()`, `show()` and `hide()`. Initial display uses `showInactive()` to avoid taking focus. The floating assistant is not a dashboard child/modal window. It starts hidden, can be moved/resized, has its own optional pin/opacity and stays dismissed through settings, capture and answer updates. Tray and shortcut access restore it deliberately. Display add/remove/metrics events clamp both windows to the current work area in device-independent coordinates, including negative monitor origins.

Idle Close quits. Closing an Active, Paused or prepared session offers **Keep running in background**, **Stop and quit**, and **Cancel**, with Cancel as the default. Background capture retains the real tray status, source states and enabled Stop action. Explicit Quit revokes work and uses the existing bounded storage/provider shutdown barrier. A destroyed-window title update discovered during forced test cleanup was guarded.

Native automation read Windows styles: no topmost/tool-window/no-activate flag and no owner on the dashboard. Windows-injected custom Show/Hide, Pause/Resume and emergency Stop worked while hidden. UI Automation inspected and chose the actual native background/stop-and-quit dialogs. Minimise and tray restoration operated on real windows. This verifies native configuration and automated interaction; human taskbar/Alt+Tab switching among unrelated applications remains a manual check.

| Capture state | Session controls |
| --- | --- |
| IDLE / STOPPED / ERROR | Start EveryHint on Home; no Pause or Stop |
| Preparing | Source choices, fresh participant/capture acknowledgement, explicit Start; no recording from preferences |
| READY | Start and Cancel setup; no Stop or Pause while capture is off |
| ACTIVE | Pause and Stop, selected source status, manual/authorised automatic AI status |
| PAUSED | Resume and Stop; no capture or automatic inference |

The existing capture controller remains authoritative. Hiding/minimising changes visibility only. Stop clears capture consent and revokes Live work; restart restores neither. Saved source/help preferences never become recording or remote-sharing grants. Local transcription is available through a compact control and cannot enable until an authorised audio source is capturing. Whisper model installation and downloads remain explicit.

## Navigation and progressive disclosure

Main navigation: **Home · Assistant · Meetings · Knowledge · Calendar · People · Modes · Settings**. Settings appears once, at the bottom of the navigation. Narrow icon navigation keeps explicit accessible names.

Settings sections: **General; Audio & Screen; Shortcuts; Privacy & Data; Account & AI; Advanced**. Theme, startup, default mode and language are in General. Device selection/tests reuse capture consent. Shortcuts includes actual registration results and keyboard-accessible overlay movement. Privacy & Data contains opt-in history, retention, lock/deletion and Windows protection. Advanced retains provider diagnostics/optional Claude billing, context limits, capture interval, transcription logs, note-template editing and Google connection configuration.

Chat retains removable exact-context review, fresh transfer acknowledgement and Ask. Only available screen/transcript/conversation sources are offered; knowledge and workspace selections retain their existing gates. Conversation responses remain primary. Session options retain Auto-Hint, scoped Live consent, contextual actions, local transcription, saving and automatic End-note controls. Mode templates include General, Coding, Interview, Sales, Meeting and Lecture; Lecture creates an ordinary custom mode without reserving an existing stored ID. Legacy Conversation and existing associations are preserved.

## Authentication and encrypted history

Connection states are **Not signed in; Signed in, model setup required; Ready; Reconnecting; Connection problem**. A remembered signed-out registration is not treated as authentication. Explicit Connect uses the existing browser OAuth/plan grant. After authorised sign-in or an explicit model-list request, the default is selected only from validated returned metadata, preferring explicit image capability. No startup discovery/inference request or paid API fallback was introduced. Manual account/model selection and provider diagnostics remain accessible. Catalog availability is distinct from successful inference access; the UI states that answer access is confirmed by a completed response.

Existing history is restored only for the selected profile when its database already exists. It uses the unchanged `HistoryWorker`, `MeetingKeys`, Windows Credential Manager namespace, AES-GCM cipher, recovery and retention rules. A missing/unavailable key exposes Unlock History and preserves the database; no replacement key/plaintext fallback is introduced. An empty installation does not create a history database by opening Home/Meetings. Automatic saving stays off unless previously explicitly chosen. Explicit locks, Windows lock/suspend, profile changes and reload/failure revocation remain effective.

The version-1 settings schema is retained with optional validated non-sensitive preferences. Existing installations without a setup-completion field migrate as already set up. Existing theme, pin preference (now overlay-only), source interval, custom modes, knowledge and local records are retained. No ordinary upgrade restarts recording or grants remote sharing.

## Automated results and Windows evidence

Exact counts and commands are in [ux-verification.json](evidence/ux-verification.json). The source gate checks generated theme/spec consistency, TypeScript, zero-warning ESLint, all **722 tests in 59 files** and the production build. All **706 baseline unit cases** remain; sixteen cases cover new controls, connection/default-model logic and upgrade preferences. The existing provider fixtures add **5 plan + 6 installed-SDK tests**; native encrypted storage adds **12 assertions**.

Electron suites total **354 assertions**: core 47, AI 44, speech 11, UI 47, intelligence 28, meetings 42, personalisation 34, contextual workspace 36, Windows privacy 20 and UX lifecycle 45. Real cached tiny.en runs through both synthetic audio sources; no physical microphone, screen or playback was recorded. No genuine OAuth, Google or AI request, paid request, installer execution or publication was performed. Fixture answers and injected renderer states are labelled test data only.

Restart regression exposed a loading-state lock race. Lifecycle revocation now follows actual main-frame document navigation rather than the tab-spinner event, with startup and same-document navigation distinguished. Repeated clean-profile contextual-workspace restarts pass; real reloads of both dashboard and assistant still stop capture, revoke sharing and retain the history lock boundary. The restart test also waits for restore's busy state to finish before asserting final cache counts.

Local evidence (ignored app-only screenshots/data):

- `artifacts/ux/window-checkpoint.json`: native styles, window lifecycle, custom global shortcuts, active background capture, tray Stop/restoration, native close dialogs, tray startup and restart.
- `artifacts/ui-smoke.json`: accessibility/navigation/theme/context checks and local timing.
- `artifacts/ui/dashboard-dark.png`, `dashboard-light.png`, `narrow-settings-125.png`, `floating-assistant-dark.png`.
- `artifacts/ai-smoke.json`, `speech-smoke.json`, `p7-smoke.json`, meeting/P9/P10 smoke artifacts and `p11-desktop-smoke.json`: retained feature regressions and explicit fixture scope.

These are actual Windows Electron runs using isolated synthetic profiles and native keys. Browser zoom/forced-color emulation does not establish OS DPI, Narrator or human high-contrast acceptance. No physical receiver result is claimed. Display-event handling is implemented and pure monitor-boundary tests pass; physical multi-monitor unplug/mixed-DPI acceptance remains pending. No universal performance improvement, leak freedom or hardware endurance claim is made from short automated runs.

## Outstanding manual checks and release blockers

- Human keyboard-only traversal, Narrator, actual Windows high contrast, physical taskbar/Alt+Tab/focus conflicts and drag/resize acceptance.
- Real 100/125/150/175/200% Windows DPI, mixed monitors, unplug/reconnect, Windows lock/sleep/resume and long-session resource measurements.
- Physical microphone/system playback/device changes, consented real calls, transcription/AI quality and the carried-forward P1–P10 manual scenarios.
- Freshly authorised genuine browser OAuth/model/account switching/revocation, ChatGPT/Live and Google workflows; earlier grants are consumed and not reused.
- Discord, Teams, Zoom and recorders on real receiving devices with protection-off positive controls, both app-window and full-monitor sharing, transitions and second-monitor cases. No compatibility or guaranteed invisibility claim.
- A distinct approved candidate package, clean Windows 10/11 installation/true upgrade/uninstall, signing, provider/distribution eligibility, trusted update hosting/key setup and the existing independent release/security review gates.

The milestone is implemented and source-tested; distribution remains **NO-GO**. Version stays **0.5.0**. No installer or external release has been created for these UX changes.

## Changed files

The complete changed-file inventory is recorded in [the receipt](evidence/ux-verification.json). Main groups are window/settings/preload/shared contracts; dashboard/chat/account/meeting/mode/settings/setup components and semantic styling; all eight existing Electron harnesses plus Windows/UX native checks; unit/upgrade tests; and the product/design/architecture/testing/delivery/RC documentation. Capture, Whisper, provider transports, OAuth token vaults, meeting cipher/database/key code, knowledge extraction, calendar and memory engines were not rewritten.

Implementation reference: [Electron display events and DIP coordinates](https://www.electronjs.org/docs/latest/api/screen). Local Electron 45 type declarations and real native executions validate the window methods used here.
