# EveryHint

**Intelligence when you need it.**

EveryHint is a Windows-first, local-first desktop assistant. P1 delivers a real Electron overlay, consent-based screen snapshots, privacy controls, system tray integration, settings and global shortcuts. Audio, transcription and AI are visibly unavailable until their later milestones. No provider account or API credits are needed for P1.

## Install and run

Use Windows 10/11 x64 or ARM64, Node.js **24 LTS**, and npm. From PowerShell:

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run dev
```

Electron downloads its matching native binary on first launch; dependency installation and that first download need internet access. P1 application capture never uploads screenshots. Development serves assets only from a local Vite server.

To build and run the production application:

```powershell
npm run build
npm start
```

This launches the compiled application through Electron. An installer, code signing and distributable packaging belong to P6.

## Use EveryHint

1. Choose **Prepare session**. Enable **Screen or application window** and acknowledge your authorisation and any required participant consent.
2. Choose a screen or window from the source list, then choose **Prepare session**. Source selection enumerates names without requesting screenshot thumbnails.
3. Press **Start capture**. EveryHint takes local snapshots, initially every three seconds. Open **Capture diagnostics** to see the frame count.
4. Pause to inspect a whole-screen screenshot. Selected external application windows support live previews. EveryHint's windows cannot be selected, and whole-screen previews stay hidden during active capture to prevent recursive screenshots.
5. **Pause** stops scheduled capture and retains the latest frame and session consent in memory. **Resume** uses that authorised source. **Stop** clears the frame and revokes consent; another session requires preparation.

Closing the overlay hides it to the tray. **Hiding does not stop capture.** The tray icon is coral while active, amber while paused, and purple when capture is off (orange indicates an error). Its tooltip and menu show the actual state. Use **Quit EveryHint** in the tray or settings to exit. If the tray cannot be created, hiding is disabled.

| Shortcut           | Action                                   |
| ------------------ | ---------------------------------------- |
| `Ctrl+Alt+Space`   | Show / hide EveryHint                    |
| `Ctrl+Alt+P`       | Pause / resume an authorised session     |
| `Ctrl+Alt+Shift+X` | Stop all capture, including while hidden |

Shortcut conflicts appear in settings and as warnings; overlay and tray controls remain available. Custom bindings have a controller interface but no P1 customisation UI.

## Privacy and scope

- Every launch starts **IDLE**. Consent, source selection and screenshots are never restored from disk.
- Screen snapshots stay in memory. Stop, capture failure, shutdown, screen lock and system suspend revoke consent and clear retained frames.
- No microphone access, system audio, transcription, AI requests, authentication, credentials, analytics or screenshot files in P1.
- Only window appearance, capture interval and window bounds are saved in `settings.json` under Electron's EveryHint user-data directory (normally `%APPDATA%\EveryHint`).
- P1 uses `desktopCapturer` native thumbnails as low-frequency snapshots, capped at approximately 960 × 540. There is no persistent camera, microphone or screen `MediaStream` to stop. Pausing/stopping disposes the scheduler and invalidates results already in flight.
- Electron's thumbnail API works by source kind, so it can create temporary thumbnails of other windows or displays of that kind inside the native enumeration. Only the chosen image is retained or delivered to the overlay. See the capture boundaries in [Architecture](docs/ARCHITECTURE.md).

## Verify

```powershell
npm run check
npm run smoke
```

`check` runs strict TypeScript checking, lint, unit tests and a production build. Run it before `smoke`, which launches the compiled Electron app with a temporary profile, checks the real UI and IPC, and saves an **application-only** screenshot to `artifacts/everyhint-overlay.png`. Smoke tests never capture the desktop or enumerate its sources.

P1 is implemented and automated checks pass. Real screen capture, global shortcut use with another application focused, tray presentation and the remaining physical Windows checks still require manual acceptance. See [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), [Backlog](docs/BACKLOG.md) and the [delivery/file manifest](docs/DELIVERY.md). P2 has not started.
