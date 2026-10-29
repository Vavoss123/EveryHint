# P11 Windows acceptance and release readiness

As of **2026-10-29**, version **0.5.0**, baseline `d9d1ca8`. P11 software and private build verification are delivered; public distribution is blocked by the gates below. Enterprise is permanently removed. Mobile is unstarted and outside this work. Earlier milestone records retain their historical dates and gaps; this document controls current release status.

## Evidence categories

**Automated verified** means the stated controlled scope passed executable checks. **Genuine provider verified** means an explicitly authorised external request completed; it does not imply hardware verification. **Real hardware verified** requires actual devices/media and receiving observations. **Manual UI verified** requires human interaction/accessibility acceptance; agent screenshots and Playwright remain automation. **Pending** means not performed, **Blocked** means an external prerequisite is missing, and **Failed** records an observed unresolved failure. No full feature is marked COMPLETE.

| Area | Category / current result | Evidence and limits |
| --- | --- | --- |
| P1 overlay, capture, tray/hotkey integration | Automated verified | Core Electron 47 assertions; local hotkeys registered. Actual tray interaction/OS conflicts/displays remain pending. |
| P2 independent audio sources | Automated verified; real hardware pending | Synthetic WebAudio source combinations; no physical microphone or Windows playback captured. Device switching, unplug/replug, real loopback and permission controls pending. |
| P3 tiny.en transcription | Automated verified with actual native inference | Cached JFK fixture through actual Whisper, synthetic mic/system pipelines, 30-minute audio and combined sessions; base.en and real-call accuracy pending. |
| P4 ChatGPT plan | Genuine provider verified historically | Existing explicit sign-in/text/image/follow-up evidence in TESTING; no P11 live requests. Grants are consumed. Packaged real browser redirect/account expiry requires a fresh scoped acceptance. |
| P4 Claude | Automated SDK fixtures; subscription blocked | Six SDK tests use loopback stubs; no paid live verification. Anthropic subscription/distribution approval and SDK/native redistribution review unresolved. No paid fallback. |
| P5 layouts/themes/fonts | Automated verified; manual UI pending | UI smoke 44 assertions; compact Live geometry at 125% passes after privacy-label wrapping fix. Human visual, Narrator, high contrast, full keyboard/DPI/monitor matrix remain pending. |
| P6 reviewed screen Assist | Automated and historical genuine provider verified | Existing genuine image/follow-up evidence; response cancellation/source/account/review guards pass. Physical display/source variants and real packaged workflows pending. |
| P7 Auto-Hint/Live | Automated; historical genuine single request | Zero-network local detection; 30-minute real-clock local-provider mock grant, one request and similar-question suppression; expiry leaves no grant. Unit tests exercise cooldown/cap/races. Full real-call Live acceptance pending. |
| P8 encrypted meetings/AI | Automated; historical genuine summary verified | Actual native vault + compiled SQLite, 500-segment storage test; P11 25 create/save/reopen/load/delete cycles and five worker restarts. Physical unexpected power loss and broad summary quality pending. |
| P9 modes/knowledge/templates | Automated; two historical genuine requests verified | Four-format extraction and encrypted storage smoke; ten-document/3.99M-character retrieval load. Broad document accuracy, physical picker/accessibility and semantic citation quality pending. |
| P10 Google | Automated fixtures; genuine verification pending | User explicitly kept real Google verification pending. Needs configured public Desktop OAuth client/APIs/consent/test account. No real Google reads/writes were made. |
| P10 People/memory/briefs | Automated; one historical genuine brief verified | Encrypted 3,000-record fixture benchmark; real P10 brief used synthetic event/person and approved saved-note memory. Real Google/real-call identity and P10 Live source quality pending. |
| P11 window protection | Automated configuration verified | Actual Windows Electron set/readback, restart preservation and packaged readback. Receiver privacy is pending, not certified. |
| P11 endurance/reliability | Automated verified within fixture scope | Three actual 1,800-second runs, lifecycle cycles, three full app restarts; no capture consent/Live grant restored. Does not establish physical suspend/resume or hotplug behavior. |
| P11 installer | Build and final unpacked-binary automation verified | NSIS x64 per-user private unsigned artifact, branded icon, optional unchecked desktop shortcut, Start menu/uninstall configuration. Actual installer/upgrade/uninstall on clean Windows remains pending. |
| P11 updates | Manual flow automated verified; activation blocked | Check/download/progress/cancel/restart with pinned metadata signature, checksum and Windows publisher checks; user chose unconfigured. No real update network/install, URL or certificate invented. See UPDATES.md. |
| Enterprise | Permanently out of scope | Sixteen historical inventory rows retained as OUT OF SCOPE, never future P11 work. |
| Mobile | Pending future scope, unstarted | No mobile implementation or dependencies introduced. |

## Actual screen-sharing behavior

Baseline `d9d1ca8` had **no `setContentProtection()` call**. Filtering EveryHint out of its own source picker, hiding/minimising, always-on-top and opacity did not establish external capture privacy. The new Windows preference defaults **off**, including migrated settings. When enabled it calls Electron before showing the window and reads the configuration back. Failure/unavailability is displayed; configured means only that Windows/Electron accepted the setting. Compact status uses “Privacy: set/off/?” with a full accessible label/limitation tooltip; Settings explains receiving-device verification.

Electron uses Windows `WDA_EXCLUDEFROMCAPTURE`; composition delay and capture-method differences remain. There is no invisibility guarantee. No sharing app, capture pipeline or monitoring software is modified. [Electron documentation](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows), [Microsoft display affinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).

| Receiver / recorder | Entire screen | Individual window | Multiple monitors | Observed visible/omitted/black/partial |
| --- | --- | --- | --- | --- |
| Discord | Pending | Pending | Pending | No receiving-device observation |
| Microsoft Teams | Pending | Pending | Pending | No receiving-device observation |
| Zoom | Pending | Pending | Pending | No receiving-device observation |
| Windows screen recording | Pending | Pending | Pending | No actual recorder observation |

The user requested that receiving-device and physical-hardware checks stay pending. **No sharing capture scenario is certified supported.** Windows configuration was verified on this host only; Windows 10, other builds, remote desktop, non-Windows platforms and alternate recording APIs are unverified. Non-Windows configuration reports unsupported. Record app/version, OS/build, monitors/DPI, protection on/off and receiver result when these checks are performed.

## Performance and endurance

Host: Windows 11 Home x64 build 26200, Electron 45.0.0 / embedded Node 24.22.0, development Node 24.14.1. Three apps ran concurrently with owned synthetic media and cached actual tiny.en Whisper. Screen rate 1 second; JFK audio looped locally; Auto-Hint ran locally without sharing. No provider requests or physical captures. [Committed measurements](evidence/p11-controlled.json); raw ignored `artifacts/p11-endurance-{screen,transcription,combined,live}.json` retain samples.

| 30-minute scenario | Actual seconds | Electron CPU mean | Main RSS first → last / max (MiB) | Native worker max (MiB) | Queue max | IPC max |
| --- | --- | --- | --- | --- | --- | --- |
| Screen | 1800.020 | 0.277% | 147.77 → 124.72 / 148.11 | 0 | 0 | 24.28 ms |
| Transcription | 1800.014 | 0.854% | 155.59 → 192.98 / 197.66 | 167.30 | 1 | 14.28 ms |
| Combined | 1800.021 | 1.341% | 162.13 → 197.88 / 203.09 | 165.73 | 2 | 26.75 ms |

CPU here sums Electron-reported process percentages and **excludes native Whisper**, whose per-core CPU can exceed 100%; separate worker samples are in the committed report. RSS is the main process, not the whole app. IPC is a responsiveness proxy, not visible frame rate. Transcription buffers grew to the retention window then stayed bounded during this sample; memory growth is not proof against leaks. All three completed, stayed ACTIVE at 180 sampled checkpoints each, recorded no page errors, and ended STOPPED with zero queue, no Live grant and zero audio-host windows. The harness's original `crashes:0` field was not an instrumented crash counter; completion/state/error observations are the evidence of no observed failure. Three additional lifecycle cycles passed per app. Cached development helper was used for these runs; the rebuilt release helper separately passed two actual JFK inferences (143.09 ms load, 478.41/427.17 ms inference). Endurance preceded the gated update-flow addition; final unit/Electron/package checks cover the disabled updater, not a genuine signed-update endurance run.

Mock Live ran **1800.016 seconds**, one local stub attempt, no remote requests, queue at most one and no grant at expiry. Similar subsequent questions were suppressed; this is not a 20-attempt stress result. Existing unit tests cover the attempt cap. Three full app restarts preserved the privacy preference while capture/Live stayed off. Twenty-five encrypted meeting cycles with five worker restarts averaged **23.86 ms**, max **47.11 ms**; deleted records were unavailable and the marker was absent from the database bytes.

Short before/after renderer-only stream fixture: 50 Hz **1.598%** → 20 Hz **0.772%** summed Electron CPU (about 52% lower in these samples), same bounded text-growth rate. Production now coalesces streaming publications to at most 20 Hz, with immediate completion/cancellation and final-text retention verified separately in unit tests. Eight one-second samples per state; concurrent host load differed, so this is not a controlled universal speedup. Short-profile negative OS CPU counter readings are clamped to zero for aggregation; raw counters remain in the local reports. Idle **0.072%**, synthetic screen **0.209%** in the current sample. Ready **832 ms** current / **625 ms** baseline; no startup improvement claimed. Existing screenshot deduplication and bounded queues/context were retained; eager dashboard imports were not redesigned without evidence.

Actual encrypted retrieval load: 10 documents / 3.99M characters / 3,630 sections, **126.21 ms mean / 142.52 ms max**, four excerpts capped at 4,800 characters. The 3,000-event/People/memory fixture gave People search **11.62 ms**, memory **20.19 ms**, person-filtered memory **12.91 ms** mean. A 500-segment meeting search took **24.56 ms**, first 100 transcript segments **2.19 ms**. These are local synthetic storage workloads, not Google/network/provider performance. Physical microphone/system-audio and long genuine conversation profiles remain pending; no real AI budget was spent to obtain them.

## Security and reliability findings

- Context isolation/sandbox/no Node renderer access, CSP/custom local protocol, exact trusted sender frame, deny-by-default permissions/navigation/window opening and constrained external URLs remain enforced. Packaged builds now ignore `ELECTRON_RENDERER_URL`.
- Stop explicitly cancels/discards pending AI and revokes Live. Same-session STOPPED/ERROR now cancels stale inference. Existing lock/suspend/reload/renderer-failure paths stop capture, lock sensitive stores and invalidate grants. Workspace disposal joins the bounded quit barrier. Real hardware sleep/lock/recovery still needs acceptance.
- Packaged helper executes from resources and must match the revision/architecture/size/SHA-256 manifest inside ASAR before starting. Models retain pinned size/hash verification and explicit install. Standard `#line` annotations in the fetched build copy remove developer home paths while preserving source labels; upstream revision remains pinned. No binary byte patching.
- Package allows only compiled outputs/production dependencies, excluding unused Codex CLI, developer sources/tests/profiles/models/maps. Source-labelled helper and compiled app outputs pass developer-home path scanning. Native keyring and optional restricted Claude executable are unpacked as needed; dependency redistribution/approval still requires review.
- Fuses disable Node options, Node inspector and extra file protocol privileges; ASAR integrity and ASAR-only loading enabled. `runAsNode` is intentionally retained for the optional Claude compatibility spawn path, so this is not a fully disabled Node-mode build. Unsigned resources do not authenticate themselves against a same-user attacker; code signing is still required for distribution trust.
- OAuth tokens stay in OS credential storage; saved personal/meeting/workspace content remains encrypted/profile scoped. Untrusted captured/imported/provider text cannot mint consent. No arbitrary tools, secret logs or automatic paid fallback were introduced. Dependency audit is recorded in TESTING; zero advisories does not prove absence of vulnerabilities. Build transitive deprecation warnings remain.

## Private installer and updates

Build from Windows x64 with Node 24, Visual Studio C++ Build Tools/CMake and internet for pinned source/build dependencies. The current native target requires an AVX2-capable x64 CPU; ARM64/older CPUs are not release targets of this package.

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-transcriber.ps1 -SpeechHome "$PWD\artifacts\release-speech"
npm run check
npm run dist:win
node scripts/audit-windows-package.mjs
node scripts/smoke-packaged.mjs
```

Artifacts (ignored, never published): `release/EveryHint-0.5.0-x64-private-unsigned-setup.exe`, `.exe.blockmap`, `release/win-unpacked/EveryHint.exe`; prepared helper `artifacts/release-speech/runtime/`; audit `artifacts/p11-package-audit.json`. `dist:win` builds and prepares the trusted manifest/icon before electron-builder; it always passes `--publish never` and disables signing auto-discovery. Merely running `npm run build` does not prepare an installer manifest. Artifact hashes/sizes are local audit evidence and must be regenerated after rebuilding.

NSIS assisted installer is forced to the current user, asInvoker, no elevation helper. Start menu link is configured; desktop shortcut checkbox defaults unchecked; uninstall removes app-owned links/binaries and retains local user data/models/OS credentials. Users can deliberately delete personal stores/disconnect within the app before uninstall. No broad filesystem/credential cleanup script runs. Upgrade preservation is configured but not accepted on a clean machine yet. Models are not bundled; use Settings → local speech → explicitly install tiny.en/base.en, then enable transcription in a consented session. No runtime compilation or model download is automatic in the installed app.

The final fused unpacked binary is launched normally and observed via local Chromium CDP, with no main-process inspector. Its version/protocol, malicious dev-URL rejection, off-by-default capture/Live, native credential bridge, configured protection and manifest-checked helper pass. This is not an installed clean Windows test or genuine browser OAuth/capture test. The isolated smoke terminates only its own test process tree and removes its test profile.

Manual updates use pinned **electron-updater 6.8.11** for NSIS, not Electron's Squirrel.Windows updater. Check/download/progress/cancel/restart, authenticated metadata and installer revalidation are implemented and fixture-tested. The user chose to keep them unconfigured pending real signing/hosting; the disabled bundled policy has no endpoint, publishers or key and creates no updater/network activity. [UPDATES.md](UPDATES.md) describes the explicit Ed25519 metadata schema, strict fail-closed Windows verification, operator signing helper and activation checklist. Real signed feed/download/upgrade/recovery/rollback/data migration remain unperformed. No production identity or host is fabricated.

## Release checklist and outstanding blockers

- [x] Audited baseline privacy; opt-in configuration/failure UI and receiver caveat implemented.
- [x] Controlled 30-minute screen/transcription/combined/mock Live; lifecycle/restart/storage/retrieval gates executed.
- [x] Unit/integration/Electron regressions, actual release-helper inference, package inventory/fuse/path checks; exact counts in TESTING.
- [x] Per-user branded private unsigned NSIS build; visible version and disabled update foundation; no publishing.
- [ ] **Pending by user request:** Discord/Teams/Zoom/Windows recording receivers; screen/window/multiple monitors; physical microphone, system loopback, device switching and real calls.
- [ ] **Pending:** clean Windows 10 and Windows 11 install/upgrade/uninstall, standard non-admin user, shortcut choices, retained encrypted data/credentials/models, CPU support, packaged tray/hotkeys/capture and real browser OAuth redirect. No clean VM was available; do not infer from the unpacked host smoke.
- [ ] **Pending:** sleep/resume, hotplug/OS permission failures, multiple displays, mixed 100–200% DPI, Narrator/high contrast/keyboard, physical unexpected shutdown/key loss/recovery and long genuine conversation quality.
- [ ] **Pending:** retained P1–P10 manual/account/source/model/accuracy checks in TESTING, including genuine Google (explicitly kept pending). Fresh permission is required for any additional real provider request.
- [ ] **Blocked:** production code-signing identity/secure signing process, authenticated release host, signed update/rollback acceptance and public distribution/provider approvals/license review. Unsigned test binaries are not trusted production releases.
- [ ] **Pending:** independent security review and publisher documentation/support/privacy/release ownership. No public compatibility certification or production-ready claim.

No unresolved automated product failure is knowingly accepted. The initial compact layout regression was fixed and rerun; fixture consent/API-name/archive-separator errors were harness corrections, not claims of successful product acceptance. External pending/blocked rows remain release gates.
