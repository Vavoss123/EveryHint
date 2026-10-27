# EveryHint testing

## Automated verification

From the project directory with Node 24 LTS installed:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

`npm run check` combines the first four checks after installation. `npm run test:watch` runs unit tests interactively.

Recorded on **2026-10-27**, on the provided Windows environment:

| Check                                                 | Result                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Strict TypeScript                                     | Passed                                                         |
| ESLint, zero warnings                                 | Passed                                                         |
| Vitest                                                | 62 passed, 0 failed, six test files                            |
| Production Electron/Vite build                        | Passed; main, sandboxed preload and renderer emitted to `out/` |
| Real Electron smoke                                   | 21 assertions passed; all three OS shortcuts registered        |
| Native desktop capture / physical keypress acceptance | Not performed; requires the manual checklist below             |

The first verification pass found one lint issue, which was fixed. The first smoke attempt exposed the test's immediate check of a main-process-controlled setting before its asynchronous acknowledgement; the smoke now waits for the acknowledged state. The final checks above pass. No failures are suppressed.

## Test coverage

| Test file                        | Meaningful behaviours                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/session.test.ts`          | IDLE without native access, consent rejection, listed-source enforcement, prepare/start, pause/resume, idempotent stop, consent revocation, failures, source-selection cancellation, immutable snapshots |
| `tests/capture.test.ts`          | Serial native requests, no overlap across resume, cancellation of timers, late frames/errors ignored, terminal failures                                                                                  |
| `tests/electron-capture.test.ts` | Mocked native API boundary, metadata-only selection, selected image conversion, own-window exclusion, missing/blank sources, native error propagation                                                    |
| `tests/hotkeys.test.ts`          | Required callbacks, conflict/exception reporting, future bindings, unregister/disposal                                                                                                                   |
| `tests/settings.test.ts`         | Types/ranges/unknown fields, safe defaults, persistence without session data, corrupt/versioned files, write failure, bounds validation                                                                  |
| `tests/security.test.ts`         | Trusted document matching, confined asset paths, production CSP/network restrictions, development origin, source ID validation                                                                           |

The smoke script launches the actual compiled Electron application, uses a temporary profile, verifies real contextBridge/IPC, sandbox/no-Node settings, consent UI, disabled audio/providers, native always-on-top and compact sizing, hide-to-tray, stop IPC, preference-only storage and restart into IDLE. It never clicks the source enumeration button, captures a screen, acquires audio, or contacts a provider. It saves only the app's own rendered UI to ignored `artifacts/everyhint-overlay.png`.

## Windows manual acceptance checklist

Run `npm run dev`, or `npm run build` followed by `npm start`. Use content you are authorised to capture. Keep EveryHint's tray icon visible by pinning it from the Windows tray overflow area. These checks have **not** been claimed as hands-on testing.

| #   | Action                                                                                | Expected result                                                                                                             | Result  |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Launch EveryHint                                                                      | Correct branding/title, dark overlay, capture off / IDLE, no source or frame                                                | Pending |
| 2   | Drag the title bar, resize from window edges, quit via tray and relaunch              | Controls remain usable; position and size restore on a connected display                                                    | Pending |
| 3   | Enable/disable Always on top in settings and focus another app                        | Overlay follows the option; it remains interactive                                                                          | Pending |
| 4   | Focus another application; press `Ctrl+Alt+Space` twice                               | EveryHint hides then returns; current capture state is unchanged                                                            | Pending |
| 5   | Before authorising, press `Ctrl+Alt+P`; open Prepare                                  | No capture starts; source picker stays disabled until both consent checks are set                                           | Pending |
| 6   | Authorise Screen and participant consent, list sources                                | Real displays/windows appear; EveryHint windows do not; audio sources remain disabled                                       | Pending |
| 7   | Select an external window, Prepare, then Start capture                                | READY takes no frames; ACTIVE produces real frames after the interval; diagnostics previews the chosen window               | Pending |
| 8   | Pause using the UI and `Ctrl+Alt+P`                                                   | State/tray change to PAUSED; frame count stops increasing for at least two intervals; last frame remains inspectable        | Pending |
| 9   | Resume the authorised paused session                                                  | Capture restarts for that source; the old preview is cleared before a new frame                                             | Pending |
| 10  | Stop using UI, tray and `Ctrl+Alt+Shift+X` in separate sessions                       | Immediate STOPPED; frame/source/consent cleared; count stays zero; Resume cannot restart it                                 | Pending |
| 11  | Start a session, hide the overlay, inspect tray then use global Stop                  | Tray remains ACTIVE while hidden; emergency Stop works without showing the overlay and tray becomes STOPPED                 | Pending |
| 12  | Close the overlay with its X, then reopen from tray; separately Quit and relaunch     | X hides; active state is preserved while hidden; Quit stops; relaunch starts IDLE and requires fresh consent                | Pending |
| 13  | Capture a display, inspect diagnostics, then pause                                    | Active display preview is hidden; paused screenshot is real and has no nested preview image; resume hides it again          | Pending |
| 14  | Capture an external window then close/minimise it, or disconnect the selected monitor | Missing/blank source gives a visible error and stops; no new source is silently selected; restoration needs new preparation | Pending |
| 15  | Exercise permission denial where the OS offers it                                     | Readable capture error; no silent retries or automatic capture recovery                                                     | Pending |
| 16  | Change interval; pause/resume or start a new session                                  | New interval applies at activation; source is still the consented source                                                    | Pending |
| 17  | Use compact mode, expand/collapse response panel, open settings                       | Native compact resize works; Pause/Stop remain accessible; response placeholder never imitates an AI answer                 | Pending |
| 18  | Lock Windows or suspend during capture, then unlock/resume Windows                    | Session is STOPPED; capture does not restart automatically                                                                  | Pending |
| 19  | Inspect tray states and provider/audio controls                                       | ACTIVE coral, PAUSED amber, off purple, ERROR orange; tooltip/menu accurate; Codex/Claude marked P4 and audio P2            | Pending |
| 20  | Bind a required shortcut in another app before launching EveryHint                    | Conflict is visible; overlay/tray controls work; no silent claim that the shortcut registered                               | Pending |
| 21  | Quit and inspect `%APPDATA%\EveryHint\settings.json`                                  | Only preferences/bounds/version, no captured pixels, credentials or consent; no screenshot files created                    | Pending |

Native one-shot requests cannot be cancelled mid-call. Pause/Stop must halt future scheduling immediately and discard the result of any already issued request. There are no persistent MediaStream tracks in P1. Source-kind enumeration may create other transient native thumbnails; this documented API boundary does not constitute an exclusive per-window capture transport.

No Windows installer, signed package, multi-monitor/DPI acceptance, conferencing application compatibility or hardware performance certification is claimed. Those checks remain manual or belong to later milestones.
