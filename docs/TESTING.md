# EveryHint testing — P3 (P1/P2 acceptance retained)

## Run automated verification

With Node 24 LTS, from the project directory:

```powershell
npm ci
npm run check
npm run smoke
npm run speech:test
npm run smoke:speech
```

Individual commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Run the build before smoke. `npm run test:watch` supports unit development. Speech checks require `npm run speech:build`, explicit `npm run speech:model -- tiny.en`, and the first `npm run speech:test -- --install-fixture`. They never download a model implicitly. The first fixture flag explicitly downloads a pinned known speech sample; subsequent speech checks work offline.

Recorded on **2026-10-27**, in the provided Windows environment:

| Check                                                      | Result                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Strict TypeScript                                          | Passed                                                                                  |
| ESLint with zero warnings                                  | Passed                                                                                  |
| Vitest                                                     | **157 passed, 0 failed; 17 files**                                                      |
| Production build                                           | Passed; main, two sandboxed preloads, overlay, audio document and AudioWorklet emitted  |
| Core Electron smoke                                        | **47 assertions passed**, with synthetic media; all three hotkeys registered            |
| Speech Electron smoke                                      | **11 assertions passed**, real tiny.en inference through two synthetic P2 streams       |
| Native helper + actual inference                           | Built/installed successfully; two known speech jobs recognised through one loaded model |
| Hardware microphone / native Windows loopback / real calls | **Not performed**                                                                       |
| P1 physical Windows acceptance                             | **Not completed**, confirmed by the user                                                |

Final checks pass with no suppressed failures. During P3, build setup was corrected to use the x64 CMake platform name, install only the helper component and use the upstream root license location; third-party CMake/MSVC warnings remain visible. Initial PCM tests accidentally exceeded the existing 8192-sample packet bound and were corrected to use valid packets. Lint findings were corrected. A bounded resampler kernel cache reduces repeated per-sample work. Native/fixture success is reported separately from hardware acceptance.

## P3 coverage and real inference evidence

| File / command                     | Coverage                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transcription-pcm.test.ts`        | Validation, mono/stereo mixing, 8–192 kHz conversion, anti-alias filtering, streaming duration/timestamps and discontinuities                                                  |
| `transcription-segments.test.ts`   | Silence/noise gating, partial/final boundaries, short pauses, maximum length, overlap and reset bounds                                                                         |
| `transcripts.test.ts`              | Provisional replacement, final protection, source ordering, overlap deduplication, retention/count/character caps and clear                                                    |
| `transcription-controller.test.ts` | Authorised routing, simultaneous sources, cancellation/loading/crash failures, fairness/backpressure, new-session guards, clear and automatic expiry                           |
| `whisper-worker.test.ts`           | Hidden single-process protocol, model errors, crashes, bounded I/O, timeout, stop and late-result rejection                                                                    |
| `speech-models.test.ts`            | No implicit fetch, trusted-checksum success/failure, size caps, abort cleanup, missing runtime and corrupt settings                                                            |
| Extended P2 tests                  | Explicit token/source PCM gate, native-clock timestamp spacing and muted-zero PCM                                                                                              |
| `speech:test`                      | Real C API tiny.en inference on the checksum-verified upstream JFK fixture, twice through one loaded model; checks the expected recognised phrase                              |
| `smoke:speech`                     | Real AudioWorklets, 16 kHz conversion, segmentation, fair helper scheduling, provisional/final text from both sources, ordering, UI, clear and independent transcription pause |

The default core smoke still uses only oscillators and needs no model. Speech smoke uses known fixture MediaStreams injected only by Playwright, then the actual production PCM/Whisper pipeline. No production fake-recognition mode exists. Test profiles use isolated settings/model hard links and are removed afterward. No real microphone, Windows playback or desktop content is acquired by either smoke test.

Known-fixture evidence is written only by test scripts to ignored `artifacts/inference.json`, `artifacts/speech-smoke.json` and `artifacts/everyhint-transcription.png`. Product capture does not write raw audio or conversations. Upstream fixture SHA-256: `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`.

### Recorded performance observations

One recorded x64/CPU/four-thread run on 2026-10-27 (warm filesystem cache): tiny.en helper load **86.3 ms**; the approximately 11-second fixture took **648.0 ms** and **528.2 ms** for consecutive jobs. Working set was about **165 MiB** after inference; helper CPU during inference was **373–395% of one core** (roughly four cores, not that percentage of the whole machine). Direct-test results are checked against real recognised speech, not mocked text.

A recorded dual-source Electron run loaded in **134.2 ms**, averaged **487.4 ms** across **10** chunk recognitions, and ended at queue length **0**, dropped jobs **0**, gaps **0**, working set approximately **166 MiB**. These are short fixture measurements, not universal latency, cold-start, battery, full-application CPU or 15-minute stability guarantees. Reruns vary; the ignored reports contain each latest run. Base.en actual inference and hardware speech remain untested.

## P3 Windows manual acceptance

All items below remain **Pending**, in addition to P1/P2 checks further down.

| #   | Check                                                                            | Expected result                                                                                                                              |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Launch normally, without enabling capture/transcription                          | Existing overlay works; transcription OFF; no model process, microphone activation or automatic download                                     |
| 2   | Build helper; explicitly install/verify tiny.en; enable after authorised capture | Installed status/size visible; checksum validated; local model loads and diagnostics update                                                  |
| 3   | Speak through a real selected microphone                                         | Actual readable Mic text, provisional replacements and final segments                                                                        |
| 4   | Play spoken audio through Windows                                                | Actual System text where loopback/routing permits; no unintended microphone activation                                                       |
| 5   | Use both sources simultaneously, including a consented call                      | Provenance remains separate; fair updates; no speaker-identity claim                                                                         |
| 6   | Compare source labels and audio timestamps across sources                        | Correct source and chronological ordering; timestamps represent audio rather than inference completion                                       |
| 7   | Speak with short and long pauses                                                 | Short pauses remain inside an utterance; long silence finalises; no repeated appending of provisional text                                   |
| 8   | Speak continuously beyond the maximum segment                                    | Bounded segmentation with limited overlap; inspect boundary deduplication and missed/revised words                                           |
| 9   | Explicitly install base.en and switch models                                     | Settings change pauses transcription, old helper releases, new chosen model loads once after Resume                                          |
| 10  | Toggle compact/expanded mode and scroll transcript                               | Latest line/status in compact; ordered rolling view and usable controls in expanded mode                                                     |
| 11  | Pause transcription independently                                                | Audio indicators/capture remain truthful; no further recognition until explicitly resumed                                                    |
| 12  | Pause and Stop capture by UI/tray/global shortcuts, including while hidden       | Pending recognition cancelled; helper exits; no late text; no automatic transcription after capture Resume                                   |
| 13  | Clear text during queued/in-flight recognition                                   | Final/provisional text removed; old results cannot reappear; transcription remains paused                                                    |
| 14  | Inspect network/offline operation after setup                                    | No transcription API, content upload, analytics or listening HTTP service; offline inference still works                                     |
| 15  | Inspect application data after a conversation and restart                        | Only preferences/models/runtime persist; no conversation/raw capture files; capture/transcription start disabled                             |
| 16  | Disconnect microphone or change Windows playback device                          | Existing P2 failure/consent cleanup remains; inference stops; no orphan process                                                              |
| 17  | Interrupt helper/model loading, remove/corrupt a model, or terminate helper      | Readable error, no hung queue, no surviving model process or late results; capture never starts independently                                |
| 18  | Re-run all original screen/audio combinations                                    | All seven combinations remain functional; screen-only cannot enable speech recognition                                                       |
| 19  | Run a **15-minute authorised continuous conversation**                           | Sample diagnostics/Task Manager at 0/5/10/15 min; record CPU, working set, queue/drops/gaps, transcript stability and helper exit after Stop |
| 20  | Exercise retention limits while quiet and while speaking                         | Old text expires automatically; line/character caps hold; Clear releases all current text                                                    |

For the 15-minute test, note model/thread configuration, hardware, sources, room noise and output routing. Record actual values rather than marking it passed from unit/synthetic tests. The energy gate can treat noise as speech or miss quiet words; overlap text matching is approximate and overload deliberately drops old queued audio.

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

Loopback is the supported playback mix, not an arbitrary external application's isolated audio. Protected/exclusive playback, nondefault output routing, remote sessions and drivers can prevent capture. Windows/app mute and device-change notifications vary. A headset and disabled microphone monitoring reduce duplication. P2 capture checks do not enable P3 recognition; transcription requires its separate explicit action.

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
