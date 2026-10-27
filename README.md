# EveryHint

**Intelligence when you need it.**

EveryHint is a Windows-first, local-first desktop assistant. P1 provides the floating overlay, screen snapshots, tray, hotkeys and settings. P2 adds independently authorised microphone and Windows playback capture, device selection, mute and live audio diagnostics. Transcription and AI remain future features. No account, API credits or paid service is needed.

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

- No raw audio files, screenshots, conversations, consent, device choices or credentials are persisted. Only window preferences, snapshot interval and bounds are stored, normally under `%APPDATA%\EveryHint\settings.json`.
- Audio stays in a dedicated sandboxed context. Local PCM buffers are bounded to two seconds, 32 packets and 768,000 bytes per source. Only status and low-rate audio levels reach the overlay; no audio or images go to providers.
- Windows system audio uses Electron's supported unmuted loopback option. It captures supported playback mix, rather than selecting one application's audio. Discord, Teams, Zoom and browsers depend on their output routing, Windows permissions and content restrictions; real-call compatibility is unverified.
- Chromium requires an accompanying display track for loopback. EveryHint releases it immediately without reading its images or starting screen analysis. Speakers continue playing.
- Device disconnection, observed playback changes, permission revocation and capture errors stop the session and require fresh preparation. Windows/driver mute and routing behaviour varies; restart the session after changing output devices even if Windows does not report a change.
- A headset reduces acoustic duplication. Microphone echo cancellation/noise suppression are requested, with no guarantee of removing audio already mixed by Windows or other apps. EveryHint plays no capture-monitoring sounds.
- Screen snapshots retain P1's native thumbnail limitations, described in [Architecture](docs/ARCHITECTURE.md).

## Verify

```powershell
npm run check
npm run smoke
```

`check` runs strict TypeScript, lint, all unit tests and the production build. `smoke` launches compiled Electron with a temporary profile and synthetic media; it does **not** capture a microphone, Windows playback or the desktop. App-only diagnostic screenshots are written to ignored `artifacts/`.

The automated baseline is **102 unit tests and 47 Electron smoke assertions**. P1 manual checks are still pending, as confirmed by the user. Hardware microphones, real Windows loopback and consented calls also require the [manual checklist](docs/TESTING.md). See [Architecture](docs/ARCHITECTURE.md), [Backlog](docs/BACKLOG.md) and the [delivery/file manifest](docs/DELIVERY.md). P3 has not started.
