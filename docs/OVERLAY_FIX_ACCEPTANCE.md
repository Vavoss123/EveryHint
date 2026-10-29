# Overlay and background session fix — 2026-10-29

Implemented FIX.1–FIX.4 from `66215d8`, version **0.5.0**. Release status remains **NO-GO**. No installer, update, release or genuine provider request was made. [Structured verification](evidence/overlay-verification.json) records the checks and limitations. Earlier UX/Listen reports remain historical evidence; this report supersedes their overlay/window descriptions.

## Reproduction and root causes

The supplied attachment contained the written brief, without image files. Before editing, the compiled baseline was launched with an isolated profile and its actual Electron renderer was captured. Expanding Session options reproduced the reported overlapping labels, controls and transcript/meeting forms. [Baseline reproduction](evidence/overlay-fix/before-overlap.png) is an actual screenshot, using labelled renderer state fixtures; it is not the missing user screenshot.

1. **Dashboard components occupied the floating viewport.** Both documents mounted the same large App tree and dashboard stylesheet. Expanding Session options inserted transcription, intelligence and meeting setup above the chat. Flex children shrank while their content overflowed. One React root was present: duplicate React mounting was not the reproduced cause. The correction is a separate component tree and stylesheet, with header / `minmax(0, 1fr)` answer / composer grid rows.
2. **Two ordinary top-level windows belonged to one primary process.** Baseline native inspection found dashboard and overlay ownerless, focusable and without `WS_EX_TOOLWINDOW`; both constructors used `skipTaskbar: false`. The existing single-instance lock held. A second process exited successfully and left the same two window IDs. This reproduction supports two taskbar-eligible windows in one application, rather than a broken process lock. It does not establish what processes were present on the user's original desktop.
3. **Successful Start had no background visibility transition.** Local recognition could start, but both windows stayed visible. Visibility is now changed only after the existing Start, capture and requested sharing work finishes successfully.
4. **Hidden pinning and layout coupling complicated recovery.** The overlay inherited broad presentation controls and could retain topmost state while hidden. Hiding/minimising now clears native topmost state; explicit show reapplies the chosen pin preference.

## FIX.1 — Window and taskbar architecture

One main-owned initialisation promise creates one dashboard, one assistant and one tray. The existing [Electron single-instance lock](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata) remains; a second launch restores the original dashboard, including when initialisation is still in progress. Repeated shortcuts and renderer reloads reuse the windows.

The dashboard remains a normal focusable taskbar/Alt+Tab window, with `setSkipTaskbar(false)` on restore. The assistant uses Windows `type: "toolbar"` and `skipTaskbar: true`, reapplied by `setSkipTaskbar(true)` on show. Native `GetWindowLongPtr` checks confirm `WS_EX_TOOLWINDOW` on the real assistant and ordinary dashboard styles. These are supported [BrowserWindow options](https://www.electronjs.org/docs/latest/api/structures/base-window-options) and [taskbar APIs](https://www.electronjs.org/docs/latest/api/browser-window#winsetskiptaskbarskip-macos-windows).

| State | Dashboard policy | Assistant policy | Recovery |
| --- | --- | --- | --- |
| Dashboard open | One ordinary taskbar entry | No taskbar entry | Dashboard Alt+Tab/minimise/restore |
| Both windows shown | Same dashboard entry | Tool window, excluded from taskbar/Alt+Tab | Focusable assistant input |
| Successful Start / Hide to Tray | Hidden, no active window entry | Hidden, no entry, not topmost | One tray; native shortcuts |
| Show assistant only | Dashboard stays hidden | Same tool window | Hide or toggle shortcut |
| Second launch | Existing dashboard restored | Existing assistant reused | No new pair |

The native policy and window/process counts are verified. **Literal Shell taskbar button/pinned-icon-cache acceptance remains manual:** this remote Windows desktop's taskbar accessibility tree did not expose the application buttons, so a physical taskbar pixel count is not claimed. Stale pinned shortcuts from another installation were not changed.

## FIX.2 — Start and background operation

Start still requires fresh selected-source capture consent and starts the existing local Whisper pipeline. Separate transcript/screen sharing is optional and retains the existing account/model/session checks. Only a successful managed ACTIVE session backgrounds both windows. A failed or incomplete requested sharing grant keeps recovery visible. An explicit show request during Start or an active close dialog takes precedence. If the tray is unavailable, the session stays visible with a warning.

No capture publication, transcript update, automatic hint or completed answer calls Show. Capture continues while hidden. The tray exposes **Open EveryHint**, **Show assistant**, Listening/Paused state, Pause/Resume, **Stop all capture**, revocation and Quit. Stop cancels capture, pending inference and automatic sharing through the existing controller path. Pause, Stop, Cancel and revocation in the assistant bypass pending UI operations.

**Ctrl+Alt+Enter** shows/focuses the existing assistant and requests one answer within the approved session scope. **Ctrl+Alt+Space** toggles that same assistant. Typed help/questions use the same scoped Listen route; Enter sends, Shift+Enter adds a newline. **Ctrl+Alt+A** opens the dashboard's explicit compose/review workflow for extra sources. Answers remain visible until Hide, Escape, toggle or another explicit window action; no timeout, blur or stream completion dismisses them.

## FIX.3 — Independent assistant

`main.tsx` dynamically loads `FloatingAssistant` or `DashboardApp` according to the trusted document. The overlay does not import dashboard CSS or configuration pages. HMR disposal unmounts its one root; extracted state hooks avoid importing the large settings tree.

- Header: EveryHint mark, active mode, Listening/Paused, Hide, overflow, Pause/Resume and immediate Stop during capture.
- Main: latest streamed answer, safe text/code formatting and copy; one answer scroll area. User scroll position is respected while streaming.
- Bottom: labelled Ask EveryHint input and Ask/Cancel, fixed outside answer scrolling.
- Overflow: optional last-request View Context, Copy/Cancel, revoke sharing, pin, dashboard/permission access and content-protection configuration status. Meeting/transcript setup and diagnostics stay on the dashboard.

Dark/light use bundled Poppins/Inter, the EverySession red accent and scoped styles. Default dimensions are **480 × 580 DIP**, resizable from 360 × 320 to 800 × 800, clamped to the monitor work area. Display metrics/add/remove events reclamp without showing hidden windows. Last valid position is preserved; restart uses the compact default size. Persisting outer size across fractional-DPI restarts caused native border-rounding drift during testing, so custom size is deliberately retained only within the running session.

## FIX.4 — Actual renderer and Windows checks

`npm run smoke:overlay` launches actual compiled Electron at forced scale factors **1, 1.25 and 1.5** and verifies `devicePixelRatio`. At both **360 and 480 DIP widths**, it captures idle, listening, streaming and completed states in dark appearance, plus completed light appearance: **30 screenshots**, all inspected visually for clipping/overlap using six contact sheets. Renderer state fixtures are labelled and do not represent genuine AI generation. Rectangle/scroll assertions supplement the image inspection.

Selected unmodified actual screenshots are committed below; all 30 originals and contact sheets are produced under ignored `artifacts/overlay-fix/after` when the command runs.

| State | Actual Electron screenshot |
| --- | --- |
| Baseline overlap | [Before](evidence/overlay-fix/before-overlap.png) |
| Idle, normal, 150% | [Idle](evidence/overlay-fix/idle.png) |
| Listening, normal, 150% | [Listening](evidence/overlay-fix/listening.png) |
| Streaming, normal, 150% | [Streaming](evidence/overlay-fix/streaming.png) |
| Completed, normal, 150% | [Completed](evidence/overlay-fix/completed.png) |
| Completed, narrow, light, 150% | [Narrow light](evidence/overlay-fix/narrow-light.png) |
| Completed, narrow, 100% | [Narrow 100%](evidence/overlay-fix/narrow-100.png) |
| Completed, narrow, 125% | [Narrow 125%](evidence/overlay-fix/narrow-125.png) |

| Verification | Result |
| --- | --- |
| Theme/spec generation, TypeScript, zero-warning lint, production build | Passed |
| Unit/regression | 771 tests / 61 files; all 765 baseline cases retained |
| Plan + SDK fixtures | 5 + 6 tests |
| Compiled encrypted storage/native key | 12 assertions |
| Retained 11 Electron suites | 399 assertions, including 44 Listen cases |
| New native overlay/visual suite | 219 assertions, 30 actual screenshots |
| Actual Vite React/CSS HMR | 5 assertions, original source restored |

Electron totals are **618 assertions across 12 suites**, plus **5 HMR assertions**. The retained breakdown is core 47, AI 44, speech 12, UI 47, intelligence 28, meetings 42, personal 34, context 36, Windows privacy 20, UX 45, Listen 44. Source tests add four geometry and two settings cases. No baseline case was removed. Existing selectors changed to the new labelled controls; the context restart check now polls awaited IPC because the installed Playwright's async `waitForFunction` predicate returned before its false result could be polled.

Native verification includes one pair/single-instance refusal, minimise/restore, real tool-window styles, taskbar API calls, repeat global toggles, manual-review routing, hidden pinning, simulated display metrics, restart position, no restored capture, keyboard menu navigation, Shift+Enter, fixed input during long-answer keyboard scrolling, renderer reload and actual React/CSS updates. The Listen suite uses real native hotkeys from a separate owned Windows Forms foreground process, native capture of that test window, tiny.en with synthetic microphone/system sources and deterministic signed OAuth/catalog/Responses. It verifies completed Start hides both windows while capture continues, actual tray state, Answer reuses the assistant, Hide preserves capture, permission recovery remains visible, UI Pause/Resume/Cancel and Stop abort pending streaming.

Reproduce after `npm ci` on the supported Windows development host:

```powershell
npm run check
npm run test:plan
npm run test:ai-sdk
npm run test:meetings
npm run smoke
npm run smoke:ai
npm run smoke:speech
npm run smoke:ui
npm run smoke:intelligence
npm run smoke:meetings
npm run smoke:personal
npm run smoke:context
node scripts/smoke-windows.mjs
npm run smoke:ux
npm run smoke:listen
npm run smoke:overlay
npm run smoke:overlay-hmr
```

Run native suites sequentially to avoid global-shortcut conflicts. The HMR suite starts a loopback development server, temporarily changes its own component/CSS files, then restores their original bytes in `finally`.

## Remaining acceptance and release gates

- Physical Windows taskbar/pinned shortcut acceptance, manual Alt+Tab/drag/Narrator and recovery from a tray overflow area; exact Shell icon count was not observable through this remote desktop's accessibility tree.
- Actual OS DPI setting changes, mixed-DPI multi-monitor movement/hotplug and small work areas. Forced Electron app scaling and simulated display events are automated evidence, not physical monitor certification.
- Real microphone, speaker/loopback devices, long calls, OS suspend/lock and receiver-side Discord/Teams/Zoom/Windows recording across screen/window/multi-monitor variants remain pending under the retained [RC checklist](RC_MANUAL_TESTS.md).
- Genuine current Listen/Live account/model/Google acceptance requires fresh scope/budget. This fix made zero genuine AI/Google requests, zero paid requests and no new model download. Historic genuine inference evidence is not repeated or extended.
- Signing, clean-machine installation/upgrade/uninstall, updated packaged build acceptance and distribution remain open. The old private installer was not rebuilt. Version remains 0.5.0 and nothing was published.

Local hiding and taskbar exclusion are visibility behavior. Existing opt-in Windows content protection is preserved and tested for configuration/readback only. **No receiving app is certified and invisibility is not guaranteed.** One accessible tray and immediate Stop remain available during capture. No monitoring/proctoring evasion was added. Capture engines, provider authentication, encrypted schemas/keys/data and existing Live permission boundaries are unchanged.
