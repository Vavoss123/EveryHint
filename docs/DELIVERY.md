# Listen & Ask integration delivery — 2026-10-29

Implemented on `fab74cc`, version **0.5.0**: automatic local transcription on authorised Start; two-minute final conversation context; local P7 latest-question selection; configurable native **Ctrl+Alt+Enter — Answer from conversation**; direct context-aware typed Ask/Enter; optional exact View Context; separate revocable transcript/screen session sharing; accurate explicit model readiness; and a floating composer with visible Ask/Hide/Pause/Stop. The original capture, Whisper, P6 Responses transport, Live permissions and P1–P11 data/features remain.

**765 tests / 60 files**, **11 provider fixture tests**, **12 native encrypted-storage assertions** and **391 Electron assertions / 11 suites** pass; [the receipt](evidence/listen-verification.json) records exact final counts. Windows controlled verification uses actual native key registration/injection/focus, an owned native screen window and native Whisper with synthetic audio. New OAuth/catalog/Responses are deterministic fixtures; genuine AI/physical devices/receiving apps remain unperformed. Updated the product specification and the actual 103-row inventory source and regenerated its matrix. [Consent, context budgets, bindings, changed behavior, verification and retained release gates](LISTEN_ACCEPTANCE.md).

No genuine/paid provider request, version bump, installer replacement or release/publication. Distribution remains NO-GO under the retained RC gates. The personal running instance was preserved; occupied older shortcuts were rebound only in isolated test profiles. Commit title: `feat: add EveryHint context-aware push-to-answer`.

# Desktop UX restructuring delivery — 2026-10-29

Implemented UX.1–UX.4 from `e00813a` without a version increment or publication. The dashboard is an ordinary Windows application; the separate floating assistant is optional and unpinned by default. Added real minimise/restore, labelled tray/quit actions, custom displayed overlay shortcuts and explicit active-close choices. Session controls now follow actual capture state. Home, chat/context review, one-time setup, account readiness, grouped history, two-column modes and six Settings sections replace the verbose daily workflows. Existing encryption, local records, custom modes/documents, source permissions and time-limited AI sharing remain intact.

Verification: **722 tests / 59 files**, **11 provider fixture tests**, **12 native encrypted-storage assertions**, **354 Electron assertions** across ten suites. The real Windows host exercised native styles, global keys, actual close dialogs, minimise/tray restoration/background Stop/restart, cached Whisper with both synthetic sources, encryption/history and P1–P10 flows. Theme/spec/type/lint/production build and diff whitespace checks pass. No physical receiving-device test, genuine new OAuth/Google/AI request, paid request, installer build or distribution was performed.

[Full before/after, changed files, navigation, session/auth/history verification, local screenshot evidence and every remaining manual/release gate](UX_ACCEPTANCE.md); [machine-readable receipt](evidence/ux-verification.json). Version remains **0.5.0** and existing private release artifacts are unchanged. Distribution remains NO-GO until the retained RC gates and new source/package acceptance are completed.

# Historical Windows RC verification delivery — 2026-10-29

**NO-GO for 0.5.1 promotion/distribution.** Verified the unchanged **0.5.0 runtime at `ead3ec9`**; no reproducible product defect or version increment was justified. This delivery adds verification scripts, exact manual procedures, a category-separated acceptance matrix, a 51-row observation CSV and measured receipts. Product features, EverySession styling, secure IPC, local-first processing and update configuration are unchanged. No installer was replaced, published or installed over personal data.

Fresh gates: **706 unit tests / 57 files**, **11 provider fixture tests**, **12 native storage assertions**, **372 Electron assertions** (318 retained + 54 extended packaged). Real bundled Whisper handled synthetic microphone/system sources; native Windows display-affinity off/0x11 and keyboard toggling, actual encrypted profile separation/persistence, active-Quit/child cleanup and two restarts passed. Known signed Windows binary / wrong publisher / unsigned-installer checks passed; npm audit reports zero known advisories. The 25 executed commands and scoped measurements are in [rc-verification.json](evidence/rc-verification.json). Read-only extraction matched 5 critical NSIS payload files to the tested app; installation/registry behavior remains untested.

[Current matrix and every remaining blocker](RC_ACCEPTANCE.md); [exact receiver/install/device/account/accessibility procedures](RC_MANUAL_TESTS.md). All physical/receiver tests remain pending under the existing user choice, genuine requests need fresh grants, and signing/distribution/update hosting approvals are absent. Actual clean Windows 10/11 install/upgrade/uninstall, real packaged OAuth/sign-out/account switching/Live, hardware performance/OS lifecycle/DPI/accessibility and retained P1–P10 quality gates are not marked passed. Synthetic identities do not establish genuine account validity or remote revocation. No new AI request, placeholder update host, mobile or enterprise work occurred.

The retained unsigned installer remains `release/EveryHint-0.5.0-x64-private-unsigned-setup.exe`, **241,628,302 bytes**, SHA-256 **e2c491a2cf8c6b3e00b3d8dd4bf346a8f4fdb90cf774ceba10debf6acea47370**. It matches the original P11 receipt. Build provenance/release gates remain mandatory; no 0.5.1 installer has been cut.

## Historical P11 delivery — Windows privacy and private desktop release preparation

Version **0.5.0**, baseline `d9d1ca8`, 2026-10-29. [Decision/checkpoints](DECISIONS/P11-windows.md), [acceptance matrix, measurements, build instructions and release checklist](P11_ACCEPTANCE.md). Enterprise is permanently removed; mobile is unstarted. Historical sections below describe delivery-time state and retain unperformed manual acceptance.

Delivered opt-in Windows content-protection apply/readback/failure UI and permanent limitation/status; 20 Hz response publication with immediate final/cancel; explicit Stop and same-session failure cancellation; awaited workspace quit cleanup; packaged dev-URL rejection; source-labelled pinned native rebuild and packaged SHA-256 manifest verification; per-user branded NSIS x64 private installer/optional desktop shortcut/retained user data. [Manual new-version updates](UPDATES.md) include check/download/progress/cancel/restart, pinned release-metadata authentication and checksum/publisher rechecks. The user chose to keep updates unconfigured until hosting/signing are ready. No real update or AI request, invented host/certificate, public release or publication occurred.

Verification: **706 unit tests / 57 files**, **6 SDK + 5 plan integration tests**, **12 actual native encrypted-storage assertions**, **286 existing Electron + 20 P11 desktop + 12 final unpacked-binary assertions**. Three concurrent actual 30-minute synthetic capture/real Whisper scenarios and 30-minute stub-provider Live completed; 25 meeting cycles/five worker restarts and bounded encrypted knowledge/context load passed. Theme/spec/type/lint/build/audit/package/fuse/helper gates pass; see TESTING and committed `docs/evidence/p11-controlled.json` for exact scope. Compact Live 125% overflow found during regression was fixed and retested. No hardware, human UI or clean installer acceptance is inferred.

Private outputs: `release/EveryHint-0.5.0-x64-private-unsigned-setup.exe`, `.exe.blockmap`, `release/win-unpacked/EveryHint.exe`; local artifact audit `artifacts/p11-package-audit.json`. Build with `npm ci`, the separate `speech:build` script targeting `artifacts/release-speech`, then `npm run dist:win`; complete commands in acceptance. Authenticode inspection reports **NotSigned** for installer/app/helper. Signing/hosting/update verification, clean Windows 10/11 install/upgrade/uninstall, real packaged OAuth/capture/tray, receiving-device/physical hardware, manual accessibility/DPI/OS lifecycle, provider/redistribution approvals and retained P1–P10 manual checks are outstanding release gates. Genuine Google remains pending by user choice. This is preparation for personal testing and eventual distribution, not a trusted public release.

Final artifact identity and verification scope are committed in [p11-release.json](evidence/p11-release.json); local rebuilds produce new timestamps/hashes and require a fresh audit. The installer and model/runtime build outputs remain ignored, never committed or distributed.

## Historical P10 delivery — Calendar, People and memory

Implemented P10.1–P10.5 on baseline `153846c`. Version remains 0.4.0; no dependency/provider was added. [Design/checkpoint gates](DECISIONS/P10-context.md), [setup/privacy](ARCHITECTURE.md), [full testing/manual checklist](TESTING.md). P11/P12/P13 are not started.

- **Calendar:** official public-client desktop Google OAuth, system browser/PKCE/state/nonce/loopback/JWT, native vault/refresh/revoke, exact read-only scopes, selected finite paginated event window, recurrence/cancellation/time zones/DST/backoff/stale state; functional Calendar views/search/details/preparation status/links and opt-in deduplicated local reminders. Detection suggests preparation/capture choice using calendar timing only.
- **People:** optional manual facts/notes/CRUD/search, separate imported snapshots/provenance/retrieval dates, saved-meeting links/commitments, exact verified email matching; separately consented selected Contacts import and additionally acknowledged manual full-book paged/delta sync with deletion/expiry/reset. External professional research remains deferred.
- **Memory:** source-selected saved P8/P9 literal extraction, authenticated encrypted structured records/evidence/revisions, pending/approved review, edits/manual notes, topic/person/meeting/P9 ranking, exclusions/retention/rebuild/individual/all deletion and source/profile/expiry guards. No temporary session, hidden profile or voice identity is indexed.
- **Preparation/integration:** bounded removable event/people/memory/previous-note/Knowledge review through the existing ChatGPT Responses route and active mode; fresh acknowledgement, cancellation, no tools/paid fallback. Drafts stay ephemeral until explicitly saved under a chosen retention policy; deliberate copy/exclusive-file plaintext export/link opening. P8/recurring associations preserve independent history. Optional Live needs exact-source staging, enablement and separate remote consent within existing session/cooldown/cap guards. Google cache updates preserve unrelated P6 manual reviews.

Verification: **688 unit/regression tests / 53 files**, including all 610 baseline cases; **5 plan + 6 SDK integration tests**; **12 actual compiled storage/native-key assertions**; **286 Electron assertions** (47 core + 44 AI + 11 speech + 44 UI + 28 intelligence + 42 meetings + 34 personal + 36 context). Theme/spec generation checks, strict TypeScript, zero-warning lint and production build pass. Actual cached tiny.en/JFK inference passed (**329.880 / 325.840 ms**) and real Whisper through both synthetic P2 sources passed. No physical microphone/system playback was captured, no runtime/model download or paid request occurred.

**Real Google:** kept pending by explicit user choice; configured Cloud Desktop client and test-account/data permission remain prerequisites. OAuth/browser/HTTP/toast fixtures are labelled; real loopback/JWT/native-vault/worker paths are exercised, but no genuine Google sign-in/event/contact/revocation is claimed. No Google event/contact was created or modified. Production consent/branding/domain/privacy/sensitive-scope/verification/limited-use approval remains a distribution prerequisite, not an acquired approval.

**Genuine P10 AI follow-up:** the user separately authorised exactly one request. **One genuine gpt-6.1-sol Responses brief passed**, **14.124 s** elapsed / **2.684 s** first text, **978 input / 723 output tokens**, **3,101 response characters**. Its exact 3,385-character prompt selected a synthetic event/person and approved source-grounded memory from an encrypted synthetic saved note; the unrelated canary was excluded. Checks confirmed Thursday/Wednesday and a supplied source citation. `store:false`, `stream:true`, no tools, no paid fallback and no retry were enforced. No real Google data, personal documents, capture or unrelated history was read. Isolated encrypted test records were removed and app preferences untouched. The ignored result receipt prevents a rerun; **this grant is consumed**. Genuine Google, automatic Live with P10 context and broad real-call/semantic quality remain unverified.

**Encryption/performance:** actual compiled P8/P9/P10 workers and native credential restart tested; marker scans find no fixture private text/email/notes in SQLite; source deletion, retained manual facts, retention and profile guards pass. One 3,000-record local benchmark produced a **1,392,640-byte** encrypted database. Latest local means: People **9.33 ms**, memory **15.44 ms**; 1,000-event cache plus empty schema **389,120 bytes**. Fixture Calendar refresh **13.59 ms / two requests**, saved-document memory extraction **11.81 ms**. These are local fixtures, not internet/endurance measurements; Calendar incremental latency is N/A because bounded refresh is implemented. Detailed heap/RSS, limits and ignored reports are in TESTING.

All 23 P10 Windows scenarios and earlier P1–P9 hardware/real-call/DPI/accessibility/account/endurance/P7 acceptance remain open. Multilingual Whisper/OCR/semantic retrieval, external research, foreground app detection, unbounded Calendar incremental history, background AI, hosted sharing/mail and enterprise/mobile/packaging remain deferred. Original files, exported/clipboard/provider copies and SSD remnants are not erased by local deletion. Locked-source derivatives cannot be shared and reconcile when source stores become available. Restricted P6 profiles and the blocked historical P8 temporary folder remain untouched.

## P10 changed-file manifest

59 changed/new files:

- [README.md](../README.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/BACKLOG.md](../docs/BACKLOG.md)
- [docs/DECISIONS/P10-context.md](../docs/DECISIONS/P10-context.md)
- [docs/DELIVERY.md](../docs/DELIVERY.md)
- [docs/DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md)
- [docs/FEATURE_MATRIX.md](../docs/FEATURE_MATRIX.md)
- [docs/PRODUCT_SPEC.md](../docs/PRODUCT_SPEC.md)
- [docs/TESTING.md](../docs/TESTING.md)
- [package.json](../package.json)
- [resources/feature-inventory.json](../resources/feature-inventory.json)
- [scripts/benchmark-context.mjs](../scripts/benchmark-context.mjs)
- [scripts/build-feature-matrix.mjs](../scripts/build-feature-matrix.mjs)
- [scripts/context-smoke-key.mjs](../scripts/context-smoke-key.mjs)
- [scripts/context-verification-entry.ts](../scripts/context-verification-entry.ts)
- [scripts/smoke-context.mjs](../scripts/smoke-context.mjs)
- [scripts/smoke-ui.mjs](../scripts/smoke-ui.mjs)
- [scripts/verify-context-ai.mjs](../scripts/verify-context-ai.mjs)
- [src/main/ai/context.ts](../src/main/ai/context.ts)
- [src/main/ai/controller.ts](../src/main/ai/controller.ts)
- [src/main/google/accounts.ts](../src/main/google/accounts.ts)
- [src/main/google/calendar.ts](../src/main/google/calendar.ts)
- [src/main/google/contacts.ts](../src/main/google/contacts.ts)
- [src/main/google/http.ts](../src/main/google/http.ts)
- [src/main/google/oauth.ts](../src/main/google/oauth.ts)
- [src/main/index.ts](../src/main/index.ts)
- [src/main/intelligence/controller.ts](../src/main/intelligence/controller.ts)
- [src/main/intelligence/live.ts](../src/main/intelligence/live.ts)
- [src/main/meetings/ipc.ts](../src/main/meetings/ipc.ts)
- [src/main/personal/database.ts](../src/main/personal/database.ts)
- [src/main/personal/retrieval.ts](../src/main/personal/retrieval.ts)
- [src/main/personal/worker.ts](../src/main/personal/worker.ts)
- [src/main/workspace/controller.ts](../src/main/workspace/controller.ts)
- [src/main/workspace/export.ts](../src/main/workspace/export.ts)
- [src/main/workspace/memory.ts](../src/main/workspace/memory.ts)
- [src/main/workspace/reminders.ts](../src/main/workspace/reminders.ts)
- [src/main/workspace/resume.ts](../src/main/workspace/resume.ts)
- [src/preload/index.ts](../src/preload/index.ts)
- [src/renderer/src/AssistantPanel.tsx](../src/renderer/src/AssistantPanel.tsx)
- [src/renderer/src/BriefPanel.tsx](../src/renderer/src/BriefPanel.tsx)
- [src/renderer/src/LiveConsent.tsx](../src/renderer/src/LiveConsent.tsx)
- [src/renderer/src/MemoryPanel.tsx](../src/renderer/src/MemoryPanel.tsx)
- [src/renderer/src/WorkspacePages.tsx](../src/renderer/src/WorkspacePages.tsx)
- [src/renderer/src/WorkspaceSelection.tsx](../src/renderer/src/WorkspaceSelection.tsx)
- [src/renderer/src/main.tsx](../src/renderer/src/main.tsx)
- [src/shared/ai.ts](../src/shared/ai.ts)
- [src/shared/contracts.ts](../src/shared/contracts.ts)
- [src/shared/intelligence.ts](../src/shared/intelligence.ts)
- [src/shared/navigation.ts](../src/shared/navigation.ts)
- [src/shared/workspace.ts](../src/shared/workspace.ts)
- [tests/calendar.test.ts](../tests/calendar.test.ts)
- [tests/google-oauth.test.ts](../tests/google-oauth.test.ts)
- [tests/meeting-history.test.ts](../tests/meeting-history.test.ts)
- [tests/memory.test.ts](../tests/memory.test.ts)
- [tests/people.test.ts](../tests/people.test.ts)
- [tests/product-spec.test.ts](../tests/product-spec.test.ts)
- [tests/workspace-ai.test.ts](../tests/workspace-ai.test.ts)
- [tests/workspace-export.test.ts](../tests/workspace-export.test.ts)
- [tests/workspace-helpers.ts](../tests/workspace-helpers.ts)

Ignored local evidence includes `artifacts/p10/`, `p10-smoke.json`, `p10-performance.json`, `p10-brief-dry-run.json`, `p10-genuine-brief.json` and the build-only verification adapter. No credentials, model/runtime binaries, database/key files or generated screenshots are committed. Implementation commit: `72ad25e feat: add EveryHint calendar people and memory`, without attribution trailers. A separate documentation follow-up records the subsequently authorised genuine brief.

## Historical P9 delivery

# P9 delivery — custom AI modes and personal knowledge

Implemented P9.1–P9.5 on `bf92396`, preserving P1–P8. Five checkpoint gates are in [P9-personalisation.md](DECISIONS/P9-personalisation.md). No P10/P11/P12 work was started. Version remains 0.4.0.

- **Modes:** General, Coding, Interview, Sales, Meeting and legacy Conversation; provider-independent typed roles/output/context/actions/document/template preferences; functional create/edit/rename/icon/duplicate/delete/reset editor, validation, frozen-review test interface, global/default selection and encrypted profile persistence. One selector works across all shells and all shared AI paths. Legacy preset inputs/settings remain compatible.
- **Knowledge:** functional native-import dashboard for PDF, DOCX, UTF-8 TXT/Markdown; isolated cancellable local parsing with size/page/text/time/V8 limits and partial/no-text/error disclosure; encrypted text/metadata/section storage using P8 cipher/key/profile architecture with independent native key service; inspect/search/rename/enable/mode association/delete; original source files remain untouched.
- **Source-aware requests:** bounded local keyword/BM25-style retrieval, selected-mode/enabled-source filters, exact references/excerpts/pages where extracted, deduplication and request budgets; manual review/acknowledgement and separate explicit Live retrieval/remote/source grant. Untrusted documents/custom instructions/templates cannot change capture, sharing, billing, model/tool restrictions. Excerpts sent remain inspectable; citations are not semantic proof.
- **Languages/templates:** global and mode output-language preferences, honest English-only tiny.en/base.en display and unchanged approved/checksummed downloads; four built-in/custom ordered note-template editors/default/mode associations/preview; P8 strict grounding/draft/Apply/manual-edit protection, saved template snapshots/display/export and bounded previous-summary archives with derivative deletion.

Verification: **610 unit/regression cases / 47 files**, **5 plan + 6 installed-SDK integration cases**, **12 actual meeting SQLite/native-key assertions**, **250 Electron assertions** (47 core + 44 AI + 11 speech + 44 UI + 28 intelligence + 42 meetings + 34 P9). Theme/spec checks, strict TypeScript, zero-warning lint and production build pass. Existing 543 baseline unit cases remain. Actual cached tiny.en/JFK inference and both synthetic audio-source regressions pass; no model download occurred.

**Genuine AI:** user separately authorised exactly two gpt-6.1-sol requests. Custom mode + uploaded test Markdown excerpt returned Thursday/Wednesday with the exact source reference in **3.002 s**, **454 input / 47 output tokens**. Custom-template summary from synthetic microphone → actual tiny.en final text completed in **19.061 s**, **1443 input / 472 output tokens**; exact transcript evidence passed, unknown owner stayed null, Wednesday deadline stayed literal, and the draft saved only after scripted review/Apply. Exactly two observed Responses POSTs, zero rejected scope attempts/retries/paid fallback, no screenshot/system playback/physical microphone/personal document/tool execution. Test records removed, preferences restored, synthetic test app closed. This proves those short scoped paths; genuine automatic Live with knowledge and broad source/language/meeting quality remain unverified.

**Performance:** ten generated 399k-character documents / 3,630 sections: retrieval five-run mean/max **102.918/114.194 ms**, encrypted import mean **12.352 ms/document**, four excerpts / **4,800 text characters** (**5,489 serialized**). Encrypted storage **28,672 → 5,066,752 bytes**. Small real Electron imports PDF/DOCX/TXT/MD about **219.1/63.6/52.3/51.4 ms** in one warm-cache run; local search **5.75 ms**, mode switch **10.85 ms**. Methodology, extraction/memory measurements, corrected common-topic ranking and limits are in [TESTING.md](TESTING.md). These are not endurance or peak-memory guarantees.

**Privacy/encryption:** actual Electron parser/storage/native-key flow, database/journal plaintext-marker checks, wrong key/profile/tamper/corrupt/future-schema refusal, schema/config migrations, delayed-profile reads, cancellation, restart locks, disabled-source exclusion, section/association cleanup and original-source preservation pass. All sensitive metadata/text/config are AES-GCM authenticated ciphertext before SQL. No plaintext library/index/temp copy or automatic cloud upload exists. V8 memory limits are not an absolute native RSS sandbox; same-user compromise, paging/crash dumps, SSD erasure, external exports/backups and provider retention remain separate. Libraries added: pinned PDF.js 6.4.299, fflate 0.8.3, Saxes 6.0.0 and their locked dependencies; no large vector database or paid embeddings.

**Open manual Windows acceptance:** actual file picker/representative documents/partial PDFs/adversarial resource stress; real-call note/citation quality; multilingual response quality; physical microphone/playback/calls; all prior P5 visual/DPI/mixed-monitor/accessibility/keyboard checks, base.en/ARM64/older CPUs, recovery/account lifecycle and combined 15-minute CPU/RSS/endurance. The carried-forward P7 acceptance item is not silently closed. Restricted P6 editor profiles and previously blocked P8 Temp folder remain untouched.

**Deferred:** multilingual Whisper/new model downloads, OCR/scanned-image conversion, legacy DOC/RTF/HTML/spreadsheets, DOCX embedded/header/comment extraction/page layout, semantic/embedding/global-library retrieval, arbitrary rich template schemas beyond seven grounded categories, independent semantic citation verification, cloud sync, hosted links/direct Gmail, P10 calendar/people, P11 enterprise and P12 mobile. Matrix rows **44–55** are updated with evidence and explicit limits: **42 AUTOMATED VERIFIED, 13 MANUAL VERIFIED, 6 IMPLEMENTED, 42 PLANNED, 0 COMPLETE** across all 103 requirements.

Delivery commit subject: `feat: add EveryHint custom AI modes and knowledge`, no AI co-author trailer. Source changes are committed; generated builds, evidence, screenshots, fixtures containing live results and model/runtime caches remain ignored. No push or deployment requested.

## P9 changed-file manifest

66 changed files:

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/DECISIONS/P9-personalisation.md
docs/DELIVERY.md
docs/DESIGN_SYSTEM.md
docs/FEATURE_MATRIX.md
docs/PRODUCT_SPEC.md
docs/TESTING.md
electron.vite.config.ts
package-lock.json
package.json
resources/feature-inventory.json
scripts/benchmark-personal.mjs
scripts/build-feature-matrix.mjs
scripts/personal-smoke-key.mjs
scripts/smoke-ai.mjs
scripts/smoke-personal.mjs
scripts/smoke-ui.mjs
scripts/verify-personal-ai.mjs
src/main/ai/context.ts
src/main/ai/controller.ts
src/main/index.ts
src/main/intelligence/controller.ts
src/main/intelligence/live.ts
src/main/meetings/ai-context.ts
src/main/meetings/ai.ts
src/main/meetings/database.ts
src/main/meetings/ipc.ts
src/main/meetings/sharing.ts
src/main/personal/controller.ts
src/main/personal/database.ts
src/main/personal/extract.ts
src/main/personal/extraction-worker.ts
src/main/personal/import.ts
src/main/personal/retrieval.ts
src/main/personal/store.ts
src/main/personal/worker.ts
src/preload/index.ts
src/renderer/src/AssistantPanel.tsx
src/renderer/src/Dashboard.tsx
src/renderer/src/LiveConsent.tsx
src/renderer/src/MeetingAIReview.tsx
src/renderer/src/MeetingDetail.tsx
src/renderer/src/PersonalPages.tsx
src/renderer/src/TranscriptionPanel.tsx
src/renderer/src/components/Icon.tsx
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/ai.ts
src/shared/contracts.ts
src/shared/intelligence.ts
src/shared/knowledge.ts
src/shared/meeting-ai.ts
src/shared/meetings.ts
src/shared/modes.ts
src/shared/navigation.ts
src/shared/personal.ts
src/shared/templates.ts
tests/fixtures/knowledge.ts
tests/knowledge.test.ts
tests/modes.test.ts
tests/personal-integration.test.ts
tests/personal-storage.test.ts
tests/product-spec.test.ts
tests/templates.test.ts
```

---

## Historical P8 delivery

# P8 delivery — Meeting Notes, History and Intelligence

Implemented on baseline `2047110`, preserving P1–P7 and the EverySession design. Four independently verified checkpoints are recorded in [P8-meetings.md](DECISIONS/P8-meetings.md). Version stays 0.4.0. No npm dependency/model download, paid API fallback, raw-audio storage, tool execution or P9/P10 work was added.

- **Persistence:** Temporary default; explicit per-profile save/retention acknowledgement; optional future-authorised-audio auto-save off by default; final-only deduplicated source/time/session IDs; separate capture runs; opt-in SQLite worker with AES-256-GCM and Windows Credential Manager keys; transactions/migrations/corruption/key-loss preservation and interrupted recovery; clear/delete/all/retention controls.
- **Meeting intelligence:** grounded structured summary/decisions/actions with exact refs/quotes and uncertainty; missing owners/deadlines stay unassigned/unspecified; review/Apply, editable notes/tasks/tags/title, save/revert and selected-section regeneration with manual-edit protection; separately scoped one-attempt expiring End permission, default off.
- **History/search:** real empty/locked/error/dashboard/detail states, lazy pagination, scoped literal search/snippets/tags/dates/status/order, selected-meeting/excerpt AI through the existing plan provider, account/async cancellation guards, fresh-consent-only resume. Search has no plaintext persistent index.
- **Sharing/follow-up:** explicit native-dialog TXT/Markdown/JSON/readable summaries, guarded new files, clipboard selection, editable email with no inferred recipients and separate mailto approval. Native external ports are mocked in tests; no email was sent or actual mail app opened.

Build and verification: strict TypeScript, zero-warning lint, generated theme/spec checks and production build pass; **543 unit tests / 42 files**, **5 plan + 6 installed SDK integration cases**, **12 actual SQLite-worker/native-credential assertions**, **216 Electron assertions** (47 core + 44 AI + 11 speech + 44 UI + 28 intelligence + 42 meetings). Real cached tiny.en/JFK inference passes. Earlier P1–P7 tests remain; no failed security/acceptance coverage was removed.

Genuine summary: the separately authorised replacement completed gpt-6.1-sol inference in **11.028 s, 1,090 input / 795 output tokens**, from three exact offline-TTS → synthetic-mic → real-tiny.en final sentences. It generated one supported release decision and one Wednesday checklist action with unknown owner left null. The draft stayed unsaved until reviewed Apply, then persisted. An initial separately authorised request also produced a validated draft but a completion-ID lookup in the test harness prevented inspection/save/latency verification. **Two total separately authorised requests**, no automatic retry or paid fallback. Both test meetings were deleted; preferences restored; synthetic test apps closed. This verifies the reviewed short synthetic summary path, not physical recording, broad accuracy, genuine automatic End/meeting QA/email generation or general release readiness.

Persistence/encryption: actual SQLite/journal plaintext scans, tamper/wrong-profile/wrong-key/key-loss tests, migration rollback/newer-schema/corruption refusal, abrupt writes/recovery, restart, deletion/retention and real native-key worker tests pass. Sensitive fields are encrypted before SQL. IDs/times/count/status/file size remain visible; this is an OS-user boundary with no protection from same-user malware, guaranteed paging/crash-dump/SSD erasure or recall of exported/provider-retained copies. SQLite remains experimental in the pinned Node 24 runtime.

One 500-final worker run: create **3.901 ms**; 20-final save mean/p95 **5.398/6.292 ms**; load **0.603 ms**; retrieve100 **2.401 ms**; search500 **23.843 ms**; database **40,960 → 352,256 B**; isolated test RSS **64,724,992 B**. App edit/search about **77/88 ms** in one run; genuine summary **11.028 s**. These are observations, not full-app/endurance guarantees. [TESTING.md](TESTING.md) records methodology, all 30 coverage categories and all 18 still-open human Windows checks.

Remaining acceptance: physical mic/Windows playback/both and consented calls/noise/overlap; real-call summary quality; genuine selected-meeting QA/follow-up/automatic End; actual save dialog/mail handler; physical keyboard/Narrator/shortcuts/themes/opacity/mixed DPI/multi-monitor; full-app forced shutdown/device recovery; base.en/ARM64/older CPUs; 15-minute CPU/RSS/stability; distribution/security/release review. All earlier incomplete manual gates remain open.

Deferred/partial: hosted authenticated/revocable/expiring share links need a backend; direct Gmail/OAuth/send; automatic speaker identity; semantic/global-title search; P9 modes/personal knowledge; P10 calendar/people. The regenerated 103-feature matrix records rows 28–43 with evidence and limits: **37 AUTOMATED VERIFIED, 9 MANUAL VERIFIED, 6 IMPLEMENTED, 51 PLANNED, 0 COMPLETE**. EH-039/EH-042 explicitly remain partial.

Automatic approval review rejected deletion of one failed-test Windows Temp folder, `everyhint-p8-storage-kUp6R1`, as “blocked by policy”, without a further reason. It was left untouched, with no alternate deletion attempt. The four restricted P6 editor profiles also remain untouched. Authorised test meeting deletion succeeded and is separate from that filesystem cleanup.

Delivery commit subject: `feat: add EveryHint meeting history and AI notes` (no co-author trailers). Generated builds, synthetic speech, live evidence and screenshots remain ignored.

## P8 changed-file manifest

61 source/build/fixture-test/documentation files changed. Full reviewable manifest:

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/DECISIONS/P8-meetings.md
docs/DELIVERY.md
docs/FEATURE_MATRIX.md
docs/PRODUCT_SPEC.md
docs/TESTING.md
electron.vite.config.ts
package.json
resources/feature-inventory.json
scripts/build-feature-matrix.mjs
scripts/meeting-smoke-fixture.mjs
scripts/smoke-meetings.mjs
scripts/smoke-ui.mjs
scripts/test-meeting-storage-runner.mjs
scripts/test-meeting-storage.mjs
src/main/ai/context.ts
src/main/ai/controller.ts
src/main/index.ts
src/main/meetings/ai-context.ts
src/main/meetings/ai.ts
src/main/meetings/controller.ts
src/main/meetings/crypto.ts
src/main/meetings/database.ts
src/main/meetings/edits.ts
src/main/meetings/ipc.ts
src/main/meetings/keys.ts
src/main/meetings/post-notes.ts
src/main/meetings/preferences.ts
src/main/meetings/sharing.ts
src/main/meetings/store.ts
src/main/meetings/worker.ts
src/main/session.ts
src/preload/index.ts
src/renderer/src/AssistantPanel.tsx
src/renderer/src/MeetingAIReview.tsx
src/renderer/src/MeetingDetail.tsx
src/renderer/src/MeetingHistory.tsx
src/renderer/src/MeetingSessionControls.tsx
src/renderer/src/MeetingSharing.tsx
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/renderer/src/useMeetings.ts
src/shared/ai.ts
src/shared/contracts.ts
src/shared/meeting-ai.ts
src/shared/meeting-bridge.ts
src/shared/meeting-edits.ts
src/shared/meeting-sharing.ts
src/shared/meetings.ts
src/shared/navigation.ts
tests/meeting-ai-helpers.ts
tests/meeting-ai.test.ts
tests/meeting-controller.test.ts
tests/meeting-history.test.ts
tests/meeting-post-notes.test.ts
tests/meeting-sharing.test.ts
tests/meeting-storage.test.ts
tests/meeting-worker-host.test.ts
tests/product-spec.test.ts
```

---

## Historical P7 delivery

# P7 delivery — Automatic Conversation Intelligence

Implemented on `e68bfe7`, preserving the P1–P6 capture/transcription/AI controllers and EverySession red/Poppins/Inter themes/layouts. P7.1 detection/correlation and P7.2 reviewed actions/UI passed their gates before P7.3 scoped Live scheduling. Version remains 0.4.0; no dependency or model download was added. P8 is unstarted.

- **Modes and detection:** Manual unchanged; Auto-Hint analyses selected consented final English transcripts and stable screen differences locally. Typed bounded events correlate time/source/current screen without speaker identity. Question rules suppress incomplete/rhetorical/reported/unrelated/duplicate/echo speech. No OCR or screen-only automatic inference is claimed.
- **Actions and suggestions:** seven fixed handlers reuse the P6 context review; at most three ranked, expiring candidates with Accept, Dismiss and Dismiss Similar. Fact Check remains unverified/context-only; Recap covers selected retained context; Who uses supplied participant information/unknown locally. No P8 notes or P10 research are credited.
- **Live permission:** separate explicit source/account/model/session-bound grant; defaults 30 minutes, at least 30 seconds and 20 attempts. One active request plus at most one fresh pending candidate; failed/uncertain attempts count; pre-existing/low-confidence/stale/unshared/removed questions are ineligible. Permission is rechecked after screenshot acquisition, token renewal and throughout streaming. No retry, automatic Claude or paid fallback. Pause/Stop/expiry/cancel/source/account/model/settings/Clear/lifecycle boundaries revoke; Resume/restart never restore permission. Existing five-minute catalog expiry can pause longer grants early.
- **UI/privacy:** compact/expanded/dashboard controls share actual main state. Root Live countdown/counter/Pause and native tray/title disclose enabled sharing between requests. Readiness is published before speech, so consent does not depend on a question arriving. Manual/Auto-Hint Accept still requires frozen review/acknowledgement. Live uses the same bounded builder, immutable instructions and official Responses shape; no new executor, credentials in React or media persistence.

Verification: **458 unit tests / 35 files**, **5 native-vault/local HTTP plan fixtures**, **6 installed SDK loopback tests**, **174 Electron assertions** (47 core + 44 AI + 11 speech + 44 UI + 28 intelligence), real cached JFK tiny.en inference, theme/spec consistency, strict TypeScript, zero-warning lint and production build pass. Existing coverage remains enabled. The readiness regression and corrected post-consent synthetic audio driver passed with real Whisper and a clearly labelled fixture provider; fixture completion is not a genuine OpenAI result.

**Genuine automatic verification passed:** the separately authorised replacement played the dictionary/list question only after the one-minute, one-attempt UI grant. Synthetic microphone → actual tiny.en Whisper → high-confidence final question → central scheduler → real gpt-6.1-sol completed in **8.995 s**, using **254 input / 221 output tokens**. Exactly one real Responses POST contained microphone text only, no physical microphone/system audio/image/history, raw audio or paid fallback. The attempt cap ended the grant after one completion; no retry occurred. Capture/context was stopped/cleared, preferences restored and the test app closed. This verifies the software/provider path, not physical hardware or broad accuracy. The earlier pre-consent timing/readiness defect and its fix remain documented in [TESTING.md](TESTING.md).

One performance observation: rules averaged 0.0044 ms on authored English fixtures; 50 actual native 1600×900 JPEG sample operations averaged 4.385 ms (p95 5.849 ms); actual dictionary-question Whisper inference was about 351 ms direct / 425 ms mean through synthetic capture, worker about 173 MB. These are isolated observations, not latency/accuracy/whole-app/endurance guarantees. The small classifier comparison did not justify a new model or dependency. Details, methodology, all 34 coverage categories and the 19-item remaining Windows checklist are in [TESTING.md](TESTING.md).

Remaining acceptance: physical microphone/system playback/both, real consented calls with VS Code, human suggestions/Live/cooldown/expiry/permission loss/account switching, physical hotkeys, Narrator/themes/opacity, mixed DPI/multi-monitor, base.en/ARM64/older CPUs and 15-minute CPU/RSS/stability. No synthetic event closes those gates. English heuristics, fixed keyword cues, perceptual-only screen changes, whole-source exclusions, no independent fact retrieval and no person identification are explicit limits. No unresolved implementation defect remains in tested scope; distribution eligibility, Anthropic subscription approval and broader security/release acceptance remain open. The four P6 temporary editor profiles were not modified or deleted.

The 103-feature inventory is regenerated, with partial P7/P8/P10 capabilities distinguished: **26 AUTOMATED VERIFIED, 6 MANUAL VERIFIED, 4 IMPLEMENTED, 67 PLANNED, 0 COMPLETE**. No marketing accuracy or universal privacy claim is inherited. No paid API request is permitted by this delivery. Capture/test context is stopped/cleared, preferences restored and normal startup has no mode/grant restoration. The final normal build was opened without media overrides: Manual, IDLE, no review/history/grant, all five hotkeys registered and no inference requests.

## P7 file manifest

45 source/documentation/test files changed; generated application output, synthetic speech, live evidence and screenshots remain ignored.

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/DECISIONS/P7-intelligence.md
docs/DELIVERY.md
docs/FEATURE_MATRIX.md
docs/PRODUCT_SPEC.md
docs/TESTING.md
package.json
resources/feature-inventory.json
scripts/benchmark-screen.mjs
scripts/build-feature-matrix.mjs
scripts/smoke-ai.mjs
scripts/smoke-intelligence.mjs
src/main/ai/context.ts
src/main/ai/controller.ts
src/main/ai/plan/provider.ts
src/main/index.ts
src/main/intelligence/actions.ts
src/main/intelligence/controller.ts
src/main/intelligence/engine.ts
src/main/intelligence/live.ts
src/main/intelligence/native-screen.ts
src/main/intelligence/question.ts
src/main/intelligence/screen.ts
src/main/session.ts
src/preload/index.ts
src/renderer/src/AssistantPanel.tsx
src/renderer/src/IntelligencePanel.tsx
src/renderer/src/LiveConsent.tsx
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/renderer/src/useIntelligenceSnapshot.ts
src/shared/actions.ts
src/shared/ai.ts
src/shared/contracts.ts
src/shared/intelligence.ts
src/shared/validation.ts
tests/fixtures/intelligence-corpus.ts
tests/intelligence-actions.test.ts
tests/intelligence-benchmark.test.ts
tests/intelligence-live.test.ts
tests/intelligence-local.test.ts
tests/intelligence-plan.test.ts
tests/plan-provider.test.ts
```

Delivery commit: `feat: add EveryHint automatic conversation intelligence`, no AI co-author trailer. Working tree clean after commit. Stop after P7; do not start P8.

---

# P6 delivery — historical record: Screen-Aware AI Assist

Implemented the authorised manual workflow on baseline `f00bf2a`, retaining EverySession tokens, red/Poppins/Inter and all three layouts. P5 human Windows/visual checks remain open. No P7 detection or automatic request was added.

- **Assist:** Get Answer, optional question with actual selected context, General/Code/Conversation presets, source/time-labelled frozen preview, per-item removal and fresh remote-transfer approval. Configurable persisted global Assist opens/focuses the same composer and prepares its selected context for review; Clear cancels/reset local context. Chords are validated against emergency controls and native conflicts are reported.
- **Screen/transcripts:** on-demand capture through the existing serial service with source/session/generation guards; JPEG fitted to 1600×900 with selected 1.5 MB default / 4 MB maximum. Freshness/capability/unavailable/paused/duplicate-image checks fail visibly. Final mic/system text is independently optional, chronological, deduplicated and limited to selected 30/60/180/300-second windows. Raw audio, credentials/settings/diagnostics and unrelated files are excluded.
- **Conversations/responses:** bounded account/provider/session-isolated question/answer history; reviewed follow-up/regeneration; cancel/stale guards; safe streamed Markdown headings/lists/code/language labels/per-code copy/simple tables. HTML, links/images and generated code remain inert. Regenerate does not reattach previous images/transcripts; source-only answers may need a question or selected context. Clear cannot recall transmitted data.
- **Transport:** existing own-registration ChatGPT plan OAuth/model discovery/public Responses endpoint. At most one selected JPEG is `input_image.image_url` alongside `input_text`; storage off, streaming on, tools empty/tool choice none. No server conversation/previous-response state, mandatory OCR, Files API, shared Codex tokens, API-key fallback or paid Claude request. Claude subscription remains unavailable pending approval; API billing opt-in remains default off.

**Genuine live integration passed twice with gpt-6.1-sol**, under the user's explicit two-request authorisation. A real VS Code sample-window screenshot (1440×900 / 52,459 bytes), fresh review and acknowledgement produced a correct `count_colours` explanation and sample result `{'red': 3, 'blue': 2, 'green': 1}`. The text-only follow-up “Why did it use a dictionary?” correctly used the preceding answer and acknowledged it had no screenshot. First request: 1,803 input / 321 output tokens, first text 3.190 s, total 9.346 s. Follow-up: 571 / 195 tokens, first text 3.142 s, total 7.583 s. Both required terminal `response.completed`; no inference retry, audio, API fallback or paid Claude call occurred. Capture was stopped afterwards and the temporary screenshot deleted. Details: [TESTING.md](TESTING.md); ignored text evidence: artifacts/p6-live-result.json. These observations do not establish all-model/account/platform performance or release eligibility.

Verification: **367 unit tests / 30 files**, **5 real local HTTP/native-vault plan fixtures**, **6 installed SDK loopback tests**, **146 Electron assertions (47 core + 44 AI + 11 speech + 44 UI)**, real cached tiny.en JFK inference, theme/spec consistency, strict TypeScript, zero-warning lint and production build pass. No npm dependency was added; version remains 0.4.0. Stricter screen-state validation required updating old synthetic screenshot fixtures to represent ACTIVE authorised capture.

Files: extended `shared/{ai,contracts,validation}.ts`, added `shared/shortcuts.ts`; extended main capture/native capture/session/hotkeys/index and existing `ai/{context,controller}` with narrow preload additions. Updated renderer AssistantPanel/main/styles; added ResponseText and ShortcutSettings. Added three Assist test files and the harmless Python example; extended lifecycle/context/native/hotkey/migration/local-HTTP fixtures and AI/UI smoke. Updated product/architecture/backlog/testing/delivery/README, JSON inventory and generated matrix/metadata. Full modified file list is recorded by this commit.

Remaining: P5 human visual/Windows acceptance, physical shortcuts, real audio/call-backed assistance, broader model/account lifecycle, DPI/accessibility/long-run/device/ARM64 checks and distribution eligibility. Markdown is a practical subset without syntax highlighting. Native enumeration may transiently thumbnail other sources, retaining only the chosen frame. Submitted image hashes suppress unchanged uploads within a conversation; model refresh resets context. No permanent conversation storage is added. The final build is open with capture IDLE, its own plan connection restored and no startup model discovery/inference; all five chords registered, with physical acceptance still pending.

Delivery commit: `feat: add EveryHint screen-aware AI Assist`, with no AI co-author trailer. Stop after P6; P7 remains unstarted. Inventory records preserve partial/manual limits and no COMPLETE claims. Automatic approval review blocked deletion of four unused editor setup profiles in Windows Temp; they remain outside the repository. The live screenshot and ordinary automated test profiles were cleaned successfully.

---

# P5 delivery -- historical record: authentic design system and product roadmap

Implemented the authorised **feature audit and UI foundation only**. No calendar, saved meeting history, enterprise/mobile backend, automatic detection, autonomous assistance or additional paid/provider request was added. The previous ChatGPT inference result remains verified at baseline; Claude subscription approval and paid live verification remain unresolved.

## EverySession provenance

The real project was found at C:\Users\Victor\OneDrive\Documents\mmaapp\MMAsyncApp, identified as EverySession by app.json. Inspected actual theme/typography, club theme, Button/Card/form/header/navigation/login source, font loading, design audit and icon assets. Source HEAD: 1256e54dffebfd7b839d8b4b849dd62d22f372e5. All 15 inspected source/assets have matching before/after SHA-256 and the source repository stays clean. No EverySession code or asset was modified. PeerDesk was a secondary reference only.

Confirmed palette: **#E01A34** primary/danger, **#5C0F26** maroon, **#FFFFFF** background, **#F6F5F5** surface, **#EAE8E8** decorative border, **#181818** text, **#7A7878** original muted and **#1E8E5A** source success. Confirmed **Poppins headings / Inter body**, 14px cards, 10px inputs, pill buttons and 4/8/12/16/20/28 spacing. Secondary/status ink, control boundaries, warning/focus/hover and Dark/System are documented accessible desktop extensions; no exact dark-theme or pixel parity claim is made. Six authentic unmodified local font faces and their OFL notices ship offline. EveryHint retains its own mark; no Cluely artwork/design was copied. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## UI and behaviour

Central JSON tokens and generated CSS replace the purple placeholder palette. Native tray/window colours share the same source. The new dashboard navigation/Home/planned pages, reusable icons/disclosure panels, local appearance controls, three-layout sizing and root remote-request status build around the working assistant, account, transcript and capture components. Settings/theme/layout changes preserve draft/review state and never acquire media or submit AI. Active request cancellation and emergency capture controls remain outside hidden/collapsed content. Quick Ask/focused Ctrl+Enter only open the composer. Legacy preferences migrate safely; native opacity is bounded to 80-100%.

Home reports actual current session/provider state. Assistant and Settings work. Meetings, Knowledge, Calendar, People and Modes show planned scope with no simulated content or connections. General is a truthful fixed-instruction indicator; custom modes are not enabled. Existing microphone/system/screen controls, local Whisper, OAuth/OS credentials, provider/model selection, review/acknowledgement/Ask, streaming, safe code/copy, cancel/clear and IPC isolation are retained. No provider/authentication/transcription core was rewritten.

## Requirements and missing features

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) defines scope, consent/execution contracts and Manual/Auto-Hint/Live Assist distinctions. [FEATURE_MATRIX.md](FEATURE_MATRIX.md) covers **all 103 unique requirements** and **nine named contextual-action mappings**, with all requested evidence/acceptance fields and separate CURRENT/HISTORICAL/ENTERPRISE-ONLY/UNVERIFIED reference categories. Its validated JSON source generates the Markdown.

Current counts: **18 AUTOMATED VERIFIED, 2 MANUAL VERIFIED, 7 IMPLEMENTED, 76 PLANNED, 0 COMPLETE**. Verification applies only to each row's stated scope. Claude subscription authentication is separately BLOCKED under the account feature, not double-counted. Existing capabilities include overlay/window/tray/hotkeys, consented capture, source/mute/diagnostics, English local transcripts, bounded reviewed AI/context/history, ChatGPT plan login and one genuine text reply, and the new theme/navigation foundation. Partial image transport/code formatting/general mode/multi-monitor support retain explicit limits.

Missing capabilities include global screen Assist/custom hotkeys/session timer/full Markdown, local question/keyword/multilingual/speaker intelligence, automatic suggestion/live-sharing sessions, persistent meeting notes/history/search/sharing, custom modes/prompts/documents, calendars/people/cross-session memory, enterprise integrations/permissions/coaching and all mobile functions. None is marked complete because its navigation exists. The master P1-P13 roadmap in [BACKLOG.md](BACKLOG.md) replaces the old future-phase numbering and defines testable exit gates.

## Verification and remaining acceptance

**315 unit tests / 27 files**, **5 native-vault/local HTTP plan tests**, **6 installed Claude SDK loopback tests**, **136 Electron assertions (47 core + 37 AI + 11 speech + 41 UI)**, real cached tiny.en speech inference, TypeScript, zero-warning lint, token/spec checks and production build pass. The UI suite produces five app-only screenshots and forbids network requests. Build output includes both font licences. No new npm dependency was added; the app version remains 0.4.0. See [TESTING.md](TESTING.md) for evidence, commands and exact manual limits.

Human EverySession visual acceptance, Windows display scaling/mixed monitors, native dragging/resizing/opacity, Narrator/high contrast, physical keyboard/shortcut/tray behaviour, actual capture/transcription/provider workflows and the original devices/calls/base.en/ARM64/15-minute checks remain pending. Source-code verification and automated screenshots do not replace those checks. Existing separate app use caused expected hotkey-conflict notices during isolated smoke tests.

**Next recommendation:** complete P5 human Windows visual acceptance, then explicitly scope P6 manual screen-aware Assist, configurable shortcuts and safe rich responses using the permitted ChatGPT pathway. Do not start P7-P13 features implicitly. This delivery stops after the requested foundation and uses commit **feat: establish EveryHint design system and product roadmap**, with no AI co-author trailer.

---

# P4.2 delivery -- ChatGPT plan inference

Live verification on **2026-10-28 succeeded** with **gpt-6.1-sol** using EveryHint's own SIWC ChatGPT plan grant and the public Responses endpoint. The approved question was **Reply exactly: EveryHint is connected.** The actual completed answer was **EveryHint is connected.** No screenshot, transcript, history or raw audio was sent. The response reported **167 input / 9 output tokens**, first text in **4.214 s** and completion in **4.299 s**. No API-key/provider fallback or paid Claude request was made. These are a single observation, not a latency guarantee, quota balance or dollar-cost estimate.

1. **Original restriction:** the old button opened a Codex-client session rather than EveryHint's own direct-plan registration. Codex SDK 0.164.0 lacks a supported fail-closed deny-all built-in-tool boundary; read-only still allows commands. Those protections were retained.
2. **Chosen pathway:** official SIWC OAuth with PKCE, fresh state/nonce, stable host, issued client reuse, signed JWT/plan-scope validation and native OS storage; public /v1/models and streaming /v1/responses. Requests use store:false, stream:true, tools:[] and tool_choice:none. There is no agent executor, OpenAI API-key or alternate-provider fallback. See [decision and official sources](DECISIONS/P4.2-chatgpt-plan.md).
3. **Plan access:** the user completed the official browser consent and EveryHint verified its signed plan grant. Real account-specific model discovery and one completed gpt-6.1-sol response confirm the intended pathway for that account/model. Existing Codex/IDE credentials were neither read nor migrated. No billing ledger, unlimited usage or access for every model is claimed.
4. **Genuine answer:** the exact approved reply completed with the model/usage/timing above. Two plan requests were made, each separately authorised. The first was rejected by an overly strict SSE MIME check before any text was displayed. The corrected parser validates bounded SSE data frames independently of MIME metadata, still requires response.completed, rejects non-streaming JSON as completion and cleans up its reader. Three regression cases cover this. The second authorised request completed genuinely; no automatic inference retry occurred. Either attempt may consume the user's plan allowance.
5. **Models/limits:** eight visible models were returned in server order; all advertise image input. The user picker uses current account metadata with a five-minute memory cache. Only gpt-6.1-sol text inference was exercised; other models, images, other accounts/workspaces/regions and future limits need acceptance. Unknown image support blocks screenshots. Context/history, response size and deadlines stay bounded.
6. **Verification:** strict TypeScript, zero-warning lint, **298 unit tests/25 files**, **5 native-vault/local HTTP tests**, **6 installed Claude SDK loopback tests**, production build, **47 core + 37 AI + 11 speech Electron assertions (95)** and actual tiny.en fixture inference pass. See [testing details](TESTING.md).
7. **Remaining Windows checks:** real screens/windows/microphone/playback, consented calls, real captured context with AI, sign-out/revocation/account switching, 15-minute combined performance/stability, base.en, ARM64/older CPUs and distribution eligibility remain pending.

The full token/registration record stays in the asynchronous native OS vault, chunked below Windows limits and atomically committed. Only the public host ID is a file. No credentials reach renderer IPC/logs/source, and captured context is never automatically saved or submitted. Account/model changes cancel work and reset context. Identity-only consent blocks requests until explicit plan permission. Revocation failures are visible. Local Whisper and remote inference are clearly separated. The first MIME failure prompted a frame-based parser fix; no permission restriction was weakened.

Claude subscription sign-in remains disabled without Anthropic approval. Its API abstraction and session-only billing opt-in are preserved and default off; no paid Claude request was made. This is a private-use prototype designed for eventual distribution. A successful personal plan test does not establish commercial approval or release readiness. P5 has not started.

Created: src/main/ai/plan/{accounts,http,oauth,provider,vault}.ts; tests/plan-{accounts,oauth,provider,vault}.test.ts; tests/plan-fixtures.ts; tests/plan.integration.ts; vitest.plan.config.ts; and the P4.2 decision. Updated main/preload/shared contracts/controller, account/assistant UI, AI smoke, README/architecture/backlog/testing/delivery and package manifest/lock. Pinned dependencies added: jose 6.2.13 and @napi-rs/keyring 2.1.2. App version remains 0.4.0. No credential, captured media, model/runtime binary or ignored test artifact is committed.

Run npm run build, then npm start. Use Continue with ChatGPT, Refresh ChatGPT models, select a model, review chosen context, acknowledge and Ask ChatGPT. Successful work is committed as **feat: enable EveryHint ChatGPT inference**. Historical records below describe earlier deliveries and are superseded by this P4.2 result where applicable.

---

# Account sign-in follow-up

**Distribution clarification:** The user confirmed that other people will use EveryHint. Claude subscription sign-in therefore remains blocked pending Anthropic approval; there is no private-use exception enabled. The ChatGPT control remains a local prototype and must not be represented as a completed commercial SIWC integration. The appropriate official registration route depends on open-source/local versus paid/hosted deployment. This clarification changes documentation/release requirements only; no authentication, model request, credential handling or billing behavior was changed, and no paid request was made. See the [recorded requirements and official sources](DECISIONS/P4-providers.md#confirmed-distribution-scope).

Added **Sign in with ChatGPT**, **Switch ChatGPT account**, **Cancel sign-in** and **Sign out of ChatGPT** inside EveryHint. The official bundled Codex client opens the browser and owns authentication. It uses a dedicated `userData/chatgpt` profile and mandatory OS-keyring storage, never hardcoded passwords/API keys, token copying, or the user's shared CLI/IDE account. Native status verifies completion. Unfinished login is cancelled on provider switch, reload/crash, lock/suspend or shutdown; duplicate attempts, stale completions and timeouts are guarded.

Claude account sign-in is visibly unavailable: Anthropic still requires approval for third-party apps to offer subscription login. EveryHint has no approval. Existing API billing remains opt-in, and **no paid request was made**. ChatGPT authentication does not unlock Codex inference; its response-only permission limitation remains open. The user must complete the browser login to verify OAuth end to end; this was not replaced with a mocked success claim.

Created: `src/shared/accounts.ts`, `src/main/ai/accounts.ts`, `src/renderer/src/AccountPanel.tsx`, `tests/accounts.test.ts`. Modified: narrow preload/shared contracts, main lifecycle/IPC, Codex status probing, assistant account controls, `scripts/smoke-ai.mjs` and the five project docs plus provider decision record. No dependency was added.

Verification: **234 unit tests / 21 files**, strict TypeScript, zero-warning lint and production build pass. **33 AI Electron assertions** pass, including real isolated-profile status inspection, rejection of untrusted sign-in IPC, available ChatGPT login controls and clearly unavailable Claude login. Core Electron smoke (**47** assertions), speech Electron smoke (**11** assertions with real tiny.en) and installed-Claude-SDK loopback tests (**6**) also pass. Electron assertions total **91**. Account UI transitions use labelled fixtures; browser OAuth completion remains manual. The shared official `codex login status` remains ChatGPT-authenticated after testing. The P4 baseline record follows.

---

# P4 delivery — explicit AI provider requests (baseline)

P4 adds the shared provider architecture, authentication/capability inspection, a real response-only Claude API adapter, manual provider selection, independently selected context, immutable payload review, fresh transfer consent, streaming/cancel/errors, bounded isolated conversations, safe code display/copy, compact status and teardown. Working capture and local transcription services were preserved. Version is **0.4.0**. **P4 is not fully live-accepted:** Codex inference is deliberately blocked and Claude live authentication/inference is unverified. P5 was not started.

## Connection and real-request status

| Provider | Actual status | Inference |
| --- | --- | --- |
| Codex | Official bundled CLI **0.164.0** and the Electron adapter detect existing **ChatGPT login**. No auth files/tokens were read by EveryHint. | **Blocked:** SDK **0.164.0** has no supported deny-all built-in-tool boundary. Read-only mode still permits commands; hooks can fail open. No agent was launched and no API fallback used. |
| Claude | SDK **0.3.311**, bundled CLI **2.1.311**. No `ANTHROPIC_API_KEY` is configured. Subscription login is unsupported in EveryHint without Anthropic approval. | API-only adapter implemented, disabled by default and gated by a session-only billing opt-in. The user explicitly chose **“Leave live verification pending; make no paid requests.”** No live test was run. |

**Actual live AI requests completed: 0. Paid requests: 0.** The installed Claude SDK/CLI was executed against synthetic loopback HTTP fixtures to verify protocol handling and tool blocking. Those fixtures and renderer test events are not AI responses and are never offered as production output. The limitation follows the task's instruction to disable unsupported functionality rather than grant broad permissions; a successful live Codex/Claude integration is not claimed. Official policy and permission sources are linked in [the decision record](DECISIONS/P4-providers.md).

## Architecture and data

The React renderer has no provider network access or credentials. Narrow IPC checks the exact overlay sender, main frame and document before parsing input. Main owns the provider registry, auth/billing gates, capture-session/conversation/request IDs and one active request. Codex's adapter uses only the official local login-status command. Claude's official SDK owns an isolated CLI child with fixed arguments, hidden windows and an allowlisted environment.

Claude uses an empty tool set, wildcard tool denial, `dontAsk`, an always-denying permission callback, no MCP/configuration/agents, disabled hooks/plugins/memory/bundled skills, bare mode and disabled slash commands. Initialization must confirm the expected restrictions and environment API-key source. Actual SDK tests reject injected Bash/Read/Write/MCP calls; no file sentinel is created. No commands, filesystem exploration, package installation or external actions are exposed to answers.

Only **Review → acknowledgement → Ask** can send selected context. A one-time two-minute review freezes the exact serialized question, selected current-session final transcript excerpts, optional image and bounded question/answer history. Each source is independently selected; raw audio is excluded. Text/image budgets and recent duration are configurable. The prompt treats captured data as untrusted reference material. Screenshots stay in memory and use Claude's native base64 image blocks; no screenshot temp file is needed. Duplicate image hashes avoid unchanged resubmission. No OCR, second-provider fallback, automatic trigger or question detection is introduced.

History holds four completed pairs / 12,000 characters, eight displayed bounded responses and a 15-minute idle expiry. Provider/capture switches reset context. Cancel aborts the SDK and closes/kills its process; request/session guards reject late events, including old results arriving after a new request in the same conversation. Requests have a 90-second deadline and 32,000 response-character bound. Clear also removes the draft and pending review. It does not delete provider records or recall transmitted content.

Claude has one turn, 4,096 output tokens and a $1 SDK estimated-budget threshold, which is **not a guaranteed billing cap**. Usage/cost and timing come from SDK/result events; no balance or quota is invented. Model discovery is not performed automatically; actual init supplies the selected model. No application retries or billing fallback run. SDK internal transport behavior is separate.

`persistSession: false` disables Claude conversation logging. Its temporary config/working directory is removed after success/error/cancel; shutdown allows up to five seconds for teardown. SDK caches, OS/crash remnants and remote retention are independent. Normal Codex SDK sessions would persist in `~/.codex/sessions`, but no Codex thread is created while disabled. No credential, captured media, model or conversation was added to Git.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, zero-warning lint, **219 unit/regression tests in 20 files**, production build |
| `npm run test:ai-sdk` | **6 passed**, installed SDK/CLI with synthetic loopback responses, real-process cancellation and temporary cleanup; no account/provider verification |
| `npm run smoke` | **47 assertions passed**, synthetic media; all hotkeys registered |
| `npm run smoke:ai` | **26 assertions passed**; actual IPC/auth inspection, review/billing rejection, code safety/copy, compact/clear controls |
| `npm run speech:test` | Real tiny.en JFK recognition verified twice through one loaded helper; offline cached model/fixture |
| `npm run smoke:speech` | **11 assertions passed**, real tiny.en via both synthetic P2 sources |
| Production artifacts | Main **99.92 kB**, renderer JS **250.69 kB**, CSS **12.10 kB**, separate sandboxed preloads/audio document/worklet; SDK packages remain external |
| `git diff --check` | Passed |

P1–P3's **157** tests remain in the suite; P4 adds **62** deterministic AI cases. Electron assertions total **84** across the three scripts. Tests cover registry/auth restrictions/API opt-in, source selection/truncation, exact review consent, secure IPC, stream/cancel/deadline/errors/crashes, conversation/capture isolation, cleanup, prohibited tools, duplicates and late results. The actual SDK test discovered unintended bundled skill/plugin loading; documented flags/settings now remove it and runtime init verifies the inventory. Copy uses bounded main-process IPC after Electron's existing browser permission policy correctly denied browser clipboard access. Final checks have no suppressed failures.

Single-sample performance: assistant startup through local auth **665 ms**, text review through UI/main **168 ms**, main RSS **124.4 → 127.6 MB**. These are local synthetic smoke measurements, not real AI latency or whole-app memory. The standalone tiny.en helper loaded in **138 ms**, processed real fixture jobs in **603 / 520 ms**, and used **172.6 MB** / **384–397%** of one logical core. The Electron speech pipeline loaded in **106 ms**, averaged **530 ms** over **11 jobs**, and had **zero queued/dropped jobs/gaps** at the snapshot, with **173.9 MB** helper memory / **384%** CPU. CPU may exceed 100% because four inference threads run. Reports remain in ignored `artifacts/`; combined live-provider/hardware performance remains unmeasured.

## Files

Created:

```text
docs/DECISIONS/P4-providers.md
scripts/smoke-ai.mjs
src/main/ai/claude.ts
src/main/ai/codex.ts
src/main/ai/context.ts
src/main/ai/controller.ts
src/main/ai/environment.ts
src/main/ai/errors.ts
src/renderer/src/AssistantPanel.tsx
src/shared/ai.ts
tests/ai-context.test.ts
tests/ai-controller.test.ts
tests/ai-providers.test.ts
tests/claude-sdk.integration.ts
vitest.sdk.config.ts
```

Modified:

```text
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
package.json
package-lock.json
scripts/smoke.mjs
src/main/index.ts
src/preload/index.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/contracts.ts
```

Only the two requested upstream SDKs were added as direct runtime dependencies. Their platform binaries and required upstream/peer dependencies are locked. No heavyweight Markdown/highlighting package was added. Existing capture/transcription modules and native code were not rewritten. Temporary formatter tooling was used without adding a repository dependency.

## Open acceptance and reproduction

Codex needs a supported fail-closed response-only tool boundary before inference can be enabled. Claude needs a later explicit API-billing authorisation, locally configured API key and a genuine live request; the current user instruction forbids paid tests. No policy exception or credentials were fabricated. Provider/model availability, true remote streaming latency, real authentication expiry/rate/network behavior and real screenshot reasoning remain unverified.

All earlier physical acceptance stays open: real Windows microphone/loopback, consented calls, P1 controls on actual devices, base.en quality, ARM64/older CPUs and a 15-minute conversation. A combined real provider/transcription CPU/RSS/responsiveness run is also pending. The full **20-item P4 manual checklist** and P1–P3 lists are in [TESTING.md](TESTING.md). These are not replaced by mocks or synthetic-media checks.

Run the commands in [TESTING.md](TESTING.md) after `npm ci`; speech checks reuse the already-installed verified helper/model/fixture and require no further download. Start the app with `npm run dev` or `npm start` after building. Claude remains disabled until a later explicit in-app opt-in and API-key setup. Inspect the delivery commit with `git log -1 --oneline` and `git status --short`; intended commit message is `feat: integrate EveryHint AI providers`, without co-author trailers. No push/deployment was requested. P5 is not started.

---

# Historical P3 delivery — local live speech transcription

P3 connects the existing independent microphone/system PCM streams to one CPU whisper.cpp helper, with validated transport, mono/16 kHz conversion, energy-based speech segmentation, bounded fair scheduling, provisional/final transcript replacement, overlap deduplication, ordered source-labelled text and a rolling memory-only transcript store. Models/settings/diagnostics are available in the overlay, including compact mode. Capture controls, all seven source combinations and P1/P2 privacy indicators remain.

## Verification

| Check                                                     | Result                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Strict TypeScript / lint                                  | Passed                                                                                          |
| Unit tests                                                | **157 passed, 0 failed, 17 files**                                                              |
| Production build                                          | Passed                                                                                          |
| Native helper build/install                               | Passed, official pinned whisper.cpp v1.9.5; upstream compiler/CMake warnings visible            |
| Core Electron smoke                                       | **47 assertions passed**; synthetic media; all hotkeys registered                               |
| Speech Electron smoke                                     | **11 assertions passed**; actual tiny.en inference through both synthetic P2 sources            |
| Actual helper inference                                   | Verified upstream JFK speech twice through one loaded model; expected recognised phrase checked |
| Real microphone/Windows loopback/calls                    | **Pending**                                                                                     |
| Base.en actual inference / 15-minute conversation / ARM64 | **Pending**                                                                                     |

The user explicitly authorised the official tiny.en model and known speech fixture downloads for verification. Both checksums match. Tiny.en and the CPU runtime are installed under local application data; no model or runtime binary is committed. Base.en install/selection and its pinned checksum are implemented, but it was not downloaded or claimed as inference-tested.

One recorded four-thread CPU fixture run: model load **86.3 ms**, consecutive ~11-second jobs **648.0/528.2 ms**, working set about **165 MiB**, helper CPU about **373–395 one-core percent** during inference. A recorded dual-source Electron run averaged **487.4 ms** over ten chunk jobs, with queue **0**, dropped jobs **0**, gaps **0**, and ~**166 MiB** working set. These short warm-cache observations do not establish long-run/hardware performance. Latest per-run fixture measurements are in ignored `artifacts/inference.json` and `artifacts/speech-smoke.json`.

## Architecture and limits

- One native helper/model per enabled run; sequential C API inference, source-fair scheduling and no shell/HTTP server/native Node binding. Models release on transcription/capture pause, Stop, Clear, settings/model changes, failure and shutdown.
- Native audio-clock spacing, strict PCM validation, channel averaging and bounded FIR resampling preserve source/time provenance. Gaps reset conversion and separate speech segments.
- P2's original two-second/768,000-byte caches are unchanged. P3 adds 10–15-second speech segments, up to two queued jobs per source, and one in-flight inference. Overload replaces superseded partials and drops older queued work visibly.
- Partials are actual chunk inference and can change. Stable utterance IDs replace provisional text; finals commit it. Limited overlapping multiword text is deduplicated without merging sources or claiming speaker identities.
- Transcript retention defaults to 15 minutes/200 events, with a 50,000-character cap and scheduled expiry. Text stays in memory, survives pause for review, clears on request/new session, and is never saved automatically.
- Transcription starts OFF and cannot activate audio. Enable requires authorised ACTIVE audio capture. Random run/session/job guards reject old PCM/results. Clear cancels pending work and leaves transcription paused. Capture Resume also requires an explicit transcription Resume.
- Tiny.en/base.en downloads are explicit, bounded and checksum-verified; default model tiny.en. No external transcription/AI calls, telemetry, conversation export, question detection or AI memory was added.

Remaining limits: energy gating is sensitive to noise/quiet speech; max-boundary overlap deduplication is approximate; overload can lose text; Windows loopback routing/protection/mute limitations remain. The tested x64 native backend uses AVX2/FMA/F16C/BMI2. ARM64 and older CPU rebuilds, real devices/calls, base.en quality and a 15-minute Windows stability run require manual acceptance. P1/P2 acceptance remains open; no synthetic result is presented as hardware acceptance.

See [Architecture](ARCHITECTURE.md), the [decision record](DECISIONS/P3-transcription.md), [Testing](TESTING.md) and [Backlog](BACKLOG.md).

## Files changed

Modified:

```text
.gitignore
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
package.json
package-lock.json
scripts/smoke.mjs
scripts/synthetic-audio.mjs
src/main/audio-host.ts
src/main/index.ts
src/main/session.ts
src/preload/audio.ts
src/preload/index.ts
src/renderer/audio/engine.ts
src/renderer/audio/main.ts
src/renderer/audio/worklet.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/audio-ipc.ts
src/shared/contracts.ts
tests/audio-engine.test.ts
tests/audio-host.test.ts
```

Created:

```text
docs/DECISIONS/P3-transcription.md
native/transcriber/CMakeLists.txt
native/transcriber/main.cpp
resources/speech-models.json
scripts/build-transcriber.ps1
scripts/install-model.mjs
scripts/smoke-transcription.mjs
scripts/speech-fixture.mjs
scripts/test-inference.mjs
src/main/transcription/controller.ts
src/main/transcription/model-files.ts
src/main/transcription/models.ts
src/main/transcription/pcm.ts
src/main/transcription/segmenter.ts
src/main/transcription/transcripts.ts
src/main/transcription/worker.ts
src/renderer/src/TranscriptionPanel.tsx
src/shared/transcription.ts
tests/speech-models.test.ts
tests/transcription-controller.test.ts
tests/transcription-pcm.test.ts
tests/transcription-segments.test.ts
tests/transcripts.test.ts
tests/whisper-worker.test.ts
```

No npm dependency was added. Application version is 0.3.0. Native/source/model/fixture caches live outside source control, and test reports/screenshots remain ignored. No unrelated files were modified.

## Run and reproduce

With Node 24, Git, Visual Studio C++ Build Tools/Windows SDK and CMake 3.24+:

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run speech:build
npm run speech:model -- tiny.en
npm run dev
```

The helper and tiny.en are already installed locally from this verification; repeating their setup is optional. For an additional model, explicitly run `npm run speech:model -- base.en` or use settings.

```powershell
npm run check
npm run smoke
npm run speech:test -- --install-fixture
npm run smoke:speech
```

Only the first fixture test needs `--install-fixture`; subsequent speech tests are offline. The Node helper test uses Node 24's experimental type-transform flag to import the production TypeScript worker; the packaged application uses compiled JavaScript and does not need that flag. Native source is pinned to `d1be6fde11ac6e0407606b4e42fe72d34add8037` and its published root license (the ggml authors' MIT license) is installed beside the helper.

The verified P3 commit uses `feat: add EveryHint local live speech transcription`. Inspect `git log -1 --oneline` and `git status --short`. P4/P5 have not started.
