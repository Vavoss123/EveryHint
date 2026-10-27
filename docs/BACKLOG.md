# EveryHint milestones

## P1 — Desktop Foundation

**State: implementation complete; automated verification passes; manual Windows acceptance pending.** P2 requires P1 acceptance and explicit approval. No later-phase implementation has started.

| Checkpoint          | Dependencies                          | Completion criteria                                                                                                                      | State                                                                               |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Project foundation  | Node 24, npm, Git                     | Strict Electron/React/TypeScript project, reproducible lockfile, architecture/testing/backlog docs                                       | Complete                                                                            |
| Desktop overlay     | Foundation, Electron window/tray APIs | EveryHint branding, frameless drag/resize, dark UI, settings, compact/expanded view, always-on-top and persisted bounds                  | Implemented; automated UI checks pass; physical drag/resize review pending          |
| Session and consent | Shared contracts                      | IDLE on launch; READY/ACTIVE/PAUSED/STOPPED/ERROR; consent enforced; stop revokes consent                                                | Complete; unit and real IPC checks pass                                             |
| Screen snapshots    | Session controller, desktopCapturer   | Explicit source selection, local snapshots, low-frequency interval, diagnostics, native error handling, own-preview recursion prevention | Implemented; native boundary unit tests pass; real-source manual checks pending     |
| Privacy controls    | Session, tray, shortcuts              | Visible actual capture state; pause/stop cleanup while hidden; no uploads/storage/automatic restart                                      | Implemented; lifecycle/IPC/restart tests pass; active tray/focus tests pending      |
| Global hotkeys      | Electron globalShortcut               | Required defaults, conflict reporting, future binding interface, shutdown cleanup                                                        | Logic tests pass; all three registered in Windows smoke; OS keypress checks pending |
| Future interfaces   | Shared contracts                      | Audio/transcription/context/response/AI contracts without operational later-phase features                                               | Complete                                                                            |
| Verification        | All P1 checkpoints                    | Typecheck, lint, tests, production build, Electron smoke; documented manual results; clean Git commit                                    | Automated complete; manual acceptance pending                                       |

Automated baseline: **62 unit tests across six files**, **21 real Electron smoke assertions**, TypeScript/lint/build passing. Smoke performs no native desktop capture. See [Testing](TESTING.md) for exact coverage and manual steps.

P1 capture limitations are explicit in [Architecture](ARCHITECTURE.md): low-resolution native thumbnails, transient enumeration of a source kind, no cancellation of an already issued native snapshot, and whole-screen preview only while paused. Windows may place the tray icon in its overflow area; users should pin it for continuously visible status.

## Subsequent milestones — deferred

| Milestone                       | Dependencies                                                     | Completion criteria                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 — Audio Capture              | P1 accepted and approved; supported Windows loopback APIs        | Independently authorised microphone/system audio, visible indicators, complete track disposal, source and conferencing-app compatibility tests       |
| P3 — Local Speech Transcription | P2 accepted; whisper.cpp runtime/model strategy                  | Local streaming partial/final transcripts, bounded in-memory conversation context, pause/stop cleanup and performance tests                          |
| P4 — AI Provider Integration    | Earlier phases accepted; current official SDK/auth documentation | Codex and Claude adapters, supported subscription auth, provider switching, abortable streaming, usage controls; evaluate optional automatic routing |
| P5 — Context Intelligence       | Reliable capture/transcription and approved AI providers         | Meaningful screen-change detection, duplicate suppression, adaptive capture, spoken question detection and bounded conversation memory               |
| P6 — Optimisation and Release   | P1–P5 accepted; release requirements                             | Performance budget, security review, Windows installer, signing/update decisions, hardware/OS compatibility matrix and final verification            |

## Dependency baseline

Dependencies were resolved from the npm stable tags and pinned in `package.json` / `package-lock.json` for this milestone on 2026-10-27.

- Runtime UI: React / React DOM 19.3.1.
- Desktop/build: Electron 45.0.0, electron-vite 6.0.0, Vite 8.3.5 (locked transitive dependency), React Vite plugin 6.1.2, TypeScript 6.0.3.
- Verification: Vitest 5.0.5, ESLint 10.13.0, typescript-eslint 8.72.1, Playwright Core 1.64.1 (uses installed Electron; no browser download).
- No UI component/animation framework, cloud service SDK, audio library or model files in P1.

Dependency upgrades should repeat the P1 automated checks and the affected manual checks. Installer creation and provider/audio dependencies remain out of scope.
