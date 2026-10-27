# P2 delivery

P2 extends the existing P1 application with independent microphone and Windows system-audio capture, per-source consent/state, selected microphone devices, mute, live local diagnostics, bounded PCM and full capture-context disposal. Screen-only and every audio/screen combination are supported. Transcription, whisper.cpp, AI providers and native WASAPI modules were not added.

## P1 acceptance and correction

The user confirmed that P1 manual Windows checks are **not completed**. The paused screenshot was a deliberately retained preview; the screen scheduler was already stopped. Commit **`ee3fc00` — `fix: clear screenshot previews when capture pauses`** clears it, with the P1 regression suite passing before P2 implementation. Paused whole-screen screenshots are no longer retained. No other blocking implementation issue is known from automated checks; manual acceptance remains outstanding.

## Architecture and supported sources

Main owns validated consent and source choices. A dedicated sandboxed audio BrowserWindow, using an in-memory session and separate narrow preload, acquires browser MediaStreams and runs independent AudioWorklets. Microphone capture supports enumerated/default Windows inputs. System capture uses Electron's unmuted Windows playback loopback; its accompanying video track is released without screen analysis. Actual per-source states and low-rate RMS diagnostics reach the overlay/tray. Audio frames remain in bounded local buffers and are never saved/uploaded.

Pause/Stop destroy the capture context, release browser-owned resources, cancel screen sampling, clear screenshots/buffers and zero meters. Resume checks permissions again and preserves an explicit microphone mute. Stop, lock/suspend, failure and shutdown revoke consent. Epoch checks reject late events; duplicate acquisitions and unconsented source reports are rejected. See [Architecture](ARCHITECTURE.md).

## Files changed

Modified:

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
electron.vite.config.ts
package.json
package-lock.json
scripts/smoke.mjs
src/main/index.ts
src/main/security.ts
src/main/session.ts
src/preload/index.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/contracts.ts
src/shared/validation.ts
tests/session.test.ts
```

Created:

```text
scripts/synthetic-audio.mjs
src/main/audio-host.ts
src/main/audio-permissions.ts
src/preload/audio.ts
src/renderer/audio.html
src/renderer/audio/engine.ts
src/renderer/audio/main.ts
src/renderer/audio/worklet.ts
src/shared/audio.ts
src/shared/audio-ipc.ts
tests/audio-engine.test.ts
tests/audio-host.test.ts
tests/audio-permissions.test.ts
tests/audio-processing.test.ts
tests/audio-session.test.ts
```

No unrelated files or npm dependencies were added. Package/lock metadata is 0.2.0. Build output and app-only smoke screenshots remain ignored.

## Verification and limitations

- TypeScript, lint, **102 unit tests in 11 files**, production build and **47 Electron smoke assertions** pass. All three OS shortcuts registered. Synthetic tests exercise actual Web Audio/AudioWorklets, IPC, sandboxing and context teardown without acquiring real media.
- Hardware microphones, native Windows loopback continuity, consented Discord/Teams/Zoom calls and P1 physical acceptance remain **unverified**. The [Testing checklist](TESTING.md) records every required manual check.
- Loopback captures the supported Windows playback mix, with routing/driver/content restrictions and no per-application exclusion guarantee. Hardware/app mute and device-change reporting vary. Session restart is required after errors or device changes; manual output changes should be followed by re-preparation even when no event arrives.
- Application PCM caches are bounded to 768,000 bytes, 32 packets and two seconds per source; backpressure bounds worklet queues. Source reports are 5 Hz; frequent meter events contain no screen pixels or raw audio. Long-run Windows CPU/RSS/battery and OS/driver cleanup timing have not been benchmarked.
- Main enforces a 20-second startup deadline. Native capture/device behaviour is an acceptance risk until hardware checks are completed. Consider native WASAPI only if Electron loopback fails real MVP acceptance.

## Run and commit

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run dev
```

```powershell
npm run check
npm run smoke
npm start
```

The P2 commit uses **`feat: add EveryHint microphone and system audio capture`**. Use `git log -2 --oneline` and `git status --short` for the recorded commits and tree state. P3 has not started and requires explicit approval.
