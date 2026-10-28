# EveryHint

**Intelligence when you need it.**

EveryHint is a Windows-first, local-first desktop assistant. P1 provides the overlay and screen capture; P2 provides independent microphone and Windows playback capture; P3 adds offline local English transcription through whisper.cpp. P4.2 implements explicit, reviewed ChatGPT plan requests through official Sign in with ChatGPT and the Responses API. A genuine gpt-6.1-sol answer using the app's ChatGPT plan grant was verified on 2026-10-28. Claude remains disabled by default and no paid Claude test was authorised. Capture and transcription need no paid service. The current UI foundation uses the verified EverySession design system, with compact, expanded and dashboard layouts.

## Install and run

Use Windows 10/11 x64 or ARM64 with Node.js **24 LTS** and npm:

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run dev
```

To run the compiled application:

```powershell
npm run build
npm start
```

Dependency installation and Electron's first native binary download need internet access. Application capture stays local. Windows installers and signing belong to P13.

## Interface and product roadmap

The header switches between the **dashboard**, **expanded assistant** and **compact overlay**. All views share the existing capture, transcription and account controllers. Home reports actual current state; Assistant and Settings expose working controls. Meetings, Knowledge, Calendar, People and Modes are clearly labelled as planned and create no records or connections.

- Use **Get Answer** or **Ctrl+Enter while EveryHint is focused** to open/focus the question composer. Neither submits a request. Existing global show/hide, Pause and Stop shortcuts remain unchanged.
- Global **Ctrl+Alt+A** opens Assist and prepares a review; **Ctrl+Alt+Shift+C** clears context and cancels generation. Configure these two chords in Settings. Get Answer prepares a preview; a fresh acknowledgement and Ask are required to send selected information to OpenAI.
- Collapse Live transcript or Conversation & context independently. Navigation and appearance changes retain the draft and frozen review. Active remote requests keep a visible cancellation control even on another page. Capture Pause/Stop stay outside scrolling panels.
- In **EveryHint settings**, choose **Light**, **Dark** or **System**, and set native window opacity between 80% and 100%. Light follows the actual EverySession palette; dark mode is a documented desktop extension. Lower opacity can reduce contrast against background apps.
- Typography is bundled locally: Poppins headings and Inter body, with SIL OFL notices included in production assets. There are no remote font requests. Existing preference files migrate without changing capture consent or account credentials.
- After rebuilding, quit an already-running EveryHint instance before starting the new build. Account sign-in is remembered in OS storage; capture/sharing authorisation is not restored automatically.

Read the [product specification](docs/PRODUCT_SPEC.md), [103-feature coverage matrix](docs/FEATURE_MATRIX.md), [verified design sources](docs/DESIGN_SYSTEM.md) and [P1-P13 roadmap](docs/BACKLOG.md). P6 adds manual screen-aware Assist; P7 adds local Auto-Hint and separately authorised Live Assist. Meeting storage, calendar/people research, enterprise and mobile remain future work. Human Windows visual/hardware acceptance remains open.

## Automatic conversation assistance (P7)

Every launch starts **Manual**, with automatic sharing off. In Settings choose the already consented local microphone/system/screen sources to analyse; then choose **Auto-Hint** for up to three local suggestions. Accept opens the existing transfer review; acknowledge and Ask to send. Local speech remains English-only. Screen changes only suggest reviewing the current source.

**Live Assist** needs active authorised capture, local Whisper, a connected ChatGPT-plan account and an explicitly selected model. Its separate permission lists the exact sources, account/model, triggers and limits. Defaults: 30 minutes, at least 30 seconds between attempts and 20 attempts; the existing five-minute model cache may pause it sooner. Select microphone/system final text and optionally current image/history, then acknowledge **Authorise Live Assist**. Pause Live, capture Pause/Stop, Clear, expiry or account/source/model changes revoke it; Resume/restart never restore it. Root status and tray show remote-enabled state even between answers. There is no automatic Claude, raw audio upload, paid fallback or agent tool execution.

Seven actions include talking points, follow-up questions, **unverified/context-only** Fact Check, selected-retained-window Recap and local user-provided participant information/unknown. No independent fact retrieval, speaker identity or saved meeting records are claimed. Detailed scope, measurements and manual checklist: [TESTING.md](docs/TESTING.md).

## Ask an assistant (P4.2)

1. Choose **ChatGPT · plan usage**, then **Continue with ChatGPT**. Complete OpenAI sign-in and consent in your normal browser. EveryHint creates its own registered connection; your unrelated Codex/IDE login is not imported. Credentials stay in the OS credential store. Identity-only sign-in requires the separate **Grant ChatGPT plan permission** action.
2. Choose **Refresh ChatGPT models** to authorise a model-list request to OpenAI, then select a model. The list is account-specific, held in memory for five minutes, and cleared on account changes. Listing does not guarantee access; only a completed response verifies that request. No fixed model or API-key fallback is assumed. Screenshots stay disabled when current model metadata does not explicitly confirm image input.
3. Choose General Assist, Code Assist or Conversation Assist. Enter an optional question and independently select recent final microphone/system text (30/60/180/300 seconds), a fresh authorised screenshot and previous question/answer text. An empty question requires actual selected context. No raw audio is sent. **Get Answer · review context** freezes the exact selected text/image and model for two minutes. Pause full-screen capture to inspect a frozen image without recursive capture. Remove individual excerpts/exchanges or the image before approval; every removal resets acknowledgement. Draft/preset edits discard review; account/model/provider changes clear conversation/review.
4. Inspect the preview, acknowledge this remote transfer and choose **Ask ChatGPT**. Only Ask submits inference. Responses stream as safe Markdown/code, with cancellation and bounded usage/timing information. Requests use the official public Responses endpoint with storage disabled and no tools. The model cannot execute commands, browse files, edit the workspace or control the computer.
5. **Cancel request** stops the stream. **Clear conversation** removes local history/review/draft; neither recalls transmitted data nor deletes provider records. Old results cannot enter a newer conversation. **Copy response** explicitly copies bounded plain text. Compact mode keeps status/cancellation available.
6. Select **Add account** to connect another registration, or choose a saved registration to reconnect it. **Sign out of ChatGPT** clears that registration's OS-protected tokens and attempts remote revocation, while retaining its client binding for the next sign-in. Remote revocation failures are reported. Sign-in has a five-minute deadline and can be cancelled. OS-store failure never enables plaintext credentials.

Local Whisper transcription is distinct from remote AI inference. Signing in, checking the local connection, preparing capture or reviewing context never submits a question. Refresh explicitly requests metadata; an expiring token may refresh during that action or Ask. No background model requests, automatic question detection, provider switching or separately billed OpenAI API fallback exist. Permission, account/workspace/region eligibility, unavailable models and usage limits produce clear errors. Read [the P4.2 decision](docs/DECISIONS/P4.2-chatgpt-plan.md) for official sources and implementation details.

The UI does not use the Codex runtime for ChatGPT answers: the SDK's lack of a supported deny-all tool policy was the original blocker. The official direct Responses route avoids exposing agent tools. The internal provider ID remains `codex` for compatibility only. App credentials use native OS storage through `@napi-rs/keyring`; `jose` validates signatures. The public installation ID is the only auth file under `%APPDATA%\EveryHint\chatgpt-plan`. Old Codex authentication is left untouched.

**Claude:** subscription sign-in remains disabled without Anthropic approval. The preserved Claude Agent SDK adapter supports only an explicit, separately billed API opt-in for that session and `ANTHROPIC_API_KEY` configured locally. No key is needed for ChatGPT plan use. No paid Claude request was authorised or made. Its commands, tools, plugins and MCP capabilities remain disabled. A detected API key alone is not verified authentication.

History is bounded to four completed question/answer pairs and 12,000 characters; eight bounded responses are displayed, with 15-minute idle expiry. Previous transcript excerpts/images are not automatically included in follow-up history. Requests have a 90-second deadline and 32,000-character response limit. Claude separately limits one turn/4,096 output tokens and uses a $1 estimated budget threshold, which is not a guaranteed spending cap. ChatGPT limits come from your plan/app grant; the app invents no quota or price.

**Distribution and acceptance:** this private-use prototype is designed for eventual distribution. Real browser sign-in, OS-backed reconnection, model discovery and one genuine gpt-6.1-sol plan-backed response are verified. An initial MIME-check failure was corrected and a separately authorised second attempt returned **EveryHint is connected.** with response.completed. P6 also verified a real VS Code screenshot explanation and text-only dictionary follow-up with gpt-6.1-sol, under separate two-request authorisation. Other models/sources, real audio, broad account lifecycle and hardware/long-run acceptance remain open. Commercial approval is not claimed. See [current evidence](docs/TESTING.md). P5–P7 software is delivered. P7 automatic-test evidence and remaining human Windows checks are in TESTING.md; P8+ remains planned.

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

The P3 baseline was 157 unit tests. P4.2 adds OAuth/JWT, model, native-vault and actual loopback HTTP/SSE coverage; `test:plan` uses synthetic credentials in an isolated OS-vault namespace and always removes them. These are fixtures, not live provider replies. P4 verification and remaining limitations are recorded in [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), [Backlog](docs/BACKLOG.md) and the [delivery/file manifest](docs/DELIVERY.md). Run `npm run test:ai-sdk` for actual SDK execution against synthetic loopback fixtures and `npm run smoke:ai` for Electron assistant checks; neither is a live provider test or a paid request. P1/P2 hardware and P3 real-device/15-minute acceptance remain pending. P4.2 text and P6 image/follow-up checks passed for one ChatGPT account/model; Claude, real audio and broader account/hardware acceptance remain open. P5–P7 software is delivered. P7 automatic-test evidence and remaining human Windows checks are in TESTING.md; P8+ remains planned.
