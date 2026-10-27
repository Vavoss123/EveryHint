# EveryHint testing — P2

## Run automated verification

With Node 24 LTS, from the project directory:

```powershell
npm ci
npm run check
npm run smoke
```

Individual commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Run the build before smoke. `npm run test:watch` supports unit development.

Recorded on **2026-10-27**, in the provided Windows environment:

| Check                                                      | Result                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Strict TypeScript                                          | Passed                                                                                 |
| ESLint with zero warnings                                  | Passed                                                                                 |
| Vitest                                                     | **102 passed, 0 failed; 11 files**                                                     |
| Production build                                           | Passed; main, two sandboxed preloads, overlay, audio document and AudioWorklet emitted |
| Real Electron smoke                                        | **47 assertions passed**, with synthetic media; all three hotkeys registered           |
| Hardware microphone / native Windows loopback / real calls | **Not performed**                                                                      |
| P1 physical Windows acceptance                             | **Not completed**, confirmed by the user                                               |

During development, tests were updated for newly permitted audio consent and the extended state shape, a lint/type issue was corrected, and the smoke test was changed to poll acknowledged IPC state rather than treating async predicates as settled. Final verification passes; no failing checks are suppressed.

## Coverage

| File                        | Behaviours                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio-session.test.ts`     | Seven combinations, consent and enumeration gates, device whitelist, Windows-only support, STARTING vs CAPTURING, pause/resume/stop, preserved mute, stale events, failure cleanup, repeated starts/stops            |
| `audio-engine.test.ts`      | Separate browser acquisitions/levels, companion video disposal, mute/silence, permission denial, track end, processor/setup errors, device/input/output changes, pending acquisition/module cleanup, repeated cycles |
| `audio-host.test.ts`        | Exact worker identity/permissions, camera denial, one-time activation/display grant, unmuted loopback choice, bounded startup, duplicate prevention, metadata context disposal and shutdown/stop                     |
| `audio-permissions.test.ts` | Independent native source permissions, participant acknowledgement, bounded/finite validated IPC reports and raw-PCM rejection                                                                                       |
| `audio-processing.test.ts`  | RMS correctness, byte/time/count bounds, oversized packet rejection, stereo interleaving and worklet backpressure                                                                                                    |
| Existing six P1 files       | Consent/state/screen scheduler lifecycle, native screen boundary, late results, hotkeys, settings/persistence and asset/CSP/IPC validation                                                                           |

Smoke launches the compiled app with a temporary profile. A test-only Playwright script injects synthetic oscillator MediaStreams into the dedicated audio document. Production code contains no synthetic-media mode. The test uses real AudioContexts, AudioWorklets, IPC, meters and window lifetimes for mic-only, system-only and combined audio. It checks companion video release, exactly one acquisition per enabled source, sandboxing, mute, pause/resume, Stop, active-capture application shutdown and restart into IDLE. Original overlay/window/settings/consent/hotkey registration checks remain.

No real desktop, microphone or playback content is captured. The screen source picker is not invoked. Only application UI screenshots are saved to ignored `artifacts/everyhint-overlay.png` and `artifacts/everyhint-audio.png`. Temporary settings are removed after the test.

## Performance observations and limits

- Tests verify maximum PCM cache size (768,000 bytes), age (2 seconds) and packet count (32) per source, including a 10,000-packet processing case.
- Worklet backpressure permits one packet in flight; source channels remain separate. Worker diagnostics run at 5 Hz per source. Screen images are excluded from frequent meter events.
- Repeated start/stop tests assert track/node/context disposal and zero remaining timers. Electron smoke confirms capture-window destruction on pause, Stop and active shutdown.
- These are software bounds and lifecycle observations. Real Windows CPU, long-duration RSS, battery, device-driver release timing, loopback continuity after companion-video disposal and call compatibility remain unmeasured. No hardware performance result is claimed.

## Windows audio manual acceptance

Run `npm run dev`, or build then `npm start`. Use content and participants for which capture is authorised. Pin EveryHint's tray icon. All results below are **Pending**.

| #   | Test                                                                                                                 | Expected result                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Connected headset microphone; Refresh microphones and choose it                                                      | Selected input name appears; only that microphone captures                                                                    |
| 2   | Built-in microphone, if present                                                                                      | Real signal while speaking; Windows privacy denial gives a readable error                                                     |
| 3   | System audio with ordinary local playback                                                                            | System meter responds; speakers remain audible; no screen-analysis frames appear unless Screen was selected                   |
| 4   | Consented Discord test call                                                                                          | Participant playback drives system meter where OS/routing permits; no unsupported per-app isolation claim                     |
| 5   | Consented Teams or Zoom test call, where available                                                                   | Supported playback appears; note any driver/routing/protection limitations                                                    |
| 6   | Microphone-only session                                                                                              | Screen/system remain disabled; no screen picker or loopback acquisition                                                       |
| 7   | System-audio-only session                                                                                            | Microphone/screen analysis remain disabled; accompanying display track is released; loopback continues                        |
| 8   | Microphone + system, then each combination with Screen                                                               | Meters stay independent; Screen snapshots operate only when selected; no duplicate sessions                                   |
| 9   | Speak with no system playback                                                                                        | Microphone meter responds; system meter remains quiet where microphone monitoring is off                                      |
| 10  | Another participant speaks while you remain quiet                                                                    | System meter responds; note acoustic pickup/monitoring duplication rather than claiming software deduplication                |
| 11  | EveryHint mute/unmute, headset hardware switch, Windows/app mute separately                                          | EveryHint mute returns its meter to zero and survives pause/resume; other mutes may show silence without a reliable mute flag |
| 12  | Pause/resume by UI, tray and `Ctrl+Alt+P` with another app focused                                                   | All sources released/paused; screenshots cleared and meters zero; only authorised sources reacquired; mute preserved          |
| 13  | Hide overlay and use `Ctrl+Alt+Shift+X`                                                                              | Capture stops immediately; all consent/preview cleared; tray shows stopped; no automatic restart                              |
| 14  | Unplug the active microphone; revoke access where supported                                                          | Visible source error; all sources released; fresh device selection/preparation required                                       |
| 15  | Change default Windows playback device and microphone endpoint                                                       | Reported changes stop the session; no silent retargeting; reprepare manually if driver sends no notification                  |
| 16  | Close overlay with X; separately Quit EveryHint during capture                                                       | X hides and tray still discloses active sources; Quit releases every stream/processing context                                |
| 17  | Restart, lock/unlock and sleep/wake during capture                                                                   | No automatic capture; restart IDLE; lock/suspend revoke consent and require preparation                                       |
| 18  | Re-run all P1 checks below                                                                                           | Existing screen/window/settings/hotkey behaviour preserved, with paused screenshots now cleared                               |
| 19  | Disable Windows desktop microphone access, use an unavailable/exclusively held device, or interrupt startup          | Useful error and complete cleanup; no stuck STARTING state past the startup deadline                                          |
| 20  | Observe Task Manager and Windows privacy indicators through a long authorised session and repeated pause/stop cycles | No continuing microphone indication or audio processing after stop; record real CPU/RSS before making performance claims      |

Loopback is the supported playback mix, not an arbitrary external application's isolated audio. Protected/exclusive playback, nondefault output routing, remote sessions and drivers can prevent capture. Windows/app mute and device-change notifications vary. A headset and disabled microphone monitoring reduce duplication. EveryHint has no speech recognition or automatic meeting recording in P2.

## Outstanding P1 regression checklist

All physical checks remain pending:

1. Launch with correct EveryHint branding and IDLE/capture off; no automatic consent or frames.
2. Drag/resize overlay, toggle always-on-top and verify bounds restoration after quitting/relaunching, including monitor/DPI changes.
3. Show/hide from another app with `Ctrl+Alt+Space`; hiding must preserve actual active state in the tray.
4. Verify both consent checks and real screen/window metadata selection; EveryHint windows excluded.
5. Select an external window, prepare without frames, Start and inspect real window screenshots after the configured interval.
6. Capture a display and verify frame counts; whole-screen preview stays hidden to prevent recursion. **Pause and Stop must clear every image**.
7. Pause for at least two capture intervals: count stops increasing and no screenshot reappears. Resume only the previously authorised session.
8. Stop from UI, tray and global shortcut, including while hidden; source/consent/frame cleared and Resume refused.
9. Close overlay to tray, reopen, then Quit/relaunch: capture never restores automatically.
10. Close/minimise a selected window or disconnect the selected display; errors stop capture without choosing a replacement source.
11. Check interval changes apply on the next activation, compact controls remain accessible and response expand/collapse works.
12. Confirm tray source states, conflict warnings for occupied shortcuts, and disabled P4 provider controls.
13. Lock/suspend during screen capture: no automatic resume; UI errors/crashes must also release capture.
14. Inspect preferences and storage: only version/settings/bounds; no raw screen/audio files, credentials, device choices or consent.

Native screen thumbnail requests already in flight cannot be cancelled mid-call; their results must be discarded after pause/stop. Real hardware, call compatibility, installer/signing, long-run performance and physical shortcut interaction are not certified by the automated results above.
