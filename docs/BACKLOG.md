# EveryHint milestones

## P1 — Desktop Foundation

Implemented in `e2e4ecb`. **Windows manual acceptance remains pending, confirmed by the user during P2.** P1's 62 regression tests pass. The reported paused screenshot was a retained image, not an ongoing scheduler; `ee3fc00` now clears it when pausing. No other blocking implementation defect is known from automated checks. This does not substitute for physical Windows acceptance.

## P2 — Live Audio Capture

**Implementation complete; automated verification passes; hardware/real-call acceptance pending.** The user explicitly authorised P2 in the current request despite the outstanding P1 manual checklist. P3 is not authorised.

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

## Later milestones — deferred

| Milestone                       | Dependencies                                                       | Completion criteria                                                                                          |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| P3 — Local Speech Transcription | Accepted P2, explicit approval, whisper.cpp runtime/model strategy | Local partial/final transcripts, bounded context, audio conversion/model/lifecycle tests                     |
| P4 — AI Provider Integration    | Earlier phases accepted, current official SDK/auth support         | Codex/Claude adapters, supported subscription auth, abortable streaming, manual switching and usage controls |
| P5 — Context Intelligence       | Reliable capture/transcription, approved AI providers              | Meaningful screen changes, duplicate suppression, adaptive capture, spoken questions and bounded memory      |
| P6 — Optimisation and Release   | Accepted earlier phases, release requirements                      | Hardware performance/security review, Windows installer/signing, compatibility matrix and final verification |

## Dependencies

P2 adds **no npm dependency or native module**. Version is 0.2.0. Existing pinned baseline remains React 19.3.1, Electron 45.0.0, electron-vite 6.0.0, Vite 8.3.5, TypeScript 6.0.3, Vitest 5.0.5, ESLint 10.13.0 and Playwright Core 1.64.1. Node 24 LTS is used for development. Whisper.cpp, AI SDKs, credentials and external services remain absent.
