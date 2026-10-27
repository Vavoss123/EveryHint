# EveryHint

**Intelligence when you need it.**

EveryHint is a Windows-first, local-first desktop assistant. P1 provides the overlay and screen capture; P2 provides independent microphone and Windows playback capture; P3 adds offline local English transcription through whisper.cpp. P4 adds explicit, reviewed AI requests and a restricted Claude API adapter. **Codex inference is disabled because the current SDK cannot enforce response-only permissions. Claude live verification remains pending; the user requested no paid tests.** Capture and transcription need no paid service.

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

Dependency installation and Electron's first native binary download need internet access. Application capture stays local. Windows installers and signing belong to P6.

## Ask an assistant (P4)

1. Choose Codex or Claude. **Check connection** inspects local authentication only; it never requests an answer. Codex reuses the official CLI's existing ChatGPT login status without reading tokens. Its current SDK has no supported deny-all tool control, so EveryHint blocks inference even when signed in. Read-only filesystems alone still allow commands. No OpenAI API fallback is used.
2. Claude is **disabled by default** and supports only a separately billed Anthropic API key. If you choose to use it later, set `ANTHROPIC_API_KEY` in the environment that starts EveryHint, then enable the labelled API-billing checkbox for that app session. Do not commit or paste credentials into questions. A detected key is not proof of successful authentication. Claude subscription/OAuth login is unsupported in this distributable app without Anthropic approval.
3. Enter a question. Optionally select recent final microphone text, system-audio text, the latest authorised screenshot, and previous question/answer text independently. Context limits are editable. No raw audio is sent; no OCR or other-provider fallback runs.
4. Choose **Review selected context**. This freezes the exact selected text and image in memory for two minutes. Inspect the text and optional image. For full-screen capture, pause capture to inspect the frozen image without recursive screenshots. Editing the draft/choices invalidates its review. Stop clears a pending review.
5. Acknowledge the remote transfer for that specific review and choose **Ask**. Only this action can start inference. Claude streams text, reports available usage/cost estimates and supports cancellation. All tools, commands, skills, plugins and MCP integrations are disabled. Code is displayed as selectable text. **Copy response** writes plain text after an explicit click.
6. **Cancel** aborts SDK execution; late events cannot replace newer answers. **Clear conversation** cancels and clears local history/review/draft. Switching providers starts a new conversation and resets draft choices. Clear does not delete provider-side records or recall transmitted data. Compact mode shows answer/status and cancellation; expand to compose.

History keeps at most four completed question/answer pairs and 12,000 characters; displayed responses keep eight bounded entries. Conversation memory expires after 15 minutes of inactivity. Previous transcript excerpts and images are not stored in follow-up history, and unchanged images are not automatically resubmitted. Request deadline: 90 seconds. Responses: 32,000 characters maximum. Claude limits output to 4,096 tokens, one model turn and a $1 **estimated** SDK budget; this is not a guaranteed billing cap. Set account-side spend controls if using the API. Provider/model availability and live latency remain unverified.

SDKs: Codex **0.164.0** / bundled CLI **0.164.0**, Claude Agent SDK **0.3.311** / bundled CLI **2.1.311**. Claude runs in bare mode with isolated temporary settings and `persistSession: false`. SDK caches, OS remnants and remote retention are independent of EveryHint's memory. The normal Codex SDK persists sessions under `~/.codex/sessions`; EveryHint never starts a Codex session while blocked. See the [authentication and security decision](docs/DECISIONS/P4-providers.md) for official sources and restrictions.

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

- No raw captured audio, screenshots, conversations, consent, device choices or credentials are persisted. Window preferences, interval and bounds live under `%APPDATA%\EveryHint`; speech configuration and installed public model files live under local application data.
- P2 PCM caches remain bounded to two seconds, 32 packets and 768,000 bytes per source. Explicitly enabled transcription forwards validated PCM locally to main and one native helper. Separate segmentation buffers cap speech at 10–15 seconds; at most four recognition jobs wait. Transcript retention is bounded by age, line count and 50,000 characters. Provider transfer requires a separate reviewed request and acknowledgement; raw audio stays local.
- Windows system audio uses Electron's supported unmuted loopback option. It captures supported playback mix, rather than selecting one application's audio. Discord, Teams, Zoom and browsers depend on their output routing, Windows permissions and content restrictions; real-call compatibility is unverified.
- Chromium requires an accompanying display track for loopback. EveryHint releases it immediately without reading its images or starting screen analysis. Speakers continue playing.
- Device disconnection, observed playback changes, permission revocation and capture errors stop the session and require fresh preparation. Windows/driver mute and routing behaviour varies; restart the session after changing output devices even if Windows does not report a change.
- A headset reduces acoustic duplication. Microphone echo cancellation/noise suppression are requested, with no guarantee of removing audio already mixed by Windows or other apps. EveryHint plays no capture-monitoring sounds.
- Screen snapshots retain P1's native thumbnail limitations, described in [Architecture](docs/ARCHITECTURE.md).

## Verify

```powershell
npm run check
npm run test:ai-sdk
npm run smoke
npm run smoke:ai
npm run speech:test -- --install-fixture
npm run smoke:speech
```

`check` runs strict TypeScript, lint, unit tests and production build. `smoke` uses synthetic media and needs no speech runtime. The additional speech checks need the installed tiny.en model/helper. `speech:test -- --install-fixture` explicitly downloads a checksum-verified public upstream speech fixture once; subsequent tests are offline. `smoke:speech` sends that fixture through both synthetic P2 sources, real PCM conversion and real whisper.cpp inference. No hardware audio or desktop capture is performed. Known-fixture reports and app-only screenshots are written to ignored `artifacts/`.

The P3 baseline was 157 unit tests. P4 verification and remaining limitations are recorded in [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), [Backlog](docs/BACKLOG.md) and the [delivery/file manifest](docs/DELIVERY.md). Run `npm run test:ai-sdk` for actual SDK execution against synthetic loopback fixtures and `npm run smoke:ai` for Electron assistant checks; neither is a live provider test or a paid request. P1/P2 hardware and P3 real-device/15-minute acceptance remain pending. P4 live acceptance is open; P5 has not started.
