# EveryHint -- P4.2 verification, 2026-10-28

Live verification on **2026-10-28 succeeded** with **gpt-6.1-sol** using EveryHint's own SIWC ChatGPT plan grant and the public Responses endpoint. The approved question was **Reply exactly: EveryHint is connected.** The actual completed answer was **EveryHint is connected.** No screenshot, transcript, history or raw audio was sent. The response reported **167 input / 9 output tokens**, first text in **4.214 s** and completion in **4.299 s**. No API-key/provider fallback or paid Claude request was made. These are a single observation, not a latency guarantee, quota balance or dollar-cost estimate.

Two plan requests were made, each separately authorised. The first was rejected by an overly strict SSE MIME check before any text was displayed. The corrected parser validates bounded SSE data frames independently of MIME metadata, still requires response.completed, rejects non-streaming JSON as completion and cleans up its reader. Three regression cases cover this. The second authorised request completed genuinely; no automatic inference retry occurred. Either attempt may consume the user's plan allowance.

| Check | P4.2 result |
| --- | --- |
| TypeScript / zero-warning lint / production build | Passed |
| Unit/regression suite | **298 tests in 25 files**; original 234 retained, 64 new plan cases |
| Native OS vault + real loopback HTTP | **5 passed** via npm run test:plan; actual Windows credentials and four OAuth/JWT -> models -> frozen review -> HTTP/SSE pipelines |
| Installed Claude SDK/CLI loopback | **6 passed**; no paid/remote provider endpoint |
| Core Electron smoke | **47 assertions passed**; synthetic media; hotkeys correctly reported unavailable while the separate interactive EveryHint window held them |
| Assistant Electron smoke | **37 assertions passed**; fresh app vault, auth/model IPC rejection, consent/model controls, safe rendering/copy and reviewed transfer gates |
| Speech Electron smoke | **11 assertions passed**, actual tiny.en through both synthetic P2 sources |
| Standalone speech fixture | Actual tiny.en JFK recognition passed twice with one loaded model; cached/offline |
| Genuine ChatGPT plan response | **Passed**; gpt-6.1-sol, signed EveryHint plan grant, response.completed and exact approved answer |
| Claude live authentication/inference | **Not performed**, per the user's no-paid-request instruction |
| Real Windows devices/calls/15-minute run | Still pending; earlier P1-P3 manual checklists retained below |

Electron assertions total **95**. The successful live reply is distinct from the synthetic fixtures. Safe evidence lives under ignored artifacts/p42-live-result.json; the failed attempt is recorded separately. No token, browser URL, raw provider body or captured context is in those reports or Git. The saved OS connection survived app restarts. The actual account catalog returned eight visible models: gpt-6.1-sol, gpt-6-astra, gpt-6.1-terra, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra and gpt-5.6-luna. All advertised image input. Only gpt-6.1-sol text inference was verified; other models, real image requests, other accounts/workspaces/regions and future limits remain unverified.

New tests cover registration/client/host/state/nonce/PKCE/callback binding, RS256/JWKS/issuer/audience/subject/client/scope validation, identity-only consent, invalid signatures, fresh ID tokens, refresh/rotation/revocation, safe HTTP diagnostics, atomic native vault failures/bounds, account isolation/cancellation, model ordering/TTL/stale discovery, image support, exact request construction, split UTF-8, MIME-independent valid SSE, JSON errors, failed/incomplete streams, permission/rate limits, rejected tools and aborted readers. Existing context/controller tests retain independent sources, selection/bounds, screenshots, fresh consent, late events and conversation/session guards. Completion now refreshes local model verification status without another remote request.

Reproduce:

```powershell
npm run check
npm run test:plan
npm run test:ai-sdk
npm run smoke
npm run smoke:ai
npm run speech:test
npm run smoke:speech
```

The native-vault integration test uses a unique OS namespace with synthetic credentials and removes it afterwards. Local HTTP tests inject a test transport; production endpoints cannot be overridden through renderer input or environment variables. Real tiny.en/runtime/JFK files were previously downloaded with authorisation and are cached; no new download is needed. Native keyring loading was verified in actual Electron. Real provider tests are never part of these automatic scripts and require separate, explicit authorisation.

Remaining manual checks: similarly labelled account switching, sign-out/revocation/reconnect, browser denial/timeout/OS-store/proxy failures, real screenshot and captured-transcript transfer, physical screens/windows/microphone/Windows playback, consented calls, base.en, older CPU/ARM64, 15-minute CPU/RSS/stability and combined capture/transcription/live AI performance. The user previously confirmed P1 manual checks were not completed. Commercial/distribution eligibility is separate from this successful personal account test. P5 is not started.

## Historical P4/P4.1 verification (superseded where described above)

# EveryHint testing — P4 (P1–P3 acceptance retained)

## Account sign-in follow-up — 2026-10-27

`npm run check` now passes **234 unit tests in 21 files**, including **15 new account-flow cases**, strict TypeScript, zero-warning lint and production build. New tests cover no startup login, fixed native command arguments, isolated credential profile, forced OS-keyring/ChatGPT auth, no API/environment credential inheritance, verified success/sign-out, rejected API auth, duplicate login, stale results, cancellation, timeout, process errors and shutdown.

`smoke:ai` now passes **33 assertions**: the actual installed CLI reports the fresh EveryHint profile signed out, despite an existing shared ChatGPT login; the in-app login button is enabled; Claude subscription sign-in and unauthorised account IPC are rejected; pending/signed-in controls render using labelled fixtures. No browser sign-in or remote inference is automatically started by tests. **The real browser OAuth round trip is still unverified** and requires the user to click Sign in with ChatGPT. The shared `codex login status` still reports ChatGPT login after testing. No paid request was made.

Manual account acceptance: click Sign in with ChatGPT, finish in the official browser, verify the app reports signed in, restart and check persistence, switch accounts, sign out, cancel midway, and check OS-keyring/default-browser/port-conflict failures. Verify the normal Codex/IDE session is unchanged. Logging in must not request an answer or enable API billing; Codex answers remain disabled for the existing permission limitation. Claude sign-in remains unavailable without Anthropic approval. The original P4 results below are historical baseline measurements.

## P4 results and limits — 2026-10-27

| Check | Result |
| --- | --- |
| Strict TypeScript / zero-warning ESLint | Passed |
| Unit/regression tests | **219 passed in 20 files**; includes all 157 P1–P3 tests and 62 AI cases |
| Actual Claude SDK/CLI against synthetic loopback HTTP | **6 passed**; streaming, real-process cancellation/temp cleanup, plus rejected Bash, Read, Write and MCP tool calls |
| Production build | Passed; main 99.92 kB, main renderer JS 250.69 kB and CSS 12.10 kB; SDKs remain external |
| Core Electron smoke | **47 assertions passed**, synthetic audio, all three hotkeys registered |
| Assistant Electron smoke | **26 assertions passed**, including actual sender validation, reviewed consent, code escaping/copy and compact controls |
| Speech Electron smoke | **11 assertions passed**, real tiny.en through both synthetic P2 sources |
| Standalone real tiny.en fixture inference | Passed twice through one loaded helper; expected JFK phrase checked |
| Codex local authentication | Bundled official CLI **0.164.0** and the actual Electron adapter report **ChatGPT login** |
| Codex live answer | **Not performed; inference blocked** because SDK 0.164.0 cannot establish a deny-all tool boundary |
| Claude live authentication/answer | **Not performed**; no API key configured and user explicitly declined paid tests |
| Hardware / 15-minute / live remote performance | **Pending**; no acceptance claimed |

There were **zero live provider inference requests and zero paid requests**. SDK loopback tests execute the installed SDK/CLI with synthetic credentials against `127.0.0.1`; replies are fixtures, not AI answers. The renderer-stream fixture in `smoke:ai` is explicitly test-only and is never enabled in production. No successful live provider integration is claimed.

Run after installing dependencies:

```powershell
npm run check
npm run test:ai-sdk
npm run smoke
npm run smoke:ai
npm run speech:test
npm run smoke:speech
```

The first command builds the app; build before Electron smoke. SDK loopback tests need the installed platform CLI binaries and no provider account/key. AI smoke strips API credentials from its app environment and starts no media capture. It inspects only official local Codex login status, tests denied requests, and writes fixture text through the explicit copy control. Reports/screenshots remain under ignored `artifacts/`.

### P4 coverage mapping

| Requested checks | Evidence |
| --- | --- |
| 1–7 registry, Codex/Claude auth, unsupported subscription, billing, selection, validation | `ai-providers.test.ts`, `ai-controller.test.ts`, real malformed/untrusted-window IPC in `smoke:ai` |
| 8–12 text, separate transcripts/images, transfer consent, secure IPC | `ai-context.test.ts`, controller snapshot mutation/consent tests, Electron review and sender rejection |
| 13–19 stream/cancel/deadline/auth expiry/rate/network/crash | Controller event/error cases, Claude adapter cleanup tests, actual SDK loopback streaming; real network/account failures remain manual |
| 20–24 follow-up/provider/capture isolation, truncation, temporary cleanup | Controller history/expiry/stale-event tests, context budgets, adapter directory-removal tests; images stay in memory and create no image files |
| 25 forbidden tools | Denying callback tests, init rejection, stopped model tool-use events, **actual SDK** empty tool schema and rejected Bash/Read/Write/MCP calls; no sentinel written |
| 26–27 duplicates and late responses | Reservation before auth await, consumed review UUID, cancel while auth pending, newer-conversation and same-conversation stale-response tests |
| 28 P1–P3 regression | Existing unit suite, 47 core + 11 speech Electron assertions and actual tiny.en jobs rerun |

The SDK test initially exposed bundled skill/plugin loading despite empty settings sources. Bare mode, disabled bundled skills/plugins and disabled slash commands corrected it; runtime init now confirms empty inventories. Electron testing also caught denied browser clipboard permission; copying now uses bounded validated IPC without relaxing renderer permissions. No failing check is suppressed.

### P4 performance observations

One local assistant smoke run: startup through local auth inspection **665 ms**; synthetic text review through UI/main **168 ms**; main-process RSS **125.1 MB** before review and **127.6 MB** after. These are single samples, not percentiles or total application memory. No remote inference timing is available. Each actual response exposes time to first text and total time when an authorised live request is eventually performed.

The unchanged tiny.en helper loaded in **138 ms** in the standalone run; its two real fixture jobs took **603 ms / 520 ms**, using about **172.6 MB** working set and **384–397%** of one logical CPU (four inference threads). The Electron speech pipeline loaded in **106 ms**, averaged **530 ms** across **11** jobs, had **zero queued/dropped jobs and gaps** at the snapshot, and used **173.9 MB** / **384%** helper CPU. These are synthetic known-speech workloads. Real provider streaming concurrent with a 15-minute hardware conversation remains unmeasured.

Reproducible local reports: `artifacts/ai-smoke.json`, `artifacts/inference.json`, `artifacts/speech-smoke.json`; UI images: `artifacts/everyhint-ai.png`, `artifacts/everyhint-overlay.png`, `artifacts/everyhint-transcription.png`. No model, audio, credential or conversation is committed.

### P4 Windows manual acceptance — all open

1. Launch on the target Windows device; check overlay, tray and hotkeys.
2. Confirm the displayed Codex authentication method matches official `codex login status`.
3. Confirm current Codex inference remains blocked with a visible reason and no API fallback; real text acceptance requires a future supported tool boundary.
4. Once a safe Codex adapter is available, verify genuine streaming and timing; do not substitute fixtures.
5. Verify a genuine follow-up retains only the reviewed bounded context.
6. Authorise an external-window screenshot; inspect the exact frozen image before sending to a permitted provider.
7. Select recent real microphone transcripts independently.
8. Select recent real Windows system-audio transcripts independently.
9. Inspect text/image/limits, edit the draft and confirm review/transfer acknowledgement reset.
10. Cancel a slow real request and ensure execution stops and no late output appears.
11. Verify Claude reports disabled, missing key, key detected or request failure accurately; never uses subscription login.
12. **Only after a later explicit API-billing authorisation**, configure a key locally and verify a real Claude answer; currently deferred by the user.
13. Switch providers and confirm draft/context reset; no remote request starts.
14. Confirm responses and history cannot cross provider or capture-session boundaries.
15. Clear conversation, expire idle history and restart; verify local data/opt-in do not restore. Clear is not remote deletion.
16. Exercise real authentication expiry, quota/rate-limit, disconnect and provider process failure; no fallback or app retry.
17. Inspect provider usage/billing; confirm only explicit authorised Asks incur usage. Estimated SDK budget is not a hard bill cap.
18. Verify pause/resume/stop during composing, reviewing and streaming; full-screen frozen review is an explicit pause exception to live-frame clearing; Stop discards it.
19. Verify Whisper on real microphone/loopback continues correctly, including clear/mute/device changes.
20. Measure overlay responsiveness, combined CPU/RSS and cleanup during a 15-minute authorised conversation plus real streaming.

P1/P2 physical acceptance, real calls, base.en, ARM64/older CPUs and P3 long-run checks below remain open. P5 has not started.

## Historical P3 verification (retained)

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
6. Capture a display and verify frame counts; whole-screen preview stays hidden to prevent recursion. **Pause and Stop must clear live frames**. P4's explicitly frozen review image may remain while paused for inspection; Stop must discard that review too.
7. Pause for at least two capture intervals: count stops increasing and no screenshot reappears. Resume only the previously authorised session.
8. Stop from UI, tray and global shortcut, including while hidden; source/consent/frame cleared and Resume refused.
9. Close overlay to tray, reopen, then Quit/relaunch: capture never restores automatically.
10. Close/minimise a selected window or disconnect the selected display; errors stop capture without choosing a replacement source.
11. Check interval changes apply on the next activation and compact/expanded capture and assistant controls remain accessible.
12. Confirm tray source states, conflict warnings for occupied shortcuts, and P4 provider capability/billing restrictions.
13. Lock/suspend during screen capture: no automatic resume; UI errors/crashes must also release capture.
14. Inspect preferences and storage: only version/settings/bounds; no raw screen/audio files, credentials, device choices or consent.

Native screen thumbnail requests already in flight cannot be cancelled mid-call; their results must be discarded after pause/stop. Real hardware, call compatibility, installer/signing, long-run performance and physical shortcut interaction are not certified by the automated results above.
