# EveryHint

**Intelligence when you need it.**

EveryHint is a Windows-first, local-first desktop assistant. P1 provides the overlay and screen capture; P2 provides independent microphone and Windows playback capture; P3 adds offline local English transcription through whisper.cpp. P4.2 provides the official Sign in with ChatGPT and Responses transport; the Listen & Ask milestone adds deliberate requests within a separately approved session context scope. A genuine gpt-6.1-sol answer using the app's ChatGPT plan grant was verified on 2026-10-28. Claude remains disabled by default and no paid Claude test was authorised. Capture and transcription need no paid service. The current UI foundation uses the verified EverySession design system, with an ordinary dashboard and a separate floating assistant.

## Install and run

Development targets Windows 10/11 with Node.js **24 LTS** and npm; the P11 private installer targets AVX2-capable x64. This host's Windows 11 build was tested with controlled fixtures; Windows 10/ARM64/clean-machine acceptance remains pending:

```powershell
cd C:\path\to\EveryHint
npm ci
npm run dev
```

To run the compiled application:

```powershell
npm run build
npm start
```

Dependency installation and Electron's first native binary download need internet access. Application capture stays local. P11 adds opt-in Windows window-content protection, private per-user NSIS packaging and a [manual new-version update flow](docs/UPDATES.md). Updates stay unconfigured by user choice until real signing, hosting and trusted keys are ready; no update request is made now. [Build instructions, measurements, acceptance matrix and release blockers](docs/P11_ACCEPTANCE.md) distinguish controlled automation from real devices. No screen-sharing receiver scenario is certified; the user kept those and physical hardware checks pending. Enterprise is permanently removed; mobile is unstarted. No public release was made.

## Listen and ask

Connect ChatGPT once, then **Start EveryHint → authorise local sources → optionally allow transcript/screen sharing for this session → Start**. If needed, Start offers an explicit local speech-model download. Continue talking and press **Ctrl+Alt+Enter**, or type **help** in the assistant and press **Enter**. No transcription panel or per-request context checkboxes are needed within that scope.

Only bounded final speech from the last two minutes and a fresh approved image are sent on a deliberate request. Raw audio stays local. Local capture, session sharing and each request are separate choices; the sharing grant expires within one hour and is never restored. Live needs its own separate permission. [Exact behavior, actual Windows verification and remaining physical/genuine-provider limits](docs/LISTEN_ACCEPTANCE.md).

## Interface and product roadmap

The **dashboard** is an ordinary Windows window. **Start EveryHint** opens fresh source/participant consent; idle shows no Stop. The separate floating assistant puts answers and input first. New installations have a brief setup wizard; upgrades preserve existing configuration and never restore recording permission.

- Minimise keeps the taskbar entry. **Window menu → Hide to Tray** hides the dashboard; tray **Show dashboard** restores it. **Quit EveryHint** stops work and exits. Active Close offers background, Stop and quit, or Cancel.
- **Ctrl+Alt+Enter — Answer from conversation** opens the floating assistant and streams one answer from approved session context. **Ctrl+Alt+Space** shows/hides it; **Ctrl+Alt+A** keeps the explicit compose/review flow, **Ctrl+Alt+P** pauses/resumes and **Ctrl+Alt+Shift+X** stops. Configure and see actual registration in **Settings → Shortcuts**. Hiding never grants or stops capture by itself.
- **Assistant** provides answers, a message input, mode selection, Attach Context and a secondary conversation menu. Start automatically transcribes authorised audio locally. Separately allow transcript and/or screen sharing for this session, then press Answer or type **help** and **Enter** without repeated review. **Shift+Enter** adds a newline. **View Context** is optional; **Revoke sharing** is immediate. Extra attachments retain review. Session options preserve Auto-Hint, separate time-limited Live authorisation and meeting controls.
- Main navigation is Home, Assistant, Meetings, Knowledge, Calendar, People, Modes and one Settings entry. Settings has General, Audio & Screen, Shortcuts, Privacy & Data, Account & AI and Advanced sections.
- New installs default to dark. Light/System and existing preferences remain. Pin/opacity apply only to the assistant. Poppins/Inter are bundled locally; no remote fonts are loaded.
- History/search comes first. Existing encrypted history can reopen using its existing Windows-protected key; saving/automatic saving remain opt-in under Privacy & Data.
- After rebuilding, quit an existing EveryHint instance before starting the new build. [UX report, exact test counts, screenshots and outstanding manual/release checks](docs/UX_ACCEPTANCE.md). Version remains 0.5.0; no UX installer was built or published.

Read the [product specification](docs/PRODUCT_SPEC.md), [103-feature coverage matrix](docs/FEATURE_MATRIX.md), [verified design sources](docs/DESIGN_SYSTEM.md) and [P1-P13 roadmap](docs/BACKLOG.md). P6 adds manual screen-aware Assist; P7 adds local Auto-Hint and separately authorised Live Assist. P8 provides encrypted meeting history; P9 provides modes, knowledge, languages and templates. P10 adds Calendar, People, memory and preparation; enterprise/mobile remain deferred. Human Windows visual/hardware acceptance remains open.

## Calendar, People and memory (P10)

Unlock local context in Settings or Calendar/People. Configure a **Google Cloud Desktop OAuth client**, enable Calendar/People APIs and consent/test users, save the public client ID, then authorise Calendar or Contacts separately in your browser. [Setup/distribution requirements](docs/ARCHITECTURE.md#p10-google-setup-and-distribution) cover applicable Google verification. Genuine Google testing remains pending configuration/permission; production approval is not claimed. ChatGPT sign-in stays independent.

Calendar shows selected read-only calendars in a past-7/future-90-day complete window: day/seven-day/upcoming search, time zones, event details and explicit meeting links. This is bounded refresh, not Calendar incremental sync. Optional reminders/background sync/restart restore default off. People offers manual records/notes/saved-meeting links and optional selected Contacts import; full-book deltas require another acknowledgement. Matching uses exact verified/confirmed email, never a voice or guessed alias. External professional research is deferred.

Enable memory separately and choose retention, then use **People → Long-term memory** to select ended saved meetings/enabled Knowledge documents and rebuild. Extracted records start pending with literal evidence/ref/revision. Review/edit/delete/filter/exclude/rebuild stay local. Approved memory still requires explicit source selection and remote review. Original documents and independent saved meetings remain separate.

Open an event and **Prepare brief · review first**. Choose people, reviewed memory, previous notes and optional active-mode Knowledge; inspect/remove exact excerpts and freshly acknowledge the ChatGPT request. Drafts are ephemeral. Encrypted saving requires a chosen retention policy and explicit Save; Copy/plaintext Export/Open meeting are deliberate. Ordinary Assistant requests can choose P10 context; Live additionally requires staging exact sources, separate remote permission and the existing bounded session grant. Google sign-in, reminders and hints never start capture, join or enable inference.

```powershell
npm run smoke:context
npm run context:bench
node scripts/verify-context-ai.mjs --dry-run
```

The smoke uses actual Electron/preload/encrypted workers/native vault with explicit Google HTTP/browser/notification fixtures. Dry-run makes **zero** model requests. The genuine one-request script is excluded from routine checks and requires a fresh scoped grant; P9 grants are consumed. See [evidence/manual checklist](docs/TESTING.md), [privacy/retention](docs/ARCHITECTURE.md) and [delivery manifest](docs/DELIVERY.md).

One separately authorised genuine P10 `gpt-6.1-sol` brief passed in **14.124 seconds** (978 input / 723 output tokens), preserving the Thursday/Wednesday details and a supplied source citation while excluding unrelated test context. It used only a synthetic event/person and approved memory from a new encrypted synthetic saved note. Temporary records were removed and preferences untouched; the grant is consumed. Genuine Google testing stays pending by user choice, and automatic Live with P10 context remains unverified.

## Personal modes, knowledge and templates (P9)

Open Modes or Knowledge and **Unlock local library**. General, Coding, Interview, Sales and Meeting plus legacy Conversation share one mode selector across all layouts. Create/edit/rename/duplicate/delete custom modes, reset protected built-ins, choose instructions/length/format/language/context/actions, and associate documents/templates. Editing stays local; **Preview / test** prepares the normal review and only acknowledged Ask sends inference. Changes cannot grant capture, sharing, tools or billing.

Knowledge imports **PDF, DOCX, UTF-8 TXT and Markdown** through the native picker and a bounded cancellable local parser. Limits: 8 MiB, 400k extracted characters, 200 PDF pages, 100 documents/profile. Inspect/search/rename/disable/associate/delete; only extracted text and metadata are encrypted in app storage. Originals remain untouched. No OCR or automatic cloud upload exists. Explicitly select documents for a request and review exact excerpts before sharing: at most four excerpts/4,800 text characters. Citations identify supplied sources and require claim-by-claim checking.

Settings provides default mode/output language and four built-in/custom meeting templates. A mode can override language/template. Named output languages are best effort for the selected provider; tiny.en/base.en remain **English-only**. Select an ordered template in Meeting AI; generation stays a fresh draft until Apply, preserving manual notes and bounded prior saved summary versions. Live knowledge remains off until retrieval, remote sharing and exact sources are separately authorised for that session.

Two expressly authorised genuine gpt-6.1-sol tests passed: a custom-mode answer with an exact source citation and a custom-template summary from synthetic microphone/real tiny.en. See [P9 architecture](docs/DECISIONS/P9-personalisation.md), [Testing](docs/TESTING.md) and [Delivery/changed files](docs/DELIVERY.md) for evidence, limits and open Windows acceptance.

```powershell
npm run check
npm run smoke:personal
npm run personal:bench
```

The genuine AI script is excluded from automated checks and needs a fresh explicit scoped authorisation. The completed test grants no permission for further requests.

## Automatic conversation assistance (P7)

Every launch starts **Manual**, with automatic sharing off. In Settings choose the already consented local microphone/system/screen sources to analyse; then choose **Auto-Hint** for up to three local suggestions. Accept opens the existing transfer review; acknowledge and Ask to send. Local speech remains English-only. Screen changes only suggest reviewing the current source.

**Live Assist** needs active authorised capture, local Whisper, a connected ChatGPT-plan account and an explicitly selected model. Its separate permission lists the exact sources, account/model, triggers and limits. Defaults: 30 minutes, at least 30 seconds between attempts and 20 attempts; the existing five-minute model cache may pause it sooner. Select microphone/system final text and optionally current image/history, then acknowledge **Authorise Live Assist**. Pause Live, capture Pause/Stop, Clear, expiry or account/source/model changes revoke it; Resume/restart never restore it. Root status and tray show remote-enabled state even between answers. There is no automatic Claude, raw audio upload, paid fallback or agent tool execution.

One explicitly authorised automatic gpt-6.1-sol answer was verified through synthetic microphone audio and real local Whisper: one request, 8.995 seconds, scope ended at the one-attempt cap. This does not verify physical microphone/playback or real-call accuracy.

Seven actions include talking points, follow-up questions, **unverified/context-only** Fact Check, selected-retained-window Recap and local user-provided participant information/unknown. Independent web fact verification and speaker identity are absent; P8 saved history and P9 local knowledge have separate opt-in controls. Detailed scope, measurements and manual checklist: [TESTING.md](docs/TESTING.md).

## Ask an assistant (P4.2)

1. Choose **ChatGPT · plan usage**, then **Continue with ChatGPT**. Complete OpenAI sign-in and consent in your normal browser. EveryHint creates its own registered connection; your unrelated Codex/IDE login is not imported. Credentials stay in the OS credential store. Identity-only sign-in requires the separate **Grant ChatGPT plan permission** action.
2. Choose **Refresh ChatGPT models** to authorise a model-list request to OpenAI, then select a model. The list is account-specific, held in memory for five minutes, and cleared on account changes. Listing does not guarantee access; only a completed response verifies that request. No fixed model or API-key fallback is assumed. Screenshots stay disabled when current model metadata does not explicitly confirm image input.
3. Choose an AI mode in the shared header selector; legacy General/Code/Conversation preset inputs remain compatible. Enter an optional question and independently select recent final microphone/system text (30/60/180/300 seconds), a fresh authorised screenshot and previous question/answer text. An empty question requires actual selected context. No raw audio is sent. **Get Answer · review context** freezes the exact selected text/image and model for two minutes. Pause full-screen capture to inspect a frozen image without recursive capture. Remove individual excerpts/exchanges or the image before approval; every removal resets acknowledgement. Draft/preset edits discard review; account/model/provider changes clear conversation/review.
4. Inspect the preview, acknowledge this remote transfer and choose **Ask ChatGPT**. Only Ask submits inference. Responses stream as safe Markdown/code, with cancellation and bounded usage/timing information. Requests use the official public Responses endpoint with storage disabled and no tools. The model cannot execute commands, browse files, edit the workspace or control the computer.
5. **Cancel request** stops the stream. **Clear conversation** removes local history/review/draft; neither recalls transmitted data nor deletes provider records. Old results cannot enter a newer conversation. **Copy response** explicitly copies bounded plain text. Compact mode keeps status/cancellation available.
6. Select **Add account** to connect another registration, or choose a saved registration to reconnect it. **Sign out of ChatGPT** clears that registration's OS-protected tokens and attempts remote revocation, while retaining its client binding for the next sign-in. Remote revocation failures are reported. Sign-in has a five-minute deadline and can be cancelled. OS-store failure never enables plaintext credentials.

Local Whisper transcription is distinct from remote AI inference. Signing in, checking the local connection, preparing capture or reviewing context never submits a question. Refresh explicitly requests metadata; an expiring token may refresh during that action or Ask. Manual review never submits automatically. P7 question detection and separately authorised Live Assist have their own controls; provider switching and separately billed OpenAI API fallback never occur automatically. Permission, account/workspace/region eligibility, unavailable models and usage limits produce clear errors. Read [the P4.2 decision](docs/DECISIONS/P4.2-chatgpt-plan.md) for official sources and implementation details.

The UI does not use the Codex runtime for ChatGPT answers: the SDK's lack of a supported deny-all tool policy was the original blocker. The official direct Responses route avoids exposing agent tools. The internal provider ID remains `codex` for compatibility only. App credentials use native OS storage through `@napi-rs/keyring`; `jose` validates signatures. The public installation ID is the only auth file under `%APPDATA%\EveryHint\chatgpt-plan`. Old Codex authentication is left untouched.

**Claude:** subscription sign-in remains disabled without Anthropic approval. The preserved Claude Agent SDK adapter supports only an explicit, separately billed API opt-in for that session and `ANTHROPIC_API_KEY` configured locally. No key is needed for ChatGPT plan use. No paid Claude request was authorised or made. Its commands, tools, plugins and MCP capabilities remain disabled. A detected API key alone is not verified authentication.

History is bounded to four completed question/answer pairs and 12,000 characters; eight bounded responses are displayed, with 15-minute idle expiry. Previous transcript excerpts/images are not automatically included in follow-up history. Requests have a 90-second deadline and 32,000-character response limit. Claude separately limits one turn/4,096 output tokens and uses a $1 estimated budget threshold, which is not a guaranteed spending cap. ChatGPT limits come from your plan/app grant; the app invents no quota or price.

**Distribution and acceptance:** this private-use prototype is designed for eventual distribution. Real browser sign-in, OS-backed reconnection, model discovery and one genuine gpt-6.1-sol plan-backed response are verified. An initial MIME-check failure was corrected and a separately authorised second attempt returned **EveryHint is connected.** with response.completed. P6 also verified a real VS Code screenshot explanation and text-only dictionary follow-up with gpt-6.1-sol, under separate two-request authorisation. Other models/sources, real audio, broad account lifecycle and hardware/long-run acceptance remain open. Commercial approval is not claimed. See [current evidence](docs/TESTING.md). P5–P7 software is delivered. P7 automatic-test evidence and remaining human Windows checks are in TESTING.md; P8/P9 software is delivered; P10 software and verification boundaries are documented above; P11 onward remains deferred.

## Set up local speech transcription

Install Visual Studio 2022/2026 C++ Build Tools with the Windows SDK and CMake (3.24+), plus Git. Then explicitly build the CPU helper and install the default model:

```powershell
npm run speech:build
npm run speech:model -- tiny.en
```

The build fetches pinned official whisper.cpp source, never a model. Model installation downloads **77.7 MB** for tiny.en and verifies its pinned SHA-256. The optional base.en model is **148.0 MB**, selectable/installable in EveryHint settings or with `npm run speech:model -- base.en`. Models never download automatically. The tiny.en model and runtime have already been installed locally during P3 verification with the user's authorisation.

Files live under `%LOCALAPPDATA%\EveryHint\speech`: `runtime/`, `models/`, `build/` and speech settings. Set `EVERYHINT_SPEECH_HOME` to choose another local directory; pass the same path using `-SpeechHome` when invoking `scripts/build-transcriber.ps1` directly. Model binaries are excluded from Git. The tested x64 CPU build uses AVX2/FMA/F16C/BMI2; ARM64 builds and older CPU configurations need separate acceptance. No GPU is required. See [the architecture decision](docs/DECISIONS/P3-transcription.md).

After capture has started, choose **Enable transcription**. It cannot activate audio itself. The live panel shows source labels, audio timestamps, provisional replacements and final text. Models load once per enabled run. Partial results are chunk-based inference, not token streaming. The system source can contain several people; EveryHint does not identify speakers.

**Pause transcription** leaves authorised capture running. Pausing/stopping capture cancels inference too. After capture resumes, explicitly resume transcription. **Clear transcript** cancels pending work and removes text, then leaves transcription paused until re-enabled. Final text otherwise remains in memory until cleared, expired or a new capture session is prepared. Settings control model, sensitivity, silence, segment length, overlap and retention. Settings changes pause transcription. Compact mode shows the latest line/status.

Clear transcript also discards any pending AI context review. AI answers and data already sent to a provider are separate: use Clear conversation to clear local AI history. Pausing capture clears the live frame but deliberately preserves a screenshot you explicitly froze in an AI review, allowing inspection; Stop discards that review too.

Once the helper and a verified model are installed, transcription runs offline. A missing/invalid model or worker failure produces a visible error; no remote service is used as a fallback.

## Save and review meetings (P8)

Temporary is the default. In Meetings or Settings, explicitly enable local history and acknowledge 7/30/90-day or indefinite retention (30 days by default). Future-session auto-save is separately optional and off. Opening Meetings never starts capture or opens a database until Unlock/save.

1. Start consented capture and local transcription using the existing controls. Save this meeting session with a title and separate persistence acknowledgement; only final text and source metadata are saved. After Stop, available retained temporary text can also be explicitly saved. No raw audio or screenshots are stored.
2. Open Meetings to browse real records, search text/tags/dates/status, or create a manual-note record. Overview/Transcript/Notes/AI provide source references, explicit speaker corrections, tasks/status, save/revert and protected manual edits. Transcript/search pages are bounded; Continue scans more. Resume only arms a fresh segment and opens capture consent.
3. In AI, choose mic/system/user-note sources and a summary, selected-meeting question, follow-up or action summary. Review the exact excerpts/account/model and acknowledge before sending to OpenAI. Results remain unsaved until Apply. Unknown people/deadlines remain unassigned/unspecified; check every claim against its source. This reuses the ChatGPT plan connection with no paid fallback.
4. Optional automatic End notes need a separate current-run/account/model/source grant with 1–60-minute expiry and one attempt. Default is off. Only deliberate End triggers it; general Stop/Pause revokes it. Drafts still require review/Apply.
5. Export TXT/Markdown/JSON/readable summary through a native save dialog, or copy summary/actions/transcript, after acknowledging an unencrypted copy. Choose a new filename; existing files are preserved. Follow-up drafts leave recipients blank; separately approve the exact edited draft before email-client handoff. Longer mailto drafts must be copied. EveryHint never sends mail; hosted links/Gmail remain deferred.

Sensitive SQLite content is AES-256-GCM encrypted before SQL writes, with profile keys in Windows Credential Manager. IDs/status/times/counts/file size remain visible. History is locked on restart/account/lifecycle changes. Keys are not configuration, and missing keys/corruption preserve encrypted files rather than resetting. Local deletion cannot remove exports, provider retention or guarantee physical SSD erasure. This does not protect against malicious software running as the same Windows user. See [P8 boundaries](docs/DECISIONS/P8-meetings.md).

The authorised synthetic-speech/real-Whisper/gpt-6.1-sol summary test passed generation, evidence validation and Apply in 11.028 seconds; it is not physical-hardware or broad accuracy acceptance. Tests: npm run test:meetings (actual worker/native keyring), npm run smoke:meetings (isolated Windows UI/files; mocked external ports), and npm run check. Remaining human Windows/real-call/endurance checks are in [Testing](docs/TESTING.md).

## Capture a session

1. Choose **Prepare session**. Explicitly enable Screen, Microphone, System audio, or any combination. All sources start disabled on every application launch.
2. Acknowledge authorisation, participant consent and applicable meeting rules. System audio can contain other people's voices and unrelated applications.
3. If Screen is selected, choose a screen or external window. If Microphone is selected, use Windows default or **Refresh microphones** and select an input. Metadata enumeration does not start a recording. Device names may depend on Windows permissions.
4. Choose **Prepare selected sources**, then **Start capture**. Each source shows its actual status, including starting and capturing.
5. Scroll to **Live audio** to inspect independent levels, device names and mute/error status. **Mute microphone** affects EveryHint's input only; its mute setting survives pause/resume. Silent input is labelled silent, because hardware or other apps' mute states are not always exposed to EveryHint.
6. **Pause** releases capture resources, clears screenshots and audio buffers, and zeroes the meters. **Resume** creates new sources using the existing consent and device choices, with permissions checked again. **Stop** additionally revokes consent and clears source selection.

EveryHint windows cannot be selected for screen capture. External application windows have live screenshot previews. Whole-screen preview images stay hidden to prevent recursive screenshots; frame counts remain available. **Paused screenshots are now cleared**, replacing P1's retained-preview behaviour.

The X hides the overlay to the tray. **Hiding does not stop capture.** The tray tooltip/menu report each source, even while hidden. Coral indicates Active Mode, amber paused, purple off, and orange error. Pin EveryHint's tray icon from Windows' overflow area for persistent visibility. If the tray is unavailable, hiding is disabled and minimisation stops capture. Use **Quit EveryHint** to exit and release all sources.

| Shortcut           | Action                                   |
| ------------------ | ---------------------------------------- |
| `Ctrl+Alt+Space`   | Show / hide EveryHint                    |
| `Ctrl+Alt+P`       | Pause / resume the authorised session    |
| `Ctrl+Alt+Shift+X` | Stop all capture, including while hidden |

Shortcut conflicts appear as warnings. Overlay and tray controls remain available.

## Privacy and Windows limits

- No raw captured audio, screenshots, conversations, capture consent or device choices are persisted. Window preferences, interval and bounds live under `%APPDATA%\EveryHint`; speech configuration and installed public model files live under local application data. ChatGPT authentication is intentionally remembered in the OS credential store using EveryHint's registered connection; the renderer never receives passwords/tokens and EveryHint never hardcodes them.
- P2 PCM caches remain bounded to two seconds, 32 packets and 768,000 bytes per source. Explicitly enabled transcription forwards validated PCM locally to main and one native helper. Separate segmentation buffers cap speech at 10–15 seconds; at most four recognition jobs wait. Transcript retention is bounded by age, line count and 50,000 characters. Manual/Auto-Hint transfer requires a reviewed request and acknowledgement; Live requires its separate expiring source/account/model grant. Raw audio stays local.
- Windows system audio uses Electron's supported unmuted loopback option. It captures supported playback mix, rather than selecting one application's audio. Discord, Teams, Zoom and browsers depend on their output routing, Windows permissions and content restrictions; real-call compatibility is unverified.
- Chromium requires an accompanying display track for loopback. EveryHint releases it immediately without reading its images or starting screen analysis. Speakers continue playing.
- Device disconnection, observed playback changes, permission revocation and capture errors stop the session and require fresh preparation. Windows/driver mute and routing behaviour varies; restart the session after changing output devices even if Windows does not report a change.
- A headset reduces acoustic duplication. Microphone echo cancellation/noise suppression are requested, with no guarantee of removing audio already mixed by Windows or other apps. EveryHint plays no capture-monitoring sounds.
- Screen snapshots retain P1's native thumbnail limitations, described in [Architecture](docs/ARCHITECTURE.md).

## Verify

```powershell
npm run check
npm run smoke:ui
npm run smoke:intelligence
npm run test:ai-sdk
npm run test:plan
npm run smoke
npm run smoke:ai
npm run speech:test -- --install-fixture
npm run smoke:speech
```

`check` runs strict TypeScript, lint, unit tests and production build. `smoke` uses synthetic media and needs no speech runtime. The additional speech checks need the installed tiny.en model/helper. `speech:test -- --install-fixture` explicitly downloads a checksum-verified public upstream speech fixture once; subsequent tests are offline. `smoke:speech` sends that fixture through both synthetic P2 sources, real PCM conversion and real whisper.cpp inference. No hardware audio or desktop capture is performed. Known-fixture reports and app-only screenshots are written to ignored `artifacts/`.

The P3 baseline was 157 unit tests. P4.2 adds OAuth/JWT, model, native-vault and actual loopback HTTP/SSE coverage; `test:plan` uses synthetic credentials in an isolated OS-vault namespace and always removes them. These are fixtures, not live provider replies. P4 verification and remaining limitations are recorded in [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), [Backlog](docs/BACKLOG.md) and the [delivery/file manifest](docs/DELIVERY.md). Run `npm run test:ai-sdk` for actual SDK execution against synthetic loopback fixtures and `npm run smoke:ai` for Electron assistant checks; neither is a live provider test or a paid request. P1/P2 hardware and P3 real-device/15-minute acceptance remain pending. P4.2 text and P6 image/follow-up checks passed for one ChatGPT account/model; Claude, real audio and broader account/hardware acceptance remain open. P5–P7 software is delivered. P7 automatic-test evidence and remaining human Windows checks are in TESTING.md; P8/P9 software is delivered; P10 software and verification boundaries are documented above; P11 onward remains deferred.
