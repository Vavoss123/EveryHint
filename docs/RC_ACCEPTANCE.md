# Windows release-candidate verification — 2026-10-29

**NO-GO for 0.5.1 candidate promotion or distribution.** Automated checks pass within the scope below, but physical media, receiving-device privacy, clean installation, genuine packaged account/provider workflows and distribution trust remain unaccepted. This is verification of **0.5.0 at runtime baseline `ead3ec9`**, not evidence that a 0.5.1 release exists. No reproducible product defect was established, so no product code/version change or replacement installer is justified by this run. Verification scripts and evidence are the only changes.

This assessment supersedes the earlier P11 release-status summary for current verification. It retains all P1–P10 limitations. Enterprise is permanently removed; mobile remains unstarted. Nothing was published. Update policy remains disabled with no feed, publisher or key, as previously requested. Existing genuine AI grants are consumed; this run made **zero genuine AI requests**.

Evidence: [structured results](evidence/rc-verification.json), [manual observation sheet](evidence/rc-manual-observations.csv), [exact procedures](RC_MANUAL_TESTS.md). Local detailed samples are in ignored `artifacts/rc/packaged.json`; original package identity remains in [P11 receipt](evidence/p11-release.json).

## Status rules

PASS requires an actual observed result for the stated scope. PENDING means not performed; BLOCKED identifies a missing environment, approval or trust prerequisite. FAIL means a reproducible unresolved failure. Source review, fixture results and historical provider successes cannot satisfy a physical/receiver/genuine-provider row. A changed artifact must be re-identified and retested. Blank outcome cells mean NOT RUN, never omission or successful privacy.

## Automated acceptance

| ID | Scope actually executed | Result | Evidence / limitation |
| --- | --- | --- | --- |
| A01 | Theme/spec consistency, TypeScript, zero-warning lint, production build | PASS | `npm run check`; source runtime remains unchanged from `ead3ec9`. |
| A02 | Unit/regression suite | PASS | **706 tests / 57 files**; no prior P1–P10 tests removed. |
| A03 | Installed Claude SDK loopback and ChatGPT plan HTTP/JWT/SSE/native-vault fixtures | PASS | **6 + 5 tests**; local servers/fixture replies, not genuine OAuth or AI. |
| A04 | Native encrypted meeting storage | PASS | **12 assertions**, 500 segments, persistence/reopen/deletion; 25 additional save/load/delete cycles and 5 worker restarts. |
| A05 | Existing eight Electron suites | PASS | Core 47, AI 44, speech 11, UI 44, intelligence 28, meetings 42, personal 34, context 36 = **286 assertions**. |
| A06 | P11 Windows and fused packaged startup smoke | PASS | **20 + 12 assertions**; configuration/restarts/security bridge/disabled update refusal. |
| A07 | Extended final packaged application | PASS | **54 assertions**, bringing executed Electron assertions to **372**. Uses real final binary, bundled helper, SQLite and OS keyring with isolated synthetic data. |
| A08 | Actual native window affinity and keyboard checkbox | PASS | Own visible `Chrome_WidgetWin_1`: `GetWindowDisplayAffinity` reads **0x11**; Space toggles **0 → 0x11**. This is configuration, not receiver verification. |
| A09 | Packaged microphone/system-audio pipelines and local Whisper | PASS — fixture scope | Looping owned WebAudio inputs through real bundled Whisper, both final sources, bounded queue, no desktop capture or provider permission. Physical devices remain W03–W05. Development-helper sentinel cannot replace the bundled helper. |
| A10 | Packaged encryption, scope/account separation, restart | PASS — fixture scope | Synthetic identity-only registrations with **no plan permission**; old scope rejected, B cannot read A, A reopens its records; title marker absent from SQLite; saved final speech survives full restart. Not real browser sign-in or token revocation. |
| A11 | Sign-out/inference/Live guards | PASS — limited scope | Unconnected sign-out is idempotent; model discovery/forged Ask rejected without plan permission; no responses or restored Live grant. Authorised Live scheduling/cap/cancellation has unit/transport-fixture coverage. Real connected sign-out, switching and Live remain U01/U02. |
| A12 | Graceful Quit, including active Whisper and saved capture | PASS | Three exits with code 0; all owned processes/descendants gone. Active Quit flushes final text and does not leave a stuck active meeting; two restarts restore no capture/Live permission. |
| A13 | Accessibility automation | PASS — limited scope | Basic rendered Settings-label audit finds zero unnamed controls; keyboard privacy toggle; reduced-motion styles disable transitions/animation; forced-colors media emulation. Existing narrow 125% Live geometry passes. This is not Narrator, actual OS high contrast or native DPI acceptance. |
| A14 | Final archive/helper/fuse/developer-path and installer payload audit | PASS | Same 0.5.0 installer SHA-256 as P11. Read-only extraction matches the tested exe, ASAR, Whisper and both native `.node` modules (5 files); installer never executed. Helper integrity/exclusions/fuses pass. RunAsNode remains enabled for the documented Claude path. |
| A15 | Update trust and dependency checks | PASS — disabled/fixture scope | Unit signature/checksum/cancel guards; actual signed Windows system binary accepted, wrong publisher/unsigned installer rejected; **0 known npm advisories**. No signed EveryHint feed/install performed. |
| A16 | Local knowledge/workspace load and brief dry-run | PASS | Actual encrypted workers; bounded excerpts; no-network brief dry-run; see structured timing receipt. Genuine Google and AI are not inferred. |

The earlier 30-minute screen/transcription/combined/mock Live runs are **historical P11 evidence**, not freshly repeated RC hardware tests. Runtime code is unchanged; the current campaign adds deeper packaged checks. Real-device endurance still requires W05. No automated failure is knowingly left unresolved. Harness corrections described below are not product fixes.

## Physical Windows / human acceptance

Every row is a release gate; repeat device/OS-specific rows on each claimed supported configuration. The available Windows 11 host is not a clean install or a certified physical-device test environment.

| ID | Required verification | Status | Prerequisite / evidence still needed |
| --- | --- | --- | --- |
| W01 | Windows 10 clean install, standard user, repair, true upgrade, uninstall/reinstall | PENDING | Disposable approved Windows 10 machine/VM, prior and distinct candidate installers; procedure I. No Windows 10 run occurred. |
| W02 | Windows 11 clean install/upgrade/uninstall and data preservation | PENDING | Disposable approved Windows 11 machine/VM; existing host/unpacked launch does not qualify. |
| W03 | Physical microphone switching, mute, disconnect/reconnect, denied/revoked permission | PENDING | Named test input/device permission and local-only test speech; no room audio recorded in this run. |
| W04 | Real Windows system playback/loopback, output switching and source combinations | PENDING | Approved playback-only test session and harmless local sound; system audio can include unrelated notifications. |
| W05 | Matched real-device performance/endurance | PENDING | Approved device/OS runs for idle, screen, mic, loopback, Whisper, Auto-Hint, combined capture and long sessions; no real inference without a separate grant. |
| W06 | Tray, physical hotkeys/conflicts, hide/show and multiple instances | PENDING | Operator interaction on supported OS; registration/DOM tests do not establish shell behavior. |
| W07 | Actual Windows lock/sleep/resume and permission lifecycle | PENDING | Dedicated session; confirm capture/automatic sharing stay off and stores lock. No user desktop was locked or suspended. |
| W08 | Multiple monitors, unplug/reconnect and native 100/125/150/175/200% DPI | PENDING | Real monitor/DPI combinations; browser zoom is a separate test. |
| W09 | Narrator, complete keyboard traversal, OS high contrast, focus/contrast/readability | PENDING | Human accessibility observations across compact/expanded/dashboard and P8–P10 pages. |
| W10 | Unexpected shutdown/recovery and key-loss handling | PENDING | Disposable synthetic profile/VM checkpoint; actual power-loss/locked-key environment not exercised. Preserve encrypted records on failure. |
| W11 | Real browser OAuth callbacks, cancel/deny/expiry, connected account switching and sign-out | PENDING | Operator-selected test accounts and browser interaction, fresh consent for account changes; no inference needed for authentication-only acceptance. |
| W12 | Real-call/source/model/output quality and retained P1–P10 acceptance | PENDING | The outstanding scenarios in TESTING.md remain open; historical genuine calls do not qualify this package/account/source combination. |

## External receiving-device acceptance

All **16 rows / 32 OS-specific cells** below remain PENDING by the user's existing choice. Each row needs both protection-off positive control and protection-on observation, startup/toggle/resize/stop transitions, receiver OS/client/version, source monitor/DPI and exact artifact identity. Use the CSV to record **visible / omitted / black / partial / not-selectable / inconclusive**; no outcome is currently recorded.

| Case suffix | Scope | Discord Win10 / Win11 | Teams Win10 / Win11 | Zoom Win10 / Win11 | Recorder Win10 / Win11 |
| --- | --- | --- | --- | --- | --- |
| S1 | Entire monitor 1 | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING |
| S2 | Monitor 2, move overlay between monitors | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING |
| W1 | Explicit EveryHint application window | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING |
| W2 | A different application window, EveryHint overlapping | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING | PENDING / PENDING |

The recorder must support the requested scope. A rectangular recording is a region test, not application-window or entire-monitor evidence unless it actually spans that monitor. Unsupported/unavailable recorder scopes remain unverified and need an approved capable recorder; do not mark them passed. Second-monitor cases require a second monitor. Sender previews/CDP screenshots are not receiving-device evidence. **No Discord/Teams/Zoom/recorder configuration is certified compatible or undetectable.**

## Blocked approvals / release trust

| ID | Blocker | Current status / closure evidence |
| --- | --- | --- |
| U01 | Genuine packaged AI and Live | BLOCKED on fresh explicit per-test authorisation/account/model/source/request budget. Prior grants consumed; no new genuine request made. |
| U02 | Genuine account revocation/switching | BLOCKED on operator-selected test accounts and approved browser/account changes. Synthetic vault fixtures do not verify remote revocation or real consent. |
| U03 | Clean Windows execution / security prompts | BLOCKED until approved disposable environments and executable approval are available. Do not disable Defender/SmartScreen/UAC or security policy to obtain a pass. |
| U04 | Public distribution trust | BLOCKED: approved signing identity/process, signed app/helper/installer, publisher/distribution eligibility and dependency/license review. Current artifacts are NotSigned. |
| U05 | Update activation | BLOCKED by intentional disabled policy and absent real signing/HTTPS hosting/pinned metadata key; genuine signed-feed/download/install/recovery/rollback acceptance missing. Keep disabled; no placeholder URL. |
| U06 | Genuine Google / P10 external services | BLOCKED by existing pending decision, configured Desktop client/APIs/test account/scopes/approval. No Google data was accessed. |
| U07 | Independent security/support readiness | BLOCKED pending review of the trust/threat model, supported-platform scope, release ownership/privacy/support documentation and any provider approval requirements. |

No artifact promotion is permitted until applicable gates have observed evidence and an owner accepts the remaining scope explicitly. If any scope is removed from a release claim, document the exclusion rather than changing its outcome to PASS.

## Measurements and findings

The committed receipt contains actual Windows process working sets/CPU deltas and IPC timings for the packaged app using looping synthetic media on the available Windows 11 environment. It is **not real microphone/loopback performance acceptance**. CPU uses process CPU-time deltas (100% = one logical CPU), includes Whisper, and is not comparable to P11's Electron-only normalized CPU counter. Collection overhead is recorded separately. Samples are short; no claim of leak freedom, battery endurance or a universal speedup is made. Ready/quit timings are warm local samples, not clean-machine cold startup.

| Current packaged fixture measurement | Observed value |
| --- | --- |
| Environment | Windows 11 Home 26200 x64; Ryzen 7 PRO 8840HS; 16 logical CPUs; 29,706,903,552 bytes RAM; hypervisor-present flag true (not clean-machine/physical-media proof) |
| DOM/bridge ready, including launch/CDP attachment | 664.61 ms |
| Short process sample window | 5 samples across 8.222 seconds; looping synthetic sources |
| Main / native worker maximum working set | 163.29 / 165.33 MiB; not total unique application RAM |
| Owned-process CPU mean | 101.60% where 100% = one logical CPU, Whisper included; no matched physical regression conclusion |
| Maximum sampled queue / IPC round trip | 0 / 6.73 ms; unsampled peaks are not ruled out |
| Collector overhead (separate from IPC) | 630.37 ms mean per Windows process query |
| Three graceful exits | 153.81 / 162.60 / 167.73 ms, code 0 and zero remaining owned processes; second exit occurred with Whisper/capture active |
| Packaged Whisper | 91.78 ms load; 294.55 ms mean job latency at first final-source checkpoint; no drops/gaps at that checkpoint |
| Encrypted knowledge / memory retrieval means | 102.17 / 17.24 ms for generated load; not Google/internet latency |

These samples establish a local fixture baseline only. No functional regression reproduced in the executed suite, and no sustained performance regression can be established or excluded without the matched real-device runs in W05.

No reproducible product defect was established. Early harness assumptions were corrected: persistence needs the existing retention acknowledgement; signed-out registrations intentionally share the local-only history profile, so synthetic identity-only registrations are needed for account-isolation tests; an unshown/message HWND is not the visible application widget; an empty process-query result means no remaining processes. Native affinity is verified only after the packaged window is ready and actually visible. These corrections do not justify a product version bump.

## Reproduction and version decision

Run `npm run check`, `npm run test:ai-sdk`, `npm run test:plan`, `npm run test:meetings`, all eight `smoke*` commands listed in the receipt, `node scripts/smoke-windows.mjs`, `node scripts/smoke-packaged.mjs`, `node scripts/verify-rc-packaged.mjs`, `node scripts/stress-meetings.mjs`, `node --experimental-transform-types scripts/test-inference.mjs --release-runtime`, `node scripts/audit-windows-package.mjs`, `node scripts/verify-rc-installer.mjs`, and `node scripts/test-update-verifier.mjs`. Benchmark and no-network dry-run commands are recorded alongside results. Do not invoke an `--authorised-*` genuine-provider path based on this document.

The extended harness launches the actual GUI to read the correct visible HWND, uses only a fresh `everyhint-rc-*` profile and owned synthetic media, creates only its known fixture credentials, quits through the trusted app IPC and checks process exit. Its cleanup removes only that validated temporary directory and its own known credential identities. It never reads personal EveryHint profiles, shared Codex credentials or prior restricted temporary directories. It is an automation harness, not a human or receiving-device test.

**Version remains 0.5.0.** A 0.5.1 cut is deferred until a verified product change or an explicitly scoped candidate build for remaining acceptance justifies it. The current unsigned baseline installer is retained unchanged; no same-version reinstall is misreported as an upgrade and no unsigned release was published.
