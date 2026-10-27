# EveryHint milestones

## P1 — Desktop Foundation

Implemented in `e2e4ecb`. **Windows manual acceptance remains pending, confirmed by the user during P2.** P1's 62 regression tests pass. The reported paused screenshot was a retained image, not an ongoing scheduler; `ee3fc00` now clears it when pausing. No other blocking implementation defect is known from automated checks. This does not substitute for physical Windows acceptance.

## P2 — Live Audio Capture

**Implementation complete; automated verification passes; hardware/real-call acceptance pending.** P3 is now explicitly authorised and implemented below. P1/P2 hardware acceptance is still open.

| Checkpoint                | Dependencies                                       | Completion criteria                                                                                    | State                                                             |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| P1 pause correction       | Existing session/screen service                    | No retained screenshot on pause or stop; late frames rejected                                          | Complete; P1 regression suite passes                              |
| Independent consent/state | Existing session/IPC                               | All seven combinations; disabled sources stay disabled; exact booleans and participant acknowledgement | Complete; automated                                               |
| Microphone                | Browser media APIs, Windows permissions            | Default/selected device, metadata selection, mute, errors and disconnection handling                   | Implemented; mocked/synthetic verification; hardware pending      |
| System playback           | Electron supported Windows loopback                | Speakers unmuted; managed companion video; no screen-analysis coupling                                 | Implemented; grant/lifecycle tests; real Windows playback pending |
| Capture isolation         | Sandbox, contextBridge, isolated in-memory session | Exact worker/sender permissions, no camera or overlay media grants, duplicate-operation prevention     | Complete; automated                                               |
| Diagnostics               | Web Audio / AudioWorklet                           | Separate source names/status/meters, zero levels on pause/stop, mute/error visibility                  | Complete; real Electron with synthetic media                      |
| Resource lifecycle        | Session/worker orchestration                       | Dispose tracks/nodes/contexts/timers/buffers; pending startup, shutdown, lock/sleep handling           | Complete; automated; OS/driver release acceptance pending         |
| Future PCM contract       | Shared audio types                                 | Source/time/rate/channels/float PCM/stream lifetime, bounded memory; no transcription                  | Complete                                                          |
| Verification and delivery | All checkpoints                                    | Typecheck, lint, all tests, production build, Electron smoke, docs and clean commit                    | Automated complete; manual checks pending                         |

Baseline: **102 unit tests in 11 files**, **47 Electron smoke assertions**, strict TypeScript/lint/build passing. Smoke uses synthetic media and does not verify hardware or native playback. CPU and Windows memory performance are not certified. Documented bounds cover application PCM caches, not total Chromium/OS memory.

Known Windows limits: loopback is a playback mix rather than per-application isolation; DRM/exclusive routing/drivers can restrict it; hardware/app mute states may only appear as silence; device-change notifications are imperfect. Use the [manual checklist](TESTING.md) and [capture boundaries](ARCHITECTURE.md). Consider native WASAPI only if supported Electron loopback fails documented MVP needs after real testing.

## P3 — Local Live Speech Transcription

**Implementation and automated verification complete; real-device/long-run acceptance pending.** The user authorised the tiny.en/fixture download for real local inference. No P4/P5 implementation has started.

| Checkpoint               | Dependencies / completion criteria                                                                                                            | State                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Integration decision     | Official whisper.cpp C API; dedicated CPU helper; preserve P2 capture and all seven source combinations                                       | Complete; [decision](DECISIONS/P3-transcription.md)                           |
| Runtime/model setup      | Pinned helper build, explicit tiny.en/base.en install, exact size/SHA-256 validation, settings/status, no automatic downloads                 | Complete; native build and tiny.en verified; base.en actual inference pending |
| PCM preparation          | Validated source/stream metadata, audio-clock timestamps, mono/FIR 16 kHz conversion, bounded histories and gap handling                      | Complete; deterministic tests and real Electron pipeline                      |
| Speech segmentation      | Energy gate, conservative settings, partial/final jobs, silence/max boundaries and limited overlap                                            | Complete; tests and known speech fixture                                      |
| Inference scheduling     | Single loaded model, fair source queue, bounded backlog and observable drops                                                                  | Complete; lifecycle/fairness/overload tests                                   |
| Live transcript UI       | Source/time/provisional labels, ordering/replacement/deduplication, auto-scroll, compact view, clear/pause/settings                           | Complete; actual inference through both synthetic P2 streams                  |
| Context contract/storage | Typed session/event/model metadata; memory-only rolling text; retention/character limits and expiry                                           | Complete; no AI memory/question detection                                     |
| Privacy/lifecycle        | Explicit enable after authorised audio; no media activation; run/job guards; cancellation on capture pause/stop/clear/shutdown; model release | Complete; unit and Electron checks                                            |
| Performance/acceptance   | Load/inference/CPU/RSS/queue/drop diagnostics, real fixture results, hardware/15-minute checklist                                             | Software measurements recorded; hardware and long-run tests pending           |

Current P3 baseline: **157 unit tests across 17 files**, **47 core + 11 speech Electron smoke assertions**, strict TypeScript/lint/production build, native helper build, and actual tiny.en fixture inference all pass. P2's original 102 tests remain, with additional PCM-gating/timestamp checks. No npm dependency was added.

Remaining acceptance: real microphone and Windows loopback transcription; consented calls; base.en quality/switching; ARM64/older CPU builds; a 15-minute conversation with CPU/RSS/stability measurements. Current energy VAD can react to noise, chunked inference can revise words, overload deliberately drops queued audio, and overlap deduplication is approximate. Keep all P1/P2 physical checks open. See [Testing](TESTING.md).

## Later milestones — deferred

| Milestone                     | Dependencies                                               | Completion criteria                                                                                          |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P4 — AI Provider Integration  | Earlier phases accepted, current official SDK/auth support | Codex/Claude adapters, supported subscription auth, abortable streaming, manual switching and usage controls |
| P5 — Context Intelligence     | Reliable capture/transcription, approved AI providers      | Meaningful screen changes, duplicate suppression, adaptive capture, spoken questions and bounded memory      |
| P6 — Optimisation and Release | Accepted earlier phases, release requirements              | Hardware performance/security review, Windows installer/signing, compatibility matrix and final verification |

## Dependencies

Version is **0.3.0**. P3 adds no npm package. The native helper links official whisper.cpp **v1.9.5**, pinned to `d1be6fde11ac6e0407606b4e42fe72d34add8037`; source/model/runtime files remain outside Git. Existing React/Electron/Vite/TypeScript/Vitest/ESLint/Playwright versions are unchanged. Node 24 LTS and Visual Studio C++/CMake support development. AI SDKs, credentials and external inference services remain absent.
