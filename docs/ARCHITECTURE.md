# EveryHint architecture

## P11 Windows privacy and release boundary

`Settings.protectWindow` migrates false. `configureWindowPrivacy` applies Electron content protection before display, checks `isContentProtected()` and returns requested/configured/off/error/unsupported without leaking raw native errors. `AppSnapshot.privacy` drives persistent accessible status/Settings; it reports configuration only. [Receiver matrix and limits](P11_ACCEPTANCE.md) remain pending. Appearance changes do not grant capture/sharing.

Trusted no-argument `desktopStatus` IPC exposes local identity/update state. Narrow `update` action IPC and `onUpdates` events drive the manual check/download/progress/cancel/restart UI. `UpdateController` accepts only bundled packaged-Windows policy and authenticates canonical metadata with pinned Ed25519 before download. `windowsUpdater` uses electron-updater 6.8.11 with auto-download/quit-install/prerelease/downgrade/web/differential disabled, and rehashes/rechecks exact Windows publisher before install. A native Later-default confirmation stops capture and flushes/locks stores before restart. Current policy is disabled by user choice: no endpoint, publisher or key, no updater construction/network. [Update architecture/operator gates](UPDATES.md).

`developmentUrl` ignores overrides when packaged. Stop cancels Assistant and Live before capture teardown; same-session STOPPED/ERROR cancels stale inference. Stream text publication is bounded at 20 Hz; terminal/error/cancel state publishes immediately and clears the timer. Existing payload/source guards still run per delta. Workspace disposal is awaited with provider/history teardown inside the five-second quit barrier; the timeout is a fallback, not an erasure guarantee.

`electron-builder.yml` packages compiled outputs/production dependencies in integrity-checked ASAR, native keyring/Claude assets unpacked, and only the pinned helper/license as speech resources. Unused Codex CLI, source/tests/profiles/maps/models are excluded. The revision/architecture/size/SHA-256 manifest is generated inside ASAR; `SpeechInstallation` uses the resource helper in packaged builds and verifies it before starting. Development retains its explicit locally built runtime. Models stay in the explicit local cache with existing hashes. `source-labels.cmake` adds standard source-relative `#line` directives to the fetched build copy only; the wrapper is similarly generated. No developer-home path was found in the release helper/compiled outputs. Unsigned ASAR/manifest integrity is not publisher authentication against a same-user attacker.

NSIS is forced current-user/asInvoker with no elevation helper, optional unchecked desktop shortcut and retained user data/credentials/models on uninstall. `scripts/build-windows.mjs` always builds/prepares manifest/icon, disables signing auto-discovery and uses publish-never. Fuses disable Node options/inspector/file extra privileges and enable embedded ASAR integrity/ASAR-only loading. RunAsNode remains enabled for the optional Claude compatibility path. The updater is implemented but stays unconfigured; real signing/hosting/key infrastructure and genuine upgrade acceptance are required before activation. Full commands/clean-machine/signing gates: [P11 acceptance](P11_ACCEPTANCE.md).

## P10 contextual workspace

Design/checkpoints: [P10-context.md](DECISIONS/P10-context.md). `WorkspaceController` owns a separate profile/scope/epoch, local lock, Google clients, bounded caches, source checks, reminders and encrypted batches. It reuses `PersonalStore`/PersonalDatabase worker and P8 `MeetingCipher`/`MeetingKeys`. Schema 3 adds authenticated encrypted `workspace` records keyed by kind/opaque ID, with expiry metadata and atomic replacement. Existing P9 configuration version 2 is retained. P10 databases use the meeting root's `context` directory and native key service `EveryHint.Context.v1`; P9/P8 retain independent services. OAuth tokens reuse chunked `KeyringVault` under `EveryHint.GoogleOAuth.v1`, keyed by local-profile/service hash, never React or a credential JSON file.

Only opaque category/IDs, last-write/expiry metadata and a tiny per-profile restore flag are outside ciphertext. Settings, client IDs, calendar/people content, contact sync tokens, memory/evidence and saved briefs are encrypted. No raw audio is added. Events/people/memory/associations are each bounded to 1,000 records, saved briefs to 30, database global capacity to 10,000 rows. Worker scans/ranks at most a 1,000-record category and returns 25 items. P9 `rankSections` remains four excerpts by default; the bounded memory caller ranks its larger local category. Main holds a finite event window; plaintext indexes are not persisted.

Frozen preload `workspace.get/command/query/onState/onNavigate` passes exact trusted-document IPC and strict action/envelope validation. Renderers cannot pass tokens, endpoints, SQL, paths, internal context text or permission predicates. IDs are resolved in main. Scope checks run before/after awaited store operations and before external-result publication. Profile change, lock, cancellation and source mutation revoke Live and clear assistant content. Callbacks cancel and old workers/accounts close before reuse. Chosen restore runs **after initial renderer loading**, preventing the initial reload safety lock from racing the native-key open. Later reload/failure/Windows lock/suspend locks without restoring sharing.

### P10 Google setup and distribution

1. In Google Cloud create a development project, enable **Google Calendar API** and **People API**, configure consent branding/audience, and add test users. Create an **OAuth client of type Desktop app**. Do not use a Web client or embedded sign-in webview. No client secret is hardcoded, retained or treated as a desktop confidentiality boundary.
2. In EveryHint Settings unlock local context, enter the public Desktop client ID independently for Calendar/Contacts, acknowledge and save. Calendar works without Contacts. Click the separately acknowledged connection and finish account selection/consent in the system browser. Configuration errors remain disconnected/error states; credentials/events are never invented.
3. Calendar scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, `https://www.googleapis.com/auth/calendar.events.readonly`. Contacts separately requests `openid`, `email`, `https://www.googleapis.com/auth/contacts.readonly`. Exact role scopes are validated; missing/broader grants fail. Google access never grants OpenAI sharing.
4. Load authorised calendars, select at most five and refresh. Contacts search/import is optional; whole-book sync requires another acknowledgement and remains manual. Disconnect attempts revocation and clears local credentials/cache; remote failure is reported. Google can revoke **all clients/scopes in the same Cloud project**: separate consent does not guarantee independent project-wide revocation. Manual People facts and P8 meetings survive.
5. Before public distribution separate development/production configuration and complete applicable Google consent/brand/domain/privacy/sensitive-scope verification and Limited Use requirements. Provide accurate data-use/deletion disclosures and test expiry/revocation. **No Google production approval is claimed.** A configured client and real test-account permission were unavailable; genuine checks remain pending.

Official sources reviewed before implementation: [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Calendar sync](https://developers.google.com/workspace/calendar/api/guides/sync), [People contacts](https://developers.google.com/people/v1/contacts), [connections sync](https://developers.google.com/people/api/rest/v1/people.connections/list), [contact search](https://developers.google.com/people/api/rest/v1/people/searchContacts), [OpenID validation](https://developers.google.com/identity/openid-connect/openid-connect), [production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance). More detail is in the decision record.

### P10 sync, reminders and network boundaries

Google OAuth uses random state/nonce and S256 PKCE, one 127.0.0.1 random-port callback path, strict host/GET/remote-IP/size/state checks, five-minute cancellation, RS256/issuer/audience/nonce/subject/time validation and cached signing keys with one key-ID rotation refresh. Tokens refresh through official Google OAuth with one bounded 401 recovery; revoked access clears native credentials. Calendar/Contacts have different token sets and one Google subject per local profile/service. Google identity switching removes old imported/cache portions without changing ChatGPT registration.

Calendar performs **full-window replacements**, past seven/future ninety days, `singleEvents=true`, selected calendars and complete pagination. Official `syncToken` restrictions forbid timeMin/timeMax/orderBy; mixing it with this recurrence window is incorrect. No Calendar syncToken is sent or advertised. A 410 restarts the window once. Repeated page tokens, excessive pages/events or network/rate failures retain a visibly stale previous complete cache; permission loss clears inaccessible cache. Manual refresh has a 30-second minimum; chosen auto sync runs about every 15 minutes with exponential/retry-after backoff capped at an hour. No Google writes exist. Contacts warms explicit search, batch-reads selected resource names, and implements separately opted-in paginated connection deltas with stable parameters and seven-day/410/EXPIRED_SYNC_TOKEN reset. Failed pagination never commits a partial full-book token.

Reminders check local cache every 30 seconds while unlocked and persist start/lead-time receipts before delivery, preferring a potentially missed crash-time toast over a duplicate. They skip all-day/past/disabled/outside-two-minute-catch-up events. Reschedule/cancellation/settings/scope changes close toasts and invalidate in-flight delivery; restart restores only chosen local policy. Notification clicks reveal preparation, never join/capture. Detection uses calendar timing and existing capture idle state; no process/foreground inspection runs.

Google sync, local extraction/search and OpenAI inference remain separate. `googleFetch` allowlists official token/revoke/Calendar/People/cert endpoints, GET-only data operations, bounded JSON, no redirects/cookies/URL credentials. Google text cannot become an AI instruction or grant. Memory enablement cannot create remote permission.

### P10 memory, preparation and deletion

`workspace/memory.ts` deterministically extracts literal notes and explicit supported P8 decisions/actions/topics/commitments/follow-ups, checking AI evidence against selected saved transcript refs/quotes. Uncertain/unsupported AI claims are omitted; user claims retain authorship. Documents retain section/revision/evidence. No temporary session is indexed. Rebuild explicitly selects up to 25 meetings/five documents, replaces only those sources and resets review to pending. Approved/current/unexcluded records can later be selected. Corrections retain evidence and become user-authored. No identity/personality/sensitive-attribute inference occurs.

`buildContext` resolves one event, at most five people/eight approved memories/three ended saved meetings into excerpts capped at 1,800 characters each and 14,000 serialized workspace characters. It retains refs/provenance/revision predicates/notices. Description is separately selected; people, memories, notes and knowledge excerpts can be removed from exact review. Existing total budgets apply (brief 30,000, hard maximum 40,000). Excerpts are bounded, not complete histories. AssistantController combines workspace/knowledge/P8 guards, rotates review IDs on removal, requires fresh acknowledgement and checks after auth inspection, immediately before POST and throughout streaming. Responses retain sources, outside automatic QA history. P9 preferences cannot authorise sharing.

Briefs reuse discovered ChatGPT models/Responses without tools or billing fallback. Persistence defaults off; explicit saving uses 7/30/90-day expiry and a 30-brief cap. Regeneration stays a draft until Save. Settings/source changes conservatively clear saved derivatives. Copy is deliberate plaintext; export uses native selection, exclusive creation, scope checks and cleanup of its incomplete file. Changed/locked sources prevent returning saved briefs as current. Event/recurrence/Google-subject associations never overwrite/destroy independent P8 history. Live stages exact bounded source texts; its enabled/remote grant binds profile/source IDs/mode/account/capture/assistant session and existing cooldown/cap. P10 sharing defaults absent.

Memory retention is last-modified age, 30/90/365 days or until deletion, through expiry-filtered reads/reconciliation; shortening policy updates expiry/removes expired records. Events expire seven days after end and are replaced by complete windows. People/manual notes persist until deletion. Provider deletion/disconnect strips imported snapshots while manual facts/links survive. Managed source mutations invalidate sharing and clear derivatives while workspace storage is unlocked. Closed encrypted stores cannot be rewritten: later unlock/source availability reconciles changed/missing derivatives; unavailable sources are rejected for sharing meanwhile. Brief loading validates current references. Local deletion does not delete Google/original files, provider records, clipboard copies, exports, backups or SSD remnants. Secure physical erasure and same-user compromise protection are not claimed; P8/P9 key-loss limits remain.

## P9 modes, knowledge and template extension

[P9-personalisation.md](DECISIONS/P9-personalisation.md) records the typed modes, instruction precedence, bounded extraction/retrieval, encrypted storage, exact sharing scope and template limitations. `PersonalController` owns profile/scope/revision state and calls the same P6 `AssistantController` and P7 scheduler, never a second provider. `PersonalStore` hosts encrypted configuration/document metadata/sections in a separate SQLite worker using P8 `MeetingCipher`, `MeetingKeys` and `historyProfile`; its native key service is `EveryHint.Personal.v1`. Disposable 12-second parser workers isolate PDF.js/fflate/Saxes from main, capture and Whisper. Unlock loads only config/metadata; bounded on-demand retrieval scans selected sources without a persistent plaintext index.

The existing exact-sender IPC gate exposes scoped metadata commands, native-dialog import, inspection and paged local search; renderers cannot supply paths, bytes, internal contexts or permission predicates. Shared mode context is supplied in main to manual/action/automatic/meeting reviews. Knowledge requires explicit selected IDs plus frozen excerpt review, or an independent Live knowledge grant. Revocation, before/after-await revision guards and pre-POST/stream predicates stop stale or removed sources. Mode/template preferences cannot override immutable provider safety, capture, sharing, authentication, billing or tool restrictions.

Meeting templates map 1–7 ordered headings/guidance fields onto the existing P8 evidence schema. Snapshot templates survive library edits/deletion and drive draft/saved/export views; prior saved summaries/decisions/actions are archived on Apply and removed with generated/transcript derivatives. Manual notes remain separate. Config schema 1→2 migrates templates; storage schema 1→2 adds documents/sections transactionally. Only extracted text/metadata are copied; original files remain untouched. No P10/P11/P12 work or multilingual speech model was added.

## P8 storage, meeting AI and sharing boundaries

The design and four independently verified gates are in [P8-meetings.md](DECISIONS/P8-meetings.md). Main wires MeetingController to existing session metadata and P3 final events; screen frames are not cloned into the recorder. Its default temporary path never opens SQLite. Explicit current/retained-session save, future-only opt-in auto-save and armed fresh-capture resume share this recorder. A bounded serial queue persists only final segments; errors stop saving visibly without retries. Capture Stop closes the run normally; reopening after a crash marks active runs interrupted at the last committed update, without inventing offline duration. Profile changes detach the current capture and exclude older-profile temporary text.

MeetingStore/HistoryWorker RPC owns a dedicated Node worker with built-in node:sqlite (actual Electron 45 runtime: Node 24.22.0 / SQLite 3.53.4). DatabaseSync/encryption/search never run on the capture/renderer/main event loop. Schema v2 separates encrypted meeting payloads and independent encrypted segment rows with FK cascade, chronological/expiry metadata indexes and optimistic versions. FULL synchronous transactions, DELETE rollback journals, memory-only SQLite temporary storage, secure_delete, prepared values, quick_check and authenticated key-check precede migrations. Migrations roll back; corrupt/newer schemas and missing/wrong keys preserve files. SQLite remains experimental in this pinned Node runtime; the compiled bundled worker is integration tested.

MeetingCipher uses Node AES-256-GCM with independent random 12-byte nonce, 16-byte tag and 32-byte key; AAD binds format/profile/record kind/meeting/segment. Decryption authenticates before returning data, and sensitive titles/devices/tags/notes/transcript/AI payloads never enter plaintext SQL indexes/journals. Metadata IDs/timing/status/counts/revisions/expiry/file size remain visible. MeetingKeys uses distinct EveryHint.Meetings.v1 native credential entries keyed by canonical installation-home plus signed-in account-registration hash, with a separate local-only profile. Existing DB plus missing key is a blocking recovery error, never a reason to replace it. No plaintext key/config fallback or automatic backup exists. Worker/key buffers are cleared/terminated best-effort on account change, lock/suspend/reload/crash/quit; same-user compromise, paging/crash dumps and physical SSD erasure are outside this boundary.

History IPC validates the trusted main document and a main-issued profile/lock scope before and after awaits. Lock changes the scope, awaits old-worker close before another unlock, clears caches, and remounts scoped renderer data. Host isCurrent reads a bounded metadata-only revision cache with write-in-progress guards, never synchronous SQLite. Lists/transcripts are lazy pages; unlocked search has ephemeral ID/cursor state, bounded work and escaped snippets, no persistent decrypted index. Deletion/retention invalidates that state and request guards. Retention runs at unlock/explicit setting changes; current policy is last-modified age, default 30 days, with 7/90/indefinite options.

MeetingAIController selects only current authorised saved/temporary excerpts through the store, builds bounded untrusted context, and calls the existing AssistantController prepare/ask and ChatGptProvider. Public review IPC cannot inject the internal meeting context or canSend predicate. Profile/account/revision/ref validity is checked at prepare, acknowledgement, after token renewal immediately before POST and throughout streaming. Ordinary manual and P7 Live gates remain intact; meeting completions do not enter ordinary live QA history. Shared responses carry meetingPurpose; structured summaries render as reviewable drafts in Meetings. Generated quotes must exactly match selected transcript refs; owners/deadlines need literal cited support or become null. Only explicitly applied sections persist; manual notes and edited sections are protected. User edits retain provenance and optimistic revisions, without pretending quote validation proves semantics.

PostMeetingNotes owns a separate ephemeral current-run/account/model/source/expiry/one-attempt grant. Deliberate End temporarily allows that exact Stop transition, waits for recorder flush and invokes the same meeting review/request path. General Pause/Stop cancels rather than triggers; no empty-text calls, retries or paid/provider fallback exist. A resumed record's older runs cannot enter the newly granted automatic request. Completed drafts require review/Apply even after automatic End.

MeetingSharing accepts no renderer-supplied path. Main's native save dialog chooses a new destination, then streaming TXT/JSON or bounded Markdown/summary generation writes only the acknowledged plaintext export. Version/profile guards cancel changing data; own partial files are removed on failure, with visible cleanup errors. Existing files are refused rather than overwritten. Clipboard copies are explicit and capped. Separate mailto validation/approval bounds recipients, subject/body and encoded URL, blocks header/query injection and never infers recipients/sends mail. Native dialog/clipboard/email ports are mocked in UI tests while actual chosen test files are inspected. Hosted links/Gmail are deferred. App deletion cannot erase exported copies, remote provider retention, backups made by other software or SSD remnants.

Main uses scalar persistence/post-grant/draft indicators for tray/title/compact sizing, avoiding repeated large draft/frame clones. Startup stays Manual, IDLE, history locked and all capture/remote grants absent. Graceful quit flushes committed recorder work within a bounded shutdown period before closing the history worker; forced shutdown recovery remains separately tested.

## P7 implemented event and permission boundary

Main owns `IntelligenceController`/`LocalIntelligence`, with shared typed events/settings/actions and narrow validated preload routes. Capture publishes existing source/frame snapshots; Whisper publishes final transcript events. Manual skips analysis. Auto-Hint produces bounded local candidates. `question.ts` scores English interrogative/help cues and suppresses incomplete/rhetorical/reported/unrelated/duplicate speech. `screen.ts` hashes before lazy native 32×18 sampling and requires stable substantial change. The engine retains frame metadata/grid, not another screenshot archive; time/source correlation never implies speaker identity or semantic screen recognition.

`actions.ts`/shared fixed instructions prepare the existing P6 review or a local participant-information result. Ranking uses confidence/relevance/freshness/correlation and answered/dismissed penalties. Bounds and retention are in PRODUCT_SPEC.md. Who stays local; Fact Check has permanent unverified metadata; Recap states the selected retained window. Accept is not remote consent. The seven action controls, mode/settings, timeline/diagnostics and three suggestions share all layouts and existing tokens. Compact minimums are Manual 180, Auto-Hint 280 and Live 380 DIP; the larger Live minimum preserves question/answer/emergency controls at narrow 125% zoom. Readiness changes publish the Live permission preview before any speech, independently of new context content.

`live.ts` is the sole automatic scheduler. Its separate acknowledged lease binds account/model/assistant/capture epoch/source and sharing categories, with wall-clock and monotonic expiry, min 30-second interval and conservative attempt cap. Defaults are 30 minutes/20 attempts. It reserves before asynchronous preparation, checks the same scope after fresh image acquisition and after token renewal immediately before POST, and guards each stream event. Pre-existing/stale/low-confidence/unshared/removed/duplicate questions cannot trigger. One active slot plus at most one derived fresh pending candidate prevents a backlog; manual review/request conflicts suppress scheduling. Failures/cancel/source/account/model/settings/lifecycle boundaries revoke without retry or fallback. Settings save local source choices/limits only, never mode/grant. Current catalog expiry may end Live before its nominal duration; explicit refresh/reselection/renewal is required.

Automatic work calls the same `AssistantController.prepare/ask`, `ai/context.ts` and `ChatGptProvider.respond`. The internal canSend predicate is not serialized; providers receive the unchanged official request shape (store:false, stream:true, tools:[], tool_choice:none). Main rechecks permission after token retrieval. Unchanged already-sent images can be omitted from automatic text requests with a visible notice. Only a terminal provider completion creates history. The root Live countdown/counter/Pause and native tray/title remain visible between requests; the tray uses tiny scalar indicators, avoiding repeated JPEG/transcript clones.

## P7 design recorded before implementation

[P7-intelligence.md](DECISIONS/P7-intelligence.md) records the event engine, correlation, action handlers and separate Live Assist grant/scheduler before implementation. Checkpoints are P7.1 local detection, P7.2 reviewed actions/UI, then P7.3 scoped automatic requests through the existing P6 builder/controller/transport. Final results are recorded separately from this design. At the historical P7 checkpoint, P8 storage was out of scope. P8 is now separately authorised below; cleanup of the four restricted P6 editor profiles remains excluded.

## P6 manual Assist extension

The existing `AssistantController` and `ai/context.ts` remain the only review/request builder. Strict shared IPC schemas accept an optional bounded question, selected sources/limits and one of three fixed presets, never arbitrary instructions/images/files. Get Answer prepares context; a separate one-use review ID and fresh transfer acknowledgement authorise inference. Per-item removal can only subtract frozen context and generates a new review ID. Removed transcript IDs are excluded for the conversation (bounded to 5,000; Clear resets them), and removed previous exchanges leave history. No credentials or app settings enter model text.

`CaptureSessionController.freshScreenshot()` checks ACTIVE screen consent and the selected source, then uses `ScreenCaptureService.snapshot()` alongside its existing periodic scheduler. Native calls share only a current-source/current-generation in-flight frame; generations prevent a pending pre-Pause/Stop/source-change frame entering a resumed session. Session and Assist preparation generations both guard late results. No second capture pipeline, arbitrary source IPC or new persistence is introduced. Native JPEGs are fitted to 1600×900; the builder validates positive integer dimensions, bounded base64/decoded bytes and a 10-second timestamp window with one-second future tolerance. Review and submit expire within two minutes of capture. A paused frozen review may be inspected until expiry while the normal session frame is cleared. Stop revokes the review. Whole-screen review images stay hidden during active capture to avoid recursive previews; application-window selection excludes EveryHint windows.

The builder selects only current consented final transcripts wholly in the selected 30/60/180/300-second interval, sorts by time, deduplicates overlapping identical normalized text per source and keeps newest content within text budgets. Audio source labels never establish speaker identity. History contains bounded question/answer text, not raw prior images or transcripts. Explicit account/model/provider/capture-session changes clear conversation state. Regenerate uses a new review, excludes the answer being replaced from history, and replaces that history entry only after a new completed response. Source-only answers may require a new question or selected context. Nothing auto-retries or auto-submits.

The existing `ChatGptProvider` sends the frozen prompt as `input_text` plus at most one selected JPEG data URL `input_image`. Official plan OAuth, model discovery/capabilities, `store:false`, `stream:true`, empty tools, tool_choice:none, `response.completed`, bounded SSE parsing, account guards and no API-key fallback remain intact. Follow-up history is client-side reference text; no conversation/previous-response state or Files API is used. Image hashes suppress unchanged resubmission within the bounded conversation. Claude's default-off, restricted API path is unchanged. See [official plan limitations](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [image input format](https://developers.openai.com/api/docs/guides/images-vision).

`shortcuts.ts` validates two persisted chords against each other and the fixed three emergency/window actions. Main registers them with the existing global registry and reports native failures. Assist emits one fixed preload event which expands/focuses the existing composer and prepares selected context for review; Clear calls the existing cancellation/reset. Renderer receives no arbitrary event/IPC sender. Settings migrate missing fields to defaults. `ResponseText.tsx` renders a bounded Markdown subset entirely as React text/elements, without HTML parsing, executable links/images, plugins or new dependencies. Explicit per-code copy uses the existing bounded clipboard route. EverySession tokens and all three layouts are retained.

Automated fixtures cover the full selected-image → streaming → follow-up path and lifecycle boundaries; genuine remote image/follow-up succeeded once on gpt-6.1-sol; remaining human Windows/account/device acceptance is tracked separately in TESTING.md. P7 extends detection/automatic sharing as described above. P8 now supplies separate opt-in permanent history as described above; the P9 custom-mode editor remains absent.

## Process boundaries

```mermaid
flowchart LR
  UI[React overlay · sandboxed] <-->|typed validated IPC| Main[Main process]
  Main --> Session[CaptureSessionController]
  Session --> Screens[ScreenCaptureService · desktopCapturer snapshots]
  Session --> Host[ElectronAudioCapture]
  Host <-->|fixed commands and validated status| Worker[Dedicated sandboxed audio document]
  Worker --> Mic[getUserMedia · selected microphone]
  Worker --> Loop[getDisplayMedia · Windows loopback]
  Mic --> Worklets[Separate Web Audio graphs and AudioWorklets]
  Loop --> Worklets
  Worklets --> Buffers[Bounded memory-only PCM per source]
  Worklets --> Meters[Local RMS · low-rate diagnostics]
  Meters --> Host
  Main --> Tray[Actual per-source tray state]
```

P1's overlay, window manager, screen adapter, settings and hotkey controller remain intact. Main owns consent and orchestration. Browser media APIs run in `audio.html`, a separate hidden, sandboxed BrowserWindow with an in-memory Electron session. The capture context is dedicated to processing; the visible overlay and tray disclose actual activity. No content-protection or screen-sharing evasion APIs are used.

No capture window or media acquisition exists at startup. A temporary audio context can enumerate microphone metadata after explicit microphone consent; it is destroyed when the list is returned. An active session uses one capture window for its authorised audio sources. Duplicate operations are rejected.

## Modules

| Module                                       | Responsibility                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts`                          | Window/tray/hotkeys, strict overlay IPC, per-session local protocol/CSP/network policy, lock/suspend/shutdown cleanup                        |
| `src/main/session.ts`                        | Authoritative session, consent, selected devices, per-source states and stale-event rejection                                                |
| `src/main/capture.ts`, `electron-capture.ts` | Existing serial screen snapshots and own-window exclusion                                                                                    |
| `src/main/audio-host.ts`                     | Capture-window lifetime, exact worker identity checks, native permissions, Windows display-media grant, startup deadline and forced teardown |
| `src/main/audio-permissions.ts`              | Testable microphone/display permission rules; deny camera, subframe and unrelated access                                                     |
| `src/preload/index.ts`, `audio.ts`           | Separate narrow overlay and capture bridges; no unrestricted Node/Electron/IPC access                                                        |
| `src/renderer/audio/engine.ts`               | Separate MediaStreams, track/device events, Web Audio graphs, local buffers/meters and complete browser-side disposal                        |
| `src/renderer/audio/worklet.ts`              | Native-rate PCM packet production; zero output, acknowledgement-based backpressure                                                           |
| `src/shared/audio.ts`, `audio-ipc.ts`        | RMS, bounded buffers/packets, typed worker protocol and runtime report validation                                                            |
| `src/shared/contracts.ts`, `validation.ts`   | Public IPC, session/source/PCM contracts and strict input validation                                                                         |
| `src/renderer/src/main.tsx`, `styles.css`    | Source consent/selection, independent meters, mute, diagnostics, original overlay/settings                                                   |

## Session and source state

The session retains IDLE, READY, ACTIVE, PAUSED, STOPPED and ERROR. Every launch starts IDLE. Each source has DISABLED, AVAILABLE, STARTING, CAPTURING, PAUSED, STOPPED or ERROR. AVAILABLE means explicitly prepared; OS access is confirmed during acquisition. ACTIVE may contain STARTING audio sources, so the overlay and tray distinguish starting from capturing.

All seven nonempty combinations of Screen/Microphone/System audio are supported. Every consent field must be a real boolean, at least one source must be enabled, and participant acknowledgement must be true. Screens require an enumerated source; nondefault microphones require an enumerated device ID. Audio-only sessions never start the screen scheduler. Disabled sources cannot start through hotkeys, media grants or reports.

Pause cancels the screen timer, invalidates late events, clears screenshots and destroys the audio capture window. Source consent/device selection and an explicit microphone mute are retained for resume. Resume recreates the browser context and checks permissions. Stop additionally clears consent, selections and buffers; fresh preparation is mandatory. Epochs prevent events from old contexts from updating the current UI.

A source failure stops the whole session rather than silently continuing a partial conversation capture. The failed source is ERROR, other selected sources become STOPPED, levels/frame are cleared, and consent is revoked. Windows lock, suspend, overlay reload, renderer crash/unresponsiveness, application shutdown and capture-context failures also stop resources. Nothing resumes after restart, unlock or system wake automatically.

## Audio acquisition

Microphone capture uses `getUserMedia` with `video: false` and an explicit device constraint. Windows default and communications aliases are supported. Echo cancellation and noise suppression are requested; automatic gain control is disabled. Native microphone privacy denial, unavailable devices and startup failures are surfaced.

System audio uses Electron's [`setDisplayMediaRequestHandler`](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts) with `audio: 'loopback'`, never `loopbackWithMute`. This preserves speaker playback. Only a currently authorised, exact top-level audio worker can receive this grant, once per activation. Camera access is denied. Screen metadata is enumerated without thumbnails to satisfy Chromium's accompanying-video requirement. The returned video track is stopped and removed immediately; it is never attached to a video element/canvas, analysed or sent to the screen service.

There is one independent audio graph per source: MediaStream source → AudioWorklet → zero-filled output. No captured sound is replayed to speakers. There is no mixing of microphone and loopback. Browser track `mute`, `unmute`, `ended`, context state and media-device changes are handled. EveryHint's own mute toggles only its microphone track; it survives pause/resume. A silent meter does not claim to know a hardware switch or another application's mute state. See [MediaStreamTrack mute semantics](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/mute_event).

Input removal/default-device identity changes and observed output-device changes terminate capture and require explicit preparation. Driver and Windows routing notifications are imperfect: a session should be restarted after manual output changes even if no event arrives. There is no unsupported promise to exclude specific apps or remove acoustic/Windows-monitoring duplicates.

## PCM, buffering and diagnostics

`AudioFrame` defines source ID, stream UUID, sequence, timestamp (epoch milliseconds), sample rate, channel count, `f32-interleaved` samples and lifecycle (`started`, `data`, `stopped`). P2 produces data frames and uses new stream IDs plus context lifetime to delimit each activation; P3 adds a gated consumer. Lifecycle marker values are also accepted by the conversion pipeline.

AudioWorklets packetise 4096 sample frames, preserving up to two channels and the AudioContext sample rate. P3 performs separate mono/16 kHz conversion after explicitly enabled PCM forwarding. Browser-required input-rate conversion is handled by Web Audio. See [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

Per-source caches enforce **2 seconds, 32 packets and 768,000 bytes**; old/oversized packets are dropped. Each worklet allows one unacknowledged packet and drops input while waiting, preventing unbounded MessagePort queues. This is bounded diagnostic capture, not a lossless recorder. Muting clears its buffer. Pause/Stop destroy the context and clear both buffers.

RMS is computed locally. The worker reports at 200 ms intervals (5 Hz per source), with immediate structural/mute changes. Main sends small meter events separately from full snapshots, so screen images are not resent with every meter update. Two enabled sources can produce up to ten small overlay meter events per second. CSS smooths meters. Missing packets zero the displayed level after 600 ms.

Normal engine disposal stops every media track, disconnects nodes, closes worklet ports and AudioContexts, removes listeners, clears timers and releases buffers, including resources whose worklet is still loading. Main always destroys the BrowserWindow on pause/stop/failure, releasing browser-owned media even if JavaScript is unresponsive or acquisition is pending. Late promises cannot restart capture. Startup has a 20-second deadline.

## Screen capture and pause fix

P1 uses [`desktopCapturer.getSources`](https://www.electronjs.org/docs/latest/api/desktop-capturer) native thumbnails, initially every three seconds at approximately 960 × 540 in P1, now fitted within 1600 × 900 in P6. Only the selected image is retained and delivered to the overlay. Native enumeration can transiently thumbnail other sources of the chosen kind; this is not exclusive per-window OS acquisition. Already issued one-shot native requests cannot be cancelled, but late output is discarded immediately after pause/stop.

The reported P1 paused screenshot was a retained preview: the scheduler was already stopped. Commit `ee3fc00` clears that frame on pause. Application-window previews remain live while ACTIVE. Whole-screen previews stay hidden to prevent recursion and are also cleared when paused/stopped; no paused image is retained. Main-process tests verify the absence of further scheduled captures.

## Security and storage

Both UI and capture contexts use context isolation, sandboxing, disabled Node integration/webviews, denied navigation/popups and confined application assets. Worker IPC validates the exact WebContents, top-level frame and document URL; reports reject unknown fields, excessive sizes, invalid levels and unconsented sources. Worker configuration/activation cannot be invoked by the overlay. User activation for `getDisplayMedia` is granted through one fixed main-process function call following an authorised Start/Resume.

The overlay session denies all media permissions. The separate in-memory audio session grants only the consented source types in the current operation and denies cameras/unrelated permissions. Production renderer network access is blocked by CSP and session request policy. AudioWorklet scripts are permitted only from the capture document's own origin. Development additionally permits the loopback Vite origin. See [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

EveryHint persists validated appearance/speech settings, screen interval/bounds and explicitly installed public model/runtime files. It does not persist capture consent, devices, screenshots, raw PCM, transcripts, questions or answers. Explicit ChatGPT sign-in is intentionally persisted by the official client in the OS credential store using EveryHint's private profile; application code and the renderer never read tokens. Provider-managed authentication/caches and remote retention are separate; P4 details follow below. No raw-audio upload, custom native WASAPI module or P5 automatic requests are introduced.

## P3 transcription pipeline

```mermaid
flowchart LR
  P2[P2 AudioWorklet PCM] --> Gate[Explicit run token · bounded IPC]
  Gate --> Validate[Main: frame/source/session validation]
  Validate --> Convert[Per-source mono + 16 kHz FIR conversion]
  Convert --> VAD[Independent energy gate and segmenter]
  VAD --> Queue[Fair queue · four waiting jobs maximum]
  Queue --> Native[One CPU whisper.cpp helper · stdin/stdout]
  Native --> Text[Bounded provisional/final transcript store]
  Text --> Panel[Live panel and compact status]
```

The [decision record](DECISIONS/P3-transcription.md) documents the official C API choice and alternatives. A pinned whisper.cpp v1.9.5 source commit is compiled into `everyhint-transcriber.exe`. The helper calls `whisper_init_from_file_with_params` once, with GPU disabled, then sequential `whisper_full` calls. `no_context` prevents one source's recognition prompt from contaminating the other. The standalone whisper-stream recorder is not used. No HTTP listener or native Node binding is needed. See the [official C API](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/include/whisper.h).

### Consent, routing and cancellation

Transcription starts OFF every launch. Enable requires ACTIVE capture, a session UUID, consent acknowledgement and at least one capturing audio source. It never activates media. Main sends a random run token to the existing audio context; only then does it forward PCM. One pending invoke per source bounds transport. Host validates exact worker/frame identity, token, source consent and sample metadata. Disabled/old tokens return no acceptance. Muted inputs send zeros rather than their raw samples, allowing existing speech to finalise without revealing muted input.

Worklet timestamps use the audio sample clock, anchored to epoch time at the first packet, rather than relying on delivery-time spacing. Input/OS latency and initial anchoring are approximate; subsequent relative sample times are preserved. Gaps, out-of-order sequences, changed formats/streams and timestamp jumps reset conversion and split segmentation. Already dropped P2 samples cannot be recovered.

Pause, Stop, Clear, model/settings changes, capture epoch changes, crashes and shutdown revoke the token, release queues/segmentation buffers, remove provisional text and kill the helper. Session UUIDs, run generations, stable utterance IDs and numeric helper job IDs reject late results. Capture Resume does not automatically resume transcription. Clear leaves transcription paused. Final text remains only until explicit clear, expiry or a new prepared session. A scheduled expiry also removes old text when no new audio arrives.

### Models and setup

`resources/speech-models.json` pins the publisher repository revision, exact sizes and SHA-256 LFS object hashes for tiny.en (77,704,715 bytes) and base.en (147,964,211 bytes). Sources are the [whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp) linked by [official model instructions](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/models/README.md). Downloads only occur through explicit Install/Reinstall or the model CLI. Data streams to a temporary file, with an exact size cap and streaming checksum; replacement happens only after verification. Every enable revalidates the model before loading. No remote inference fallback exists.

Settings display installed/missing/invalid/verifying/downloading status and progress. Corrupt speech configuration restores safe defaults with a visible message. Default paths are `%LOCALAPPDATA%\EveryHint\speech\runtime` and `models`, with an explicit root override. CMake source/build cache is outside Git. Runtime build instructions are in README; the default x64 CPU backend uses AVX2/FMA/F16C/BMI2, while ARM64 and alternative CPU builds require acceptance. Base.en installation/model switching are implemented, but only tiny.en inference was exercised here.

### Conversion, speech activity and bounds

PCM validation accepts mono/stereo float32, 8–192 kHz, at most 8192 finite normalised samples per packet. Downmix averages channels. A stateful 32-tap windowed-sinc filter performs anti-alias resampling to 16 kHz. Its bounded 256-phase coefficient cache is at most 64 KiB per source; this avoids repeated trigonometric work. Filter look-ahead is 16 input samples; timestamps refer to the logical resampled audio timeline.

The lightweight energy gate processes 20 ms blocks, retains 200 ms pre-roll and requires 200 ms of voiced energy before scheduling recognition. Defaults: RMS threshold 0.012, 900 ms silence, 12-second maximum speech, 400 ms overlap. UI settings expose conservative ranges: threshold 0.003–0.08, silence 600–2500 ms, max segment 10–15 seconds, overlap 0–1000 ms. It is a noise-sensitive energy gate, not a neural VAD, speaker identifier or question detector.

Partials use the current bounded utterance window, first after roughly 2.5 seconds and then at least 2.5 seconds of new audio. Silence or the maximum duration produces a final job. Short input is zero-padded to one second for inference, without extending its displayed audio timestamps. Partials replace the same event ID; finals replace provisional text. Limited max-boundary overlap is deduplicated by matching normalised multiword suffix/prefix text. This is conservative text deduplication, not token-perfect alignment.

| Resource                       | Limit / policy                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Original P2 caches             | Unchanged: 2 seconds, 32 packets, 768,000 bytes per source                                                                  |
| P3 segment accumulation        | 10–15 seconds mono float32 (default 12); bounded pre-roll/remainder                                                         |
| Resampler history/kernel cache | Small FIR history and at most 64 KiB coefficients per source                                                                |
| PCM transport                  | One outstanding frame per source; dropped packet spacing is detected                                                        |
| Inference                      | One helper/model and one in-flight job; two waiting jobs per source (four total)                                            |
| Queue overload                 | Replace queued obsolete partials; finals supersede queued partials; drop older queued work with a visible counter when full |
| Helper request/output          | At most 240,000 samples (15 seconds) per job; stdout accumulator capped at 64 KiB                                           |
| Transcript store               | Default 15 minutes/200 events; configurable 1–60 minutes/20–500 events; hard 50,000-character cap                           |

Round-robin source scheduling prevents starvation. Inference never runs in Electron main or React. Native startup/inference requests have a 60-second deadline. Helper spawning uses fixed local paths, argument arrays, no shell and hidden process windows. Models are released on cancellation instead of reloaded per segment. Small transcript snapshots use separate IPC, avoiding repeated screen-image transfer.

The diagnostics panel reports measured model load time, average inference latency, queue length, dropped jobs, gaps, helper CPU and working set. CPU is expressed as a percentage of one logical core and may exceed 100%; measurements cover the helper, not the entire application. Full Windows hardware, long-run memory stability and a 15-minute real conversation remain pending in TESTING.md.

## P4.2 -- reviewed ChatGPT plan responses

`AssistantController` in Electron main owns provider selection, frozen review IDs, conversation IDs, one active request and deadlines. The registered providers are now `ChatGptProvider` (direct Responses) and the existing restricted Claude API adapter. The legacy internal ID `codex` is kept for IPC compatibility; it does not mean the Codex runtime executes an answer. The obsolete, blocked SDK adapter and CLI login actor remain unused by application wiring. See [the P4.2 decision](DECISIONS/P4.2-chatgpt-plan.md), which supersedes P4.1's native-login prototype.

```mermaid
flowchart LR
  UI[Sandboxed React] -->|Fixed validated IPC| Main[AssistantController]
  Browser[Official OpenAI browser sign-in] -->|PKCE + state + nonce| Accounts[ChatGptAccounts]
  Accounts --> Vault[Native OS credential store]
  Accounts -->|Explicit Refresh models| Models[Public OpenAI account model catalog]
  Screen[Authorised current screenshot] --> Review[Immutable model + selected context review]
  Speech[Local final microphone/system text] --> Review
  Main --> Review
  Review -->|Fresh acknowledgement + Ask| Gate[Plan, account, model and image capability checks]
  Gate --> Responses[Public Responses API / no model tools]
  Responses -->|Bounded cancellable SSE / completed required| Main
  Gate -->|Separate API opt-in only| Claude[Restricted Claude SDK]
  Main -->|Request + conversation guards| UI
```

### Authentication boundary

`main/ai/plan/accounts.ts` binds a stable per-installation public host ID to up to four OS-protected registrations. New registration and returning sign-in use the official SIWC flow. A loopback listener starts before opening the browser. Fresh cryptographic state, nonce and PKCE bind one callback to that attempt; issuer, RS256 signatures, audience, expiry, subject and issued client are checked with `jose`. An identity-only connection cannot obtain models or send an answer. Plan scopes must be granted and match the verified access JWT. Unknown accounts, mismatched subjects/client IDs, declined consent and malformed callbacks fail closed. Neither browser URLs nor credentials are sent to React.

`vault.ts` uses asynchronous native `@napi-rs/keyring` entries. The full registration/token record is split into 2,000-byte chunks beneath Windows' per-entry limit, with a 128 KiB aggregate bound. A hashed manifest commits the complete generation. Writes are serialized; older chunks are removed after commit. Crashes/deletion failures can leave OS-protected orphan chunks. No credential file, localStorage token or API-key fallback exists. Only a nonsecret `host-id` file lives in `userData/chatgpt-plan`; old Codex credentials are untouched.

Restore and Check connection read local state only. Token refresh occurs near expiry during explicit Refresh models or Ask, with the issued client/resource and no scope parameter. Rotating token sets are committed before exposure. Terminal refresh errors require reconnection; transient errors preserve the session. Sign-out attempts official-discovery token revocation with a ten-second bound and removes local tokens while retaining registration identity. Failure to confirm remote revocation is visible. Login has a five-minute deadline. Cancellation/generation checks protect account changes, provider changes, reload/crash, lock/suspend and quit.

### Model and inference boundary

Refresh models explicitly authorises GET `https://api.openai.com/v1/models`. Only visible entries from its documented `models` array are offered in server order. The five-minute in-memory catalog belongs to one account and is discarded on account/lifecycle changes. The user must select a model. A model's presence is advisory; only completed inference verifies its use. Screenshot capability requires explicit current `input_modalities` image metadata, with unknown metadata treated as unsupported. Account/model changes cancel work and reset review/conversation; no context transfers automatically.

`provider.ts` makes POST `https://api.openai.com/v1/responses` with the main-only plan token. The body contains the frozen model, fixed answer-only instructions, reviewed user text and optional data-URL image, `store: false`, `stream: true`, `tools: []` and `tool_choice: none`. It omits unsupported preview parameters and server-side conversation IDs. It has no shell, filesystem, agent-tool dispatcher or computer-control path. Tool-call events/output items are rejected as errors. Neither Codex sessions nor screenshot files are created.

SSE parsing supports split UTF-8, comments and CRLF, caps one buffered event at 512,000 characters and the stream at 4 MiB, and caps answer text at 32,000 characters. Text streams immediately; only `response.completed` with consistent completed text establishes success. Failed/incomplete/error/interrupted streams preserve already displayed partial text with a failure status. Cancellation aborts fetch and the stream reader. Structured HTTP/service failures retain safe enum codes/request IDs and never expose raw bodies or tokens. There are no inference retries, API-key fallback, backend-api endpoints or alternate-provider fallback.

### Context, UI and privacy

The original P4 review/controller boundary remains. Current-session, consented, final microphone and system-audio excerpts are independently selected by age/source. No audio object enters AI requests. A one-use, two-minute review holds the exact question, selected text/image/history and selected model. The fixed instruction treats captured context and history as untrusted data. A fresh per-request transfer acknowledgement and Ask are required. Editing discards review; Stop/error discards it; capture-session changes clear conversation. Pause permits inspecting an explicitly frozen screenshot. Duplicate image hashes prevent unchanged resubmission.

Defaults remain 120 seconds of recent transcript, 6,000 combined transcript characters, 20,000 serialized text characters and 1,500,000 image bytes. User limits are validated in main. History contains at most four completed question/answer pairs and 12,000 characters; prior screenshots/transcript excerpts are not put into follow-up history. Eight displayed responses are bounded in memory and expire after 15 minutes idle. Deadline is 90 seconds. Cancel/clear/provider changes and request/conversation guards prevent stale results entering a newer conversation. React escapes text/code; Copy is an explicit bounded plain-text IPC action.

Every new account/model route uses the existing exact sender/webContents/main-frame/document check. The sandbox, Node isolation, denied browser permissions, renderer network block and restrictive CSP are unchanged. Tokens, HTTP and OS storage remain outside React. Capture/transcription remain local; remote auth/model metadata and explicitly reviewed inference are clearly labelled. No content is automatically saved or submitted. Clear cannot recall transmitted content or remove remote provider records; `store: false` does not claim that all provider security/operational retention is absent.

Claude's existing bare, one-turn SDK adapter retains empty tools, wildcard denial, deny permissions, disabled skills/plugins/MCP/hooks, isolated temporary configuration, API-only allowlisted environment and `persistSession: false`. Session-only API billing consent remains off by default; subscription login needs Anthropic approval. Its 4,096-output-token/$1 estimated-budget setting is not an account spending cap. SDK caches/crash remnants/provider retention are separate. No paid Claude test was authorised. Actual installed-SDK loopback tests remain fixtures. P5 has not started.

## P5 UI foundation and product specification

This separately authorised milestone supersedes earlier statements that P5 had not started; it implements design/interface foundations only. See PRODUCT_SPEC.md, FEATURE_MATRIX.md and DESIGN_SYSTEM.md. No detection, background sharing, persistent meeting history, calendar connector, enterprise backend or mobile application is added.

resources/design-tokens.json is the semantic palette/type/spacing/radius/elevation source. build-theme.mjs generates the committed renderer token CSS; theme:check rejects drift. Native window/tray colours import the same JSON. Renderer font faces are local unmodified Poppins/Inter; OFL notices are copied by Vite from public/licenses/fonts into the production output. No remote font loading or CSP exception is introduced. Dark/status/hover/focus/opacity adaptations are distinguished from actual EverySession source values.

The existing BrowserWindow remains the only user-facing shell and privileged state owner. Compact uses the existing compact flag; the new optional layout preference selects assistant/dashboard. A pure presentationBounds helper clamps layout sizes to the current monitor and preserves per-view resized dimensions in memory. Appearance saves use the existing trusted settings IPC, with validated theme/layout/80-100% opacity and backward-compatible defaults for old version-1 files. Only appearance is persisted; no capture, remote-sharing or content consent is added.

Dashboard navigation is renderer-local. Home reads actual public snapshots; Assistant and Settings preserve working controls. Future destinations show planned scope with no fake records/actions. The live assistant and transcript components remain mounted when hidden by navigation/settings, preserving their draft/review state. Native capture/AI/transcription controllers and account storage/flows are unchanged. Visible active-remote cancellation and emergency capture controls live outside collapsible/scrolling panels. The focused-window Ctrl+Enter handler only opens the composer; it grants no remote permission. The skip control focuses content without changing the exact trusted document URL.

resources/feature-inventory.json contains exactly 103 requirements. build-feature-matrix.mjs validates IDs, required fields, status/source categories and generates FEATURE_MATRIX.md, including nine action mappings. spec:check and the product-spec test detect omissions/drift. Roadmap phases P6-P13 are specification only.
