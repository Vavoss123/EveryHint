# P10 Calendar, People, memory and preparation verification — 2026-10-28

Baseline `153846c`. [Architecture/checkpoints](DECISIONS/P10-context.md). P10 preserves P1–P9 tests; historical evidence below keeps its original scope. P11/P12/P13 are not started. No Google production approval is claimed.

| Check | P10 evidence |
| --- | --- |
| Strict TypeScript, zero-warning lint, production build | Passed during implementation; final combined gate recorded in DELIVERY |
| Unit/regression suite | **688 cases / 53 files**, 78 added cases retain all 610 baseline cases |
| Actual Electron P10 | **36 assertions**: real app/preload/IPC/encrypted worker/Windows key vault, explicit mocked Google HTTP/browser/native-toast delivery; zero genuine Google/AI requests |
| Genuine Google Calendar/Contacts | **Pending by explicit user choice**; no real account/events/contacts accessed; configured Desktop client and test-account/data permission still required |
| Genuine P10 ChatGPT brief | **Exactly one separately authorised gpt-6.1-sol request passed**: 14.124 s, 978 input / 723 output tokens; synthetic Google context, real plan inference; grant consumed |
| Brief dry-run | Passed, zero network/model requests: synthetic event/person plus approved memory from an actual encrypted synthetic saved note; unrelated canary omitted; exact refs/guards preserved |
| Performance | Actual compiled worker: 1,000 events + 1,000 people + 1,000 memories; measurements below; no real Google/network latency |

### P10 automated coverage

`google-oauth` tests actual random loopback HTTP, S256/state/denial/nonce/signed JWT/issuer/audience/scopes, refresh/revoke/invalid grant, cached signing-key rotation and independent native-vault contracts. `calendar` covers complete bounded pages/multiple calendars, recurrence/cancellation, DST fold/all-day dates, explicit-offset refusal, unsafe links, 410 window restart, rate failures and receipt-before-toast dedup/restart/reschedule/in-flight cancellation. Calendar incremental sync is intentionally not implemented; Contacts deltas are tested with stable parameters, expiry and 410 reset.

`people` covers separate consent, search warmup/selected batch/completeness, optional whole-book pages/deltas/deleted contacts/backoff, manual/imported provenance, exact verified email, actual encrypted CRUD and old-profile response refusal. `memory` uses real P8/P10 encrypted stores to test explicitly saved ended sources, literal extraction/unsupported-claim omission, pending review, edits/optimistic versions, source mutation/deletion, topic/person/meeting retrieval, exclusions, retention, local disablement, delete-all, document refs, profile isolation and post-interface-load restore.

`workspace-ai` tests exact selected context/default omission, acknowledgement/removal/new review IDs, missing/excluded/changed sources before and after provider inspection, cancelled retrieval, no ordinary follow-up reuse, event-bound ephemeral briefs/chosen save, independent associations and staged Live default-off/remote/exact-ID/scope/cooldown. Existing P7 cap/expiry/auth/stream cancellation tests remain. `workspace-export` verifies exclusive new-file export, native cancellation, scope change and cleanup of its incomplete plaintext file. Fixture providers never establish genuine inference or factual quality.

The compiled smoke completes mock Google browser → real bound callback → signed JWT validation → native token vault → official transport fixture → atomic encrypted cache. It exercises Calendar/details/links, People notes/import provenance/attendee matching, actual P9 document extraction → P10 pending/approved memory, exact removable brief preview/refused unacknowledged Ask, no automatic Live/capture, restart/native-key restore, SQLite plaintext-marker absence, document cascade and disconnect preserving manual notes. The meeting mutation IPC also rejects an old-profile completion before derivative cleanup, so it cannot clear the next profile's records. Google refresh preserves unrelated P6 reviews. Initial restore raced the initial page-load safety lock; restore now runs after initial load and the restart regression passes. Native browser interaction/Google service and Windows notification delivery are mocked. Screenshots: ignored `artifacts/p10/calendar.png`, `people-memory.png`.

### P10 performance and resource limits

One local run, Node 24.22.0/Electron 45 actual compiled worker, synthetic 3,000-record database: worker open **33.03 ms**; encrypted 1,000-record batches event/person/memory **20.03 / 15.76 / 18.48 ms**. Seven samples: People search **9.33 ms mean / 12.31 ms max**; keyword memory retrieval **15.44 / 21.85 ms**; person-filtered memory **9.34 / 10.62 ms**. Queries scan one bounded category and return at most 25. After 1,000 events the cache plus schema is **389,120 bytes**; empty/full SQLite **40,960 / 1,392,640 bytes**, encrypted growth **1,351,680 bytes**; worker heap **5,841,628 → 7,715,316 bytes**; shared test process RSS **94,203,904 bytes**. RSS includes process/worker and is not an endurance peak.

Fixture-backed compiled initial Calendar refresh: **13.59 ms / 2 requests** (one calendar-list + one event page); actual saved-document memory extraction **11.81 ms**. The zero-network brief dry-run is not a genuine latency measurement. The separately authorised genuine pre-call request completed in **14.124 s**, first text **2.684 s**, **978 input / 723 output tokens**. Calendar incremental latency is **N/A by design**; genuine Google initial/delta/network/backoff timing remains pending. These short local samples do not establish long-run UI/capture/Whisper coexistence or internet performance. Reports: ignored `artifacts/p10-smoke.json`, `p10-performance.json`, `p10-brief-dry-run.json`, `p10-genuine-brief.json`.

No background all-book import or AI occurs. Google refresh defaults manual; optional Calendar polling is about 15 minutes with minimum interval/backoff. Event cache/People/memory/associations each cap at 1,000, briefs at 30, workspace serialization at 14,000 characters, total brief review at 30,000. Expiry filters and guards reject unavailable sources. P8/P9 encryption/key-loss/deletion limitations remain; marker absence is evidence against plaintext storage, not a physical secure-erasure guarantee.

### P10 genuine verification procedure and current limits

For Google, follow [configuration](ARCHITECTURE.md#p10-google-setup-and-distribution), obtain explicit permission for a test account and selected harmless existing data, connect Calendar, select calendars, compare real dates/offsets/recurrence/cancellation, refresh/offline/revoke, then separately authorise Contacts search/selected import and optional full-book deltas/deletions. Do not create real events/contacts without permission. Record exact observed requests/results and keep other scopes pending. No configured client/test grant was supplied during local verification.

The user subsequently chose **Keep genuine Google verification pending** and separately authorised exactly one scoped ChatGPT brief. `scripts/verify-context-ai.mjs --authorised-one-request` completed with **one genuine Responses POST**, `gpt-6.1-sol`, `store:false`, `stream:true`, no tools or paid fallback. The 3,385-character frozen prompt contained only the synthetic event, “Test Participant” without email/background, and approved literal memory extracted from a newly created encrypted synthetic previous meeting note. Screenshots, transcripts, ordinary QA history, knowledge documents and real Google/user history were absent. The unrelated saved-note canary was checked absent before transmission.

Observed result: `response.completed`, **14,124.0088 ms** elapsed, **2,684 ms** to first text, **978 input / 723 output tokens**, **3,101 response characters**. Assertions confirmed both Thursday/Wednesday details and an exact supplied workspace citation. This verifies that bounded fixture brief through the genuine provider; it does not establish semantic support for every generated statement, real Google integration, real-call quality or automatic Live. No second attempt or retry occurred. The fixture worker/key resources were disposed and the isolated encrypted fixture directory was removed; a post-run directory check found no `everyhint-p10-inference-*` leftovers. App preferences were untouched. The harmless ignored result receipt retains timing/reference metadata, never credentials. **The one-request grant is consumed.**

`node scripts/verify-context-ai.mjs --dry-run` bundles existing production controllers/provider exports and runs isolated compiled encrypted P8/P10 workers without network. The separate `--authorised-one-request` path requires an explicit chat grant, reads the existing EveryHint native ChatGPT registration without copying credential files, discovers/selects gpt-6.1-sol and permits **one** exact reviewed Responses POST. It asserts `store:false`, `stream:true`, no tools, exact input/model, selected event/person/memory only, omitted unrelated saved-note canary and a supplied source citation plus Thursday/Wednesday. The harmless memory is extracted from an isolated synthetic previous saved note; no real calendar/contact/history/document/capture is read. Temporary encrypted test records are removed, app preferences untouched. The reserved `artifacts/p10-genuine-brief.json` now prevents rerunning the completed test; a failed/uncertain attempt would also consume its budget. Never infer permission from the flag or a previous milestone's grant. Genuine automatic Live with P10 context remains pending despite this successful manual request.

### P10 Windows manual acceptance — all pending unless separately recorded

1. **Calendar sign-in:** use a configured Desktop test client; observe only system-browser Google consent/read-only scopes, decline/cancel/timeout/wrong-state refusal and no ChatGPT change.
2. **Calendar selection:** load multiple authorised calendars, choose up to five, refresh, unselect and confirm cache removal. Never change Google events.
3. **Upcoming display:** compare existing real event title/location/attendees/duration/platform and day/week/upcoming/search/filter/empty/stale states.
4. **Recurrence:** inspect real recurring instances/overrides and original-start provenance across the window and DST boundaries.
5. **Cancellation:** owner/test account changes an existing test event only with separate permission; refresh and confirm disappearance without deleting independent P8 history.
6. **Reminders:** authorise Windows notifications; try disabled/5/10/15/30, generic/title option, cancellation/reschedule/dismiss/catch-up/restart and duplicate suppression. Toast click opens preparation only.
7. **Quick Join link:** explicitly open a supported HTTPS meeting link; confirm it only opens the link, without enabling EveryHint capture/Live/saving.
8. **Contacts:** separately consent, search, select import; reject whole-book import until separately acknowledged; test refresh/delta/delete/expired token/revoke. Google is never written.
9. **People Search:** search actual local records, inspect provenance, confirm exact verified-email matches; aliases/names/voices must not be treated as identity.
10. **Manual editing:** edit optional facts/notes, retain imported snapshot separation, remove association/delete local record, confirm no Google write.
11. **Saved associations:** link an existing ended saved meeting, open real notes/actions from an upcoming/recurring event, unlink; titles/history remain independent.
12. **Cross-meeting memory:** enable explicitly, select saved sources, rebuild and inspect exact source/revision/quote. Temporary/active sessions must be rejected.
13. **Commitments:** inspect open/done states, missing owners/deadlines, pending/approved review and person/topic/meeting search; no unsupported claim becomes a known fact.
14. **Memory deletion:** exercise edits/stale edit, individual/all deletion, source deletion, exclusions, shortened retention and rebuild; source unavailable/changed must revoke sharing.
15. **AI brief:** under a separate scoped request grant, inspect overview/participants/history/actions/documents/questions/checklist, missing-information statements, cited support, timing and cancellation.
16. **Brief sources:** remove event description/person/memory/meeting/knowledge before approval; review ID/ack reset; ensure unrelated histories/contact book never enter prompt. Test ephemeral/copy/export/explicit save/retention.
17. **Modes:** switch built-in/custom modes/output preferences; verify subordinate instructions and independently selected Knowledge. Switching must revoke pending sharing.
18. **Live:** explicitly stage exact context, inspect text, enable/remote-authorise for that session, then test existing spoken trigger/cooldown/cap/expiry/cancel. Google/memory enablement cannot grant Live.
19. **Account lifecycle:** switch/revoke Google subjects and local ChatGPT registrations; check scope/key/token/cache isolation, imported/manual separation and project-wide Google revocation effects.
20. **Offline:** disconnect network during pages/token refresh/brief stream; retain visibly stale complete cache, no partial delta token or silent retries/fallback.
21. **Restart/Windows lock:** selected restore resumes local cache/reminder policy only; default remains locked, OS lock/suspend/reload clears sharing, no capture/AI/join resumes.
22. **DPI/multi-monitor:** inspect Calendar/People/brief/editor/consent at supported scaling/window sizes, scrolling, focus, contrast and persistent capture cancellation.
23. **Accessibility:** keyboard-only traversal, names/labels/checkboxes/native dialogs and Narrator at minimum width; verify errors/updates and source/evidence text are reachable.

Carry forward every unresolved P1–P9 physical microphone/system playback/real calls, P5 visual/DPI, accessibility, account lifecycle, P7 genuine automatic acceptance, ARM64/base.en/older CPUs and long-duration CPU/RSS checks. Multilingual Whisper, OCR, semantic retrieval and external professional research remain deferred. The restricted historical P8 folder/four P6 profiles were not touched.

## Historical P9 verification

# P9 modes, knowledge, language and template verification — 2026-10-28

Baseline `bf92396`. [P9 architecture/checkpoints](DECISIONS/P9-personalisation.md). P9.1–P9.5 preserve the existing P1–P8 capture, Whisper, reviewed/Live provider and meeting gates. Historical results below remain bounded evidence, not blanket acceptance. No P10/P11/P12 work was started.

| Check | P9 result |
| --- | --- |
| `npm run check` | Generated theme/spec checks, strict TypeScript, zero-warning lint, **610 unit/regression cases / 47 files**, production build |
| `npm run test:plan` | **5** local HTTP/JWT/SSE/native-vault integration cases; no genuine inference |
| `npm run test:ai-sdk` | **6** installed Claude SDK loopback cases; no paid requests |
| `npm run test:meetings` | **12** actual compiled SQLite-worker/native-credential assertions; P8 persistence retained |
| Electron core / AI / speech / UI / intelligence / meetings / personal | **47 / 44 / 11 / 44 / 28 / 42 / 34 = 250 assertions** |
| `npm run speech:test` | Actual cached tiny.en/JFK helper inference retained; latest observed two jobs **503.158 / 378.483 ms**, no model/fixture download |
| `npm run personal:bench` | Actual compiled personal worker, ten generated large documents / 3,630 indexed sections; no remote request |
| Genuine P9 AI | **Exactly 2 expressly authorised gpt-6.1-sol Responses requests completed**, no retry/fallback; results below |

## Genuine provider evidence

The user explicitly authorised the two scoped tests in chat. `scripts/verify-personal-ai.mjs --authorised-two-requests` refuses ordinary execution without its opt-in flag, reserves a single report before the first Ask, and delegates the real HTTPS transport only for each exact approved frozen prompt. It observes at most two POSTs, requires the official endpoint/model and `store:false`, `stream:true`, `tools:[]`, `tool_choice:none`, one `input_text`, no screenshots/history/unrelated sources, and never retries. An existing quiet development preview was checked for empty drafts/responses/transcripts and inactive capture/grants before replacement; no credentials were copied. Native file-dialog choice alone was mocked to the newly authored harmless Markdown file; actual extraction/encryption/retrieval/provider paths were used.

1. **Custom mode + knowledge + citation:** the new Markdown source says the prototype release is Thursday and checklist is due Wednesday. The custom release-coach mode requested concise English bullets. Only one selected active-mode excerpt appeared in the frozen review. Genuine gpt-6.1-sol completed in **3.002 s**, using **454 input / 47 output tokens**, returning both correct days and the exact `[K:document:section]` reference. This is an observed supported short answer; it does not establish semantic verification for arbitrary claims/documents/languages.
2. **Custom meeting template:** the existing offline TTS fixture passed through one synthetic microphone and actual cached tiny.en, yielding the three exact sentences: “We decided to release the prototype on Thursday.” “I will prepare the test checklist by Wednesday.” “The owner and deadline for documentation are not specified.” The custom template used Release overview, Confirmed decisions and Checklist commitments. Only those selected microphone final excerpts were sent. Genuine completion took **19.061 s**, **1443 input / 472 output tokens**. Exact evidence validation passed; the response had a supported Thursday decision and Wednesday checklist action, unknown owner null. It remained unsaved until scripted review/Apply; the saved summary retained the custom template snapshot.

Actual observed Responses POSTs **2**, rejected scope attempts **0**. No physical microphone, system playback, screenshot, personal document, raw-audio transfer, generated-code execution, paid API fallback or Claude request occurred. Test document/mode/template/meeting records were removed, app/speech/personal/history preferences restored and synthetic test app closed. Ignored evidence: `artifacts/p9-live-ai-result.json`; it contains harmless fixture results, never tokens. No additional genuine requests are authorised by the committed test script. Genuine automatic Live **with knowledge** remains unverified; its scheduler/permission/cooldown path has deterministic provider tests. The user's carried-forward P7 acceptance item is not reclassified by this P9 test.

## Requested coverage and boundaries

| Requested categories | Evidence |
| --- | --- |
| 1–9 mode CRUD, built-in protection, migration, validation, switching/session isolation | `modes`, `personal-integration`, `personal-storage`, `templates`; actual editor/selection/restart smoke and genuine custom mode |
| 10–16 import, malformed formats, PDF/DOCX/TXT/MD, sizes/parser failure | `knowledge`; deterministic actual PDF/ZIP/XML/UTF-8 fixtures, macro/entity/decompression limits, isolated parser crash/cancel; all four real compiled extraction formats in Electron |
| 17–20 encryption/keys/deletion/index cleanup | `modes/knowledge/personal-storage`, P8 cipher/key suites; actual SQLite/journal marker scan and native-key smoke; association/section cascades and original-source preservation |
| 21–25 local search/ranking/disabled sources/context bounds/source accuracy | `knowledge/personal-integration`; common-topic large-index regression, exact extracted PDF page/null non-PDF pages, bounded results/budget; real local search and genuine source reference |
| 26 prompt injection | Malicious instruction-like document fixtures remain JSON reference data; immutable provider instructions/mode/template precedence and no executable tool path; not a claim of semantic prompt-injection immunity |
| 27–28 manual consent/Live knowledge | `personal-integration` checks fresh acknowledgement, stale guards, independent retrieval/remote/source selection, forbidden public automatic overrides and actual scheduler-selected excerpts/cooldown; P7/P8/plan pre-POST regressions retained |
| 29–30 output language/Whisper compatibility | `modes/templates/personal-integration`, `speech-models/settings/transcription-controller`; French frozen preference, English genuine mode override, unsupported speech models refused; only tiny.en/base.en English offered |
| 31–34 template editor/persistence/summary/manual preservation | `templates/personal-integration`, existing P8 suites; actual editor/reorder/restart and genuine selected-template summary; reviewed draft/Apply/previous versions/clear-derivative tests |
| 35–37 provider/account/cancel | `personal-integration/personal-storage` plus existing AI/plan/P7/P8 suites; wrong-profile/key/corrupt/newer-schema failures, delayed unlock/retrieval refusal, parser termination and reload/restart locks |
| 38 P1–P8 regressions | All existing 543 baseline unit cases remain enabled; full provider/SQLite/core/AI/speech/UI/intelligence/meeting checks rerun |

The local P9 Electron smoke uses a fresh profile and actual Windows Credential Manager, SQLite, parser and storage workers. It exercises functional mode/template forms, all formats, metadata/inspection/search, source selection, fresh consent refusal, invalidation on disable, profile lock/restart, deletion/cascade/original preservation and malformed import. Native import **choice** is mocked, while chosen synthetic files are truly read and parsed; no real picker interaction or genuine provider result is inferred from smoke fixtures. Earlier P8 native save-dialog/clipboard/mail ports remain mocked in their tests.

## Performance observations

One local small-document Electron run (warm package cache): PDF import **219.120 ms**, of which extraction **161.690 ms**; DOCX **63.589/2.143 ms** import/extraction; TXT **52.309/0.307 ms**; Markdown **51.444/0.360 ms**. Search across four documents **5.752 ms**; mode-switch IPC/persistence **10.845 ms**. Parser used about **11.00 MB** V8 heap after PDF extraction; app main RSS snapshot **155.66 MB**, not whole-app memory. These are observations, not cold-start/physical-device guarantees.

The standalone compiled-worker benchmark uses ten generated **399,000-character** source documents, **3,990,000** total source characters / **3,630** overlapping sections. Encrypted import mean **12.352 ms/document** (excludes extraction). Five retrieval runs mean/max **102.918/114.194 ms**. Results: **4800 excerpt characters**, **5489 serialized excerpt characters** before other prompt content; whole-request bounds are independently rechecked. Encrypted database **28,672 → 5,066,752 bytes**; encrypted index/storage growth **5,038,080 bytes**. Worker heap snapshot **5,807,556 → 25,452,520 bytes**; combined standalone test-process/worker RSS **185,655,296 bytes**. RSS includes the host and is not per-worker peak memory. Input/page/text/queue/time bounds and V8 resource limits apply, but native/external allocations are not a hard RSS sandbox. No large-document startup load, UI-thread parsing, remote embedding or persistent plaintext index exists.

The benchmark exposed an absolute BM25-cutoff defect (common topics disappeared as corpus size grew). Meaningful keyword coverage and a dedicated regression now retain those matches; generic English stopword-only queries yield no results. Retrieval remains lexical, bounded to selected sources and ten documents per library-search page, with no semantic/full-library ranking guarantee. Large adversarial PDFs and combined 15-minute capture/Whisper/AI stress remain manual release work. Reports: ignored `artifacts/p9-performance.json`, `p9-smoke.json`.

## Windows manual acceptance — still open

1. Create a custom mode; edit its name/icon/instructions/length/format/actions/context; duplicate/delete it; reset a built-in and verify built-in deletion is unavailable. Restart/unlock and verify the default mode, profile and saved preferences.
2. Switch modes in compact, expanded and dashboard; verify the same active name, no capture/inference starts and pending review/Live grant is revoked. Test saved custom instructions only through Review → acknowledgement → Ask.
3. Use the **real native picker** to upload representative PDF, DOCX, UTF-8 TXT and Markdown files. Inspect headings/pages/null page metadata, file size/import/update time/status/section counts; try malformed, encrypted/scanned/no-text and limit-sized files; cancel processing.
4. Search specific local terms; continue beyond ten documents; inspect excerpts; rename/disable/re-enable/associate/remove associations/delete. Verify disabled/unassociated sources cannot enter AI context, and original files survive app deletion.
5. Ask about an explicitly selected document. Inspect exact transmitted excerpts, compare cited statements/quotes with the source and verify unknown refs are flagged; no page reference may be invented. Verify encrypted SQLite/journal content, missing-key fail-closed behaviour and managed derivative cleanup with suitable test data.
6. Set global output language and a different mode override, review the effective prompt and assess genuine language quality. Confirm tiny.en/base.en explicitly say English-only. Multilingual Whisper testing is **not applicable until separately implemented and explicitly downloaded/checksum-verified**.
7. Create a template, edit headings/guidance/content mapping/order, remove/add/duplicate/rename it, select a default and mode association, preview, generate from real consented final transcripts, inspect exact evidence and Apply. Edit notes, regenerate a fresh draft and confirm manual notes/previous saved version remain available; test stale revisions and explicit manual-replacement approval.
8. For Live, select a mode and documents, independently enable retrieval and remote excerpt sharing, then acknowledge sources/account/model/time/cap/cooldown. Confirm no document upload creates requests, unselected sources never appear, sent excerpts remain inspectable, and Pause/Stop/cancel/account/model/mode/source/expiry revoke sharing. Resume must require renewed permission.
9. Recheck all P1–P8 workflows with physical Windows microphone, playback, both and consented calls/noise/overlap; physical shortcuts/tray/device recovery/lock/suspend; 100/125/150/200% and mixed DPI/multi-monitor, light/dark/high contrast/opacity, Narrator and keyboard-only focus/reflow, minimum-width Stop visibility, base.en/ARM64/older CPUs, forced-close recovery and 15-minute combined CPU/RSS/stability. Account lifecycle/release checks and the user's carried-forward P7 acceptance stay open.

No human hardware/visual/accessibility/endurance acceptance is inferred from screenshots, mocked dialogs or synthetic speech. The previously automatic-review-blocked P8 folder `everyhint-p8-storage-kUp6R1` and restricted P6 profiles were left untouched. Future formats, OCR, multilingual models, semantic retrieval and P10–P12 remain deferred. Feature rows 44–55 record actual scope; none is COMPLETE.

---

## Historical P8 verification

# P8 Meeting Notes, History and Intelligence verification — 2026-10-28

Baseline `2047110`. P8.1–P8.4 were independently gated in [P8-meetings.md](DECISIONS/P8-meetings.md). Existing P1–P7 controllers/transport/EverySession assets remain; no new dependency, model download, raw-audio storage, tool executor or paid API fallback was added. Earlier phase results below are historical; all open human Windows/device/call/endurance gates remain open.

| Check | P8 result |
| --- | --- |
| `npm run check` | Theme/spec generation checks, strict TypeScript, zero-warning lint, **543 unit tests / 42 files**, production build pass |
| `npm run test:plan` | **5 integration cases pass** using real local HTTP/JWT/SSE and isolated native credentials; no OpenAI inference |
| `npm run test:ai-sdk` | **6 integration cases pass** against installed Claude SDK loopback fixtures; no paid requests |
| `npm run test:meetings` | **12 assertions pass** using actual Electron Node 24.22.0 / SQLite 3.53.4 compiled worker and isolated Windows Credential Manager; 500 generated final segments, no remote request |
| Electron core / AI / speech / UI / intelligence / meetings | **47 / 44 / 11 / 44 / 28 / 42 = 216 assertions**; media/transcripts/email UI are explicitly labelled fixtures; native external ports are mocked |
| `npm run speech:test` | Cached verified tiny.en + upstream JFK; actual native inference **373.485 / 359.969 ms** for the two source IDs; no physical capture |
| Genuine P8 summary | **Passed generation, exact-evidence validation and review/Apply**: three offline TTS sentences through synthetic mic + real tiny.en; gpt-6.1-sol **11.028 s, 1,090 input / 795 output tokens** |
| Production output | Main about **290 kB**, history worker **22 kB**, renderer JS **349 kB**, CSS **29 kB**, plus existing local fonts; no remote font or asset loading |

## Genuine summary evidence and limits

The user separately authorised exactly one initial summary test and, after a harness failure, exactly one additional test. Both delegated genuine official ChatGPT-plan inference, with one POST per run and no automatic retry. The first produced a schema/quote-validated draft; the test script mistakenly searched the response using the terminal-cleared request ID and cleaned up before inspecting/applying it. The corrected replacement identified the response using the frozen review ID and saved evidence before further assertions. This is a test-harness correction, not a fabricated model result.

The successful run used these exact harmless offline-TTS sentences, all recognised correctly by actual tiny.en: “We decided to release the prototype on Thursday.” “I will prepare the test checklist by Wednesday.” “The owner and deadline for documentation are not specified.” Only three final microphone excerpts from that explicitly saved labelled meeting appeared in the frozen 3,127-character review. Automatic End notes stayed off. A separately checked main transport delegated exactly one official `https://api.openai.com/v1/responses` POST with gpt-6.1-sol, `store:false`, `stream:true`, `tools:[]`, `tool_choice:none`, one text input, no screenshot/raw audio/system source/previous history/API billing fallback. Completion required the real terminal provider event and structured quote/ref validation.

The actual output recapped the Thursday release, Wednesday checklist and unspecified documentation ownership/deadline. It produced one supported decision and one Open action; the action owner was null (Unassigned), deadline exactly Wednesday. No fictional participant, calendar date or documentation commitment was invented. The result stayed unsaved until Apply; the reviewed sections then persisted with AI provenance and the actual three segments. Both labelled test meetings were deleted, original local-history/speech/appearance preferences restored, and test apps closed to dispose synthetic overrides. No email application was opened or message sent. Normal startup is IDLE/Manual, history locked and automatic grants absent.

Ignored evidence: `artifacts/p8-live-summary-result.json` (limited first run), `artifacts/p8-live-summary-replacement-result.json` (successful run), `artifacts/p8-meeting-smoke.json`, `artifacts/p8-storage-integration.json`. Genuine verification covers this one account/model/short synthetic conversation and reviewed summary path. Genuine automatic End, prior-meeting QA and follow-up email inference are **not** claimed; those have deterministic provider tests only. Physical audio/calls, broad extraction accuracy, overlapping speakers and other models/accounts remain pending.

## Encryption, persistence and recovery verification

Actual SQLite tests inspect database/journal artifacts for plaintext title/device/transcript/manual-note/tag markers; test wrong key/profile, nonce variation, ciphertext/metadata tampering, key loss and OS-secret failure. Keys are protected by a distinct native credential service and never renderer/config fields. Sensitive content is authenticated AES-256-GCM ciphertext before SQLite sees it; visible IDs/timing/status/count/revision/expiry/file size are disclosed. No plaintext FTS/search cache or raw-audio file is created.

Versioned migrations, future-schema refusal, rollback on migration failure, preserved corrupt files, abruptly terminated subprocess transactions and interrupted-run recovery are tested. Reopen with the same key restores only committed data, not capture/remote permissions or offline recording duration. Application-level delete/retention removes managed rows/derivatives and invalidates search/draft/reference access. User notes/corrections are preserved by appropriate clear-generated controls; clear-live text is independent of stored history. Missing keys never cause silent reset/replacement. Same-user malware, paging/crash dumps, external backups/exports, SSD physical erasure and provider retention are outside these guarantees.

The Windows app smoke uses an isolated installation profile and real SQLite/worker/native credential; the source transcripts and email response are explicitly deterministic fixtures. It verifies locked/no-database startup, real empty/history state, preferences/create/edit/revert/reopen, safe snippets/markup, full transcript paging/search/user labels, missing-model refusal, fresh capture consent on resume, deletion and lock cache clearing. Native save-dialog **choices**, clipboard **writes** and external email **opening** are mocked: actual selected test files are written/inspected, while the user's clipboard and email apps remain untouched. Arrow/Home tab navigation and compact 360-DIP/125% status/Stop bounds are automated; this does not replace human accessibility/DPI checks.

## Coverage of the 30 requested categories

| Requested categories | Evidence |
| --- | --- |
| 1–4 opt-in, temporary isolation, create/update | `meeting-controller`, `meeting-storage`, `meeting-history`; real app create/edit/restart |
| 5–7 encryption, keys, migrations | `meeting-storage`; actual native-key/compiled-worker integration |
| 8–10 dedup, ordering, crash saving | `meeting-storage/controller`; abrupt subprocess rollback and interrupted-run recovery |
| 11–14 search correctness, deletion, retention | `meeting-history/storage`; 1,105-segment continuation, 25-meeting pages, tags/dates/status, snippets, RAM-only cursors and cascades |
| 15–18 actions, decisions, unknown fields, summary | `meeting-ai/post-notes`; separately authorised genuine summary with exact quotes |
| 19–20 editing and protected regeneration | `meeting-history/ai/sharing`; UI save/revert/navigation, version/manual-provenance protection |
| 21–23 remote/Post consent and cancel | `meeting-ai/post-notes`, existing plan-provider token-renewal guard; no unapproved retry/empty call |
| 24–25 selected-meeting context and resume | `meeting-ai/history/controller`; up to three meetings/100 refs; fresh-capture-only association |
| 26–27 exports and follow-up | `meeting-sharing`; real chosen files and mocked native ports; labelled provider/UI follow-up fixtures |
| 28–29 account isolation and no capture on reopen | Scoped IPC before/after awaits, profile/cancellation/delayed-attachment/apply tests, worker separation, restart app checks |
| 30 P1–P7 regressions | All existing unit/provider/core/AI/speech/UI/intelligence checks retained; historical genuine evidence remains separately bounded |

The final review added six regression cases for temporary-draft attachment/changed text/profile cutoffs and async account changes during attachment/apply. They prevent old-profile content reappearing or older operations replacing newer draft state. Snapshot and pushed meeting-AI revisions now use one main sequence. Search dates/order match displayed start time (creation for drafts); global title sort is not advertised.

Three additional host tests run actual deterministic worker threads to verify immediate write/global-retention guard invalidation and worker termination when initial readiness fails. A fourth test verifies copied-key cleanup when SQLite cannot open a file. Failed opens now release their worker instead of retaining a waiting thread. The native/SQLite integration remains separate from these explicitly labelled RPC fixtures.

## Performance observations

One isolated Windows compiled-worker run (500 generated finals, no physical capture or remote calls):

| Observation | Measured |
| --- | --- |
| Meeting creation | 3.901 ms |
| Saving 20-final batch | mean 5.398 ms / p95 6.292 ms |
| Load saved meeting | 0.603 ms |
| Retrieve 100 final segments | 2.401 ms |
| Search through 500 encrypted segments for the last marker | 23.843 ms |
| SQLite size | 40,960 → 352,256 bytes |
| Isolated worker-test process RSS sample | 64,724,992 bytes; not full-app/endurance memory |
| Actual app edit-save / search UI | About 77 / 88 ms in the 42-assertion run; includes IPC/render scheduling, not a latency guarantee |
| Genuine summary | 11.028 s / 1,090 input + 795 output tokens |
| Successful synthetic summary speech | helper load 105 ms; average inference 476 ms; about 173 MB helper RSS; zero queued/dropped jobs/gaps at observation |

Limits are explicit: 25-row lists, 100-segment transcript pages, 30-match/1,000-scan transcript search, 25-meeting/1,000-segment/about-4M-character search work steps, at most 10,000 meeting IDs in unlocked search state, 20,000 segments/100 capture runs per record, bounded recorder/RPC queues and 100/12,000-character AI excerpts. SQLite's pinned Node API remains experimental. No long-session RSS/CPU/battery or real device/call performance guarantee is claimed; the 15-minute endurance gate remains open.

## P8 human Windows acceptance — still open

Every row below needs human acceptance on authorised real content. Automated/synthetic evidence is stated separately and is not a manual pass.

| # | Human scenario | Automated/limited evidence; remaining work |
| --- | --- | --- |
| 1 | Start and explicitly save a consented meeting | Synthetic save passes; human source/participant consent and real workflow pending |
| 2 | Physical microphone transcription | Real tiny.en synthetic path passes; actual mic/noise/devices pending |
| 3 | Windows system-audio transcription | Synthetic source regression passes; real routing/calls/overlap pending |
| 4 | End and reopen saved meeting | Actual worker/app restart and synthetic End pass; human full meeting pending |
| 5 | Generate real AI summary | Genuine short synthetic summary/Apply passed; real-call accuracy/quality pending |
| 6 | Edit and save notes | UI/optimistic save/revert pass; physical keyboard/Narrator/conflict usability pending |
| 7 | Inspect decisions/actions and unknown fields | One genuine supported decision/action passes; broader ambiguity/accuracy pending |
| 8 | Search real meeting history | Deep literal search/cursors/snippets pass; long-history/user usability pending |
| 9 | Ask about selected meeting(s) | Deterministic provider fixtures pass; genuine remote QA and human relevance pending |
| 10 | Export through native save dialog | Actual test files pass with dialog choices mocked; real dialog/drives/permissions pending |
| 11 | Draft/edit email and explicitly hand off | AI/UI/native ports mocked; actual mail handler, long drafts and human approval pending |
| 12 | Delete a meeting and derivative data | Actual SQL/app deletion and real test cleanup pass; human scope/export expectations pending |
| 13 | Restart and inspect persistence | Actual process restart passes; human multi-account Windows workflow pending |
| 14 | Confirm temporary sessions leave no saved content | Unit/no-database startup pass; human multi-session/retention observation pending |
| 15 | Confirm reopening never captures/resumes sharing | Actual app idle/consent gates pass; physical source/tray/hotkey check pending |
| 16 | Force shutdown during a saved real meeting | Subprocess transaction/recovery tests pass; full-app real-device forced-close recovery pending |
| 17 | DPI/keyboard/accessibility | Arrow/Home tabs and 360-DIP/125% bounds pass; mixed DPI/multi-monitor/Narrator/themes/opacity pending |
| 18 | P7 Live Assist with saved meeting controls | Existing P7 tests/previous genuine answer retained; human combined Live/Post/cooldown/expiry/cap/Pause/Stop/account checks pending |

Carry forward P1's user-confirmed incomplete Windows checks, P2 physical mic/loopback/calls, P3 base.en/ARM64/older CPUs, P5 human visual/DPI/accessibility, P6 physical shortcuts/real audio/accounts and P7 15-minute CPU/RSS/usability. Do not infer their acceptance from this milestone. Direct Gmail/send, hosted links/backend access controls, speaker identification and P9/P10 remain deferred.

Automatic approval review previously rejected deletion of the failed-test Temp folder `everyhint-p8-storage-kUp6R1` as “blocked by policy”, without a further reason. It remains untouched; no alternative deletion mechanism was used. The four restricted P6 editor profiles remain untouched too. This is separate from the two authorised test-meeting row deletions, which succeeded.

---

## Historical P7 verification

# P7 Automatic Conversation Intelligence verification — 2026-10-28

Baseline `e68bfe7`. P7.1, P7.2 and P7.3 were verified in order; design and intermediate gates are in [P7-intelligence.md](DECISIONS/P7-intelligence.md). P1–P6 hardware/visual/endurance acceptance remains open. No P8 records, new dependency, classifier/model download, raw-audio transfer, paid API fallback or automatic Claude request was added.

| Check | P7 result |
| --- | --- |
| `npm run check` | Generated theme/spec, strict TypeScript, zero-warning lint, **458 unit tests / 35 files**, production build pass |
| `npm run test:plan` | **5 passed**: real local HTTP/JWT/SSE and isolated Windows native-vault fixtures; no OpenAI inference |
| `npm run test:ai-sdk` | **6 passed**: installed Claude SDK against loopback fixtures; no paid requests |
| Electron core / AI / speech / UI / intelligence | **47 / 44 / 11 / 44 / 28 = 174 assertions**; source capture and suggestions are explicitly synthetic/labelled |
| `npm run speech:test` | Cached verified tiny.en and upstream JFK fixture; real native inference, 355/331 ms in one run; no physical microphone/playback |
| P7 real local audio path | Offline TTS question through synthetic microphone → actual PCM/VAD/Whisper → final question at heuristic 0.94 → suggestion; fixture-provider Live run reserved/completed once and closed at cap |
| Genuine automatic provider test | **One genuine gpt-6.1-sol automatic completion** from synthetic microphone → real Whisper, 8.995 s / 254 input + 221 output tokens; grant closed at cap |
| Production output | Main about 210 kB, renderer JS about 292 kB, CSS about 25 kB; original bundled fonts/tokens retained |

## Genuine automatic verification

**Genuine automatic OpenAI completion passed on 2026-10-28**, under the user’s separate replacement authorisation. After the real UI confirmed a one-minute, one-attempt Live grant, the fixture played “Why would you use a dictionary instead of a list?” through the synthetic microphone and actual local tiny.en Whisper. Its final transcript scored 0.94 and the central scheduler reserved exactly one automatic request. The real gpt-6.1-sol response completed in **8.995 seconds**, using **254 input / 221 output tokens**. It explained key–value lookup versus list positions/search and supplied illustrative Python without claiming execution. Completion required the provider’s terminal `response.completed` event. The attempt cap then closed the grant: one attempt, one completion, no active grant and queue depth zero.

The test observed and delegated the actual HTTPS transport, without a fake remote response. Exactly **one** Responses POST was observed; its body used gpt-6.1-sol, `store:false`, `stream:true`, `tools:[]`, `tool_choice:"none"` and `input_text` only. It contained one microphone-labelled transcript excerpt, no screenshot and zero history pairs. Physical microphone, system audio, unrelated windows, raw audio, API keys/fallback and paid Claude were excluded. No inference retry occurred. Whisper loaded in 107 ms and averaged 393 ms across two real jobs, with zero gaps/drops and about 173 MB worker RSS. The response latency and usage are single observations, not guarantees. This proves the automatic software/provider path with synthetic speech; physical devices/calls remain unverified. Ignored evidence: `artifacts/p7-live-replacement-result.json`.

The initial authorised test timed out without an automatic response. Local reproduction showed the question completed before the Live grant: the app correctly rejected that pre-existing question. Investigation found that source/Whisper readiness reached `getIntelligence()` but was not pushed to the renderer until new context arrived. This delayed the consent UI until speech had already been processed. The controller now publishes readiness independently of transcript changes; a regression test asserts that microphone startup and Whisper readiness enable the permission preview before any speech, with no request and no redundant identical publication. The replacement fixture starts playback only after the real UI grant is confirmed. Separate local diagnostics block inference at the transport and use clearly labelled fixture responses. They are not live-provider evidence.

No physical microphone/system playback, other windows, screenshot or previous history was used in P7's scripted audio test. Local TTS was generated offline, no speech/model download occurred, and the test app was closed to remove its Playwright-only media override. Preferences were restored, capture stopped, local test context cleared and mode returned to Manual. The four restricted P6 editor profiles were left untouched. Ignored local evidence includes `artifacts/p7-speech-check.json`, `p7-local-audio-debug.json`, `p7-local-live-gated-result.json` and the separately scoped live-result files. No credential, live response, WAV or capture is committed.

## Automated coverage for the 34 requested categories

Abbreviations: **local** = `tests/intelligence-local.test.ts`; **actions** = `tests/intelligence-actions.test.ts`; **live** = `tests/intelligence-live.test.ts`; **transport** = `tests/intelligence-plan.test.ts` and `tests/plan-provider.test.ts`; **Electron** = `scripts/smoke-intelligence.mjs`. Existing P1–P6 suites remain enabled.

| # | Required category | Verification |
| --- | --- | --- |
| 1 | Manual Mode | local/live: no analysis/automatic request; Electron startup/restart Manual |
| 2 | Auto-Hint Mode | local/actions/live/Electron: local detection, accept prepares review, no auto-submit |
| 3 | Live authorisation | live/transport: acknowledgement, exact binding/sources/limits, no capture-as-permission; readiness-before-speech regression |
| 4 | Session expiration | local/live: retention and wall/monotonic lease expiry, no renewal or clock rollback extension |
| 5 | Question detection | local/benchmark: interrogative/help rules and distinct authored evaluation fixtures |
| 6 | No punctuation | local: same final question eligible with/without punctuation |
| 7 | Duplicate questions | local/live: provisional/final, repeated normalized text and cross-source echo suppression |
| 8 | False positives | local/benchmark: statements/reported/rhetorical/unrelated/incomplete examples; low-confidence help review only |
| 9 | Transcript ordering | local: chronological current-session selected final events; stale/invalid source/time rejection |
| 10 | Screen changes | local: native-sized bounded grid, substantial difference and stable observation |
| 11 | Unchanged screen | local: hash skip, cursor-like noise/unstable frames suppressed; no question from a screen change alone |
| 12 | Correlation | local/actions: source/time/current screen and nearby excerpt IDs, no old-session leakage |
| 13 | Ranking | actions: max three stable candidates, freshness/relevance/confidence and repetition penalties |
| 14 | Dismissal | actions/Electron: dismiss/similar suppression within the session |
| 15 | Suggestion expiry | local/actions: TTL/retention/session reset and typed expiry events |
| 16 | Get Answer | actions/live/transport: same builder/controller/model path; manual review retained |
| 17 | Spoken-response suggestions | actions: selected-context eligibility and fixed talking-point instructions, no speech output |
| 18 | Follow-up suggestions | actions: reviewed fixed follow-up action; no automatic sending of suggested prompts |
| 19 | Recap | actions: no-context rejection and explicit retained-window notice; no P8 storage |
| 20 | Fact Check uncertainty | actions/Electron: specific claim, permanent unverified/context-only review/response metadata |
| 21 | Cooldown | live: at least configured interval, including late token/pre-send checks; fresh pending candidate only |
| 22 | Request limits | live/transport: conservative reservation cap including failures; closes at cap, no renewal |
| 23 | Cancellation | live/transport: screenshot/token races, stream guard, Cancel and removed utterances; no late response |
| 24 | Pause/Stop | live + existing capture/speech suites: epoch/lifecycle cancellation and no permission restoration |
| 25 | No requests after expiry | live/transport: exact expiry and post-token check before genuine provider POST |
| 26 | No Manual automatic requests | live: final eligible speech cannot submit in Manual |
| 27 | No Auto-Hint automatic requests | live/Electron: final eligible speech creates optional local suggestions only |
| 28 | Provider auth failure | live/plan-provider/AI: no retries, no automatic second provider |
| 29 | Image capability failure | live/transport/assist suites: unavailable/unknown capability blocks image scope; fresh-image races guarded |
| 30 | Rate limiting | live/plan-provider: explicit failure revokes, no usage retry or billing fallback |
| 31 | Account isolation | actions/live/transport: assistant/account/provider/model/capture bindings clear or revoke scope |
| 32 | Source selection | local/actions/live/transport: independently selected consented local/remote categories, exclusions and removed IDs |
| 33 | Unauthorised content | transport/AI/security/Electron: no shared credentials/raw audio/history/image outside scope, no arbitrary IPC, fixed official payload and untrusted reference data |
| 34 | P1–P6 regression | 367 baseline unit tests retained, plan/SDK/core/AI/speech/UI checks and real cached JFK inference |

Local-only Who returns unknown or escaped user-provided participant information without network/identity inference. Strict settings and action schemas reject forged IDs/ranges. Renderer-only suggestion/response fixtures are labelled and forged acceptance is rejected by main. Root Live status/Pause and remote Cancel remain accessible in Settings; restart restores neither mode/grant nor media capture. Narrow Live geometry was measured at 360×380 native DIP and 125% zoom (288×305 CSS viewport): question/top review/latest answer and footer fit without overlap/overflow. Each displayed button is also checked against the viewport; the intentionally offscreen unfocused skip link is excluded. Native Electron capture avoids the cropped CDP screenshot at nondefault zoom. Compact error text has its own row so it cannot squeeze the question out. This is one automated geometry fixture, not a physical mixed-DPI acceptance claim. Screenshots/reports are ignored under `artifacts/p7-*`.

## Performance observations and limits

- The classifier experiment used 22 authored development and 32 distinct authored English evaluation examples. Rules: 16 TP / 0 FP / 0 FN / 16 TN; unigram Naive Bayes candidate: 6 TP / 1 FP / 10 FN / 15 TN at 0.85. Production keeps rules; no model/dependency was justified. Small synthetic fixtures do not establish call accuracy or a 95% claim. Rule confidence is a heuristic score, not probability.
- One isolated run: 3,200 rule evaluations in 14.18 ms (mean 0.0044 ms, p95 0.0078 ms). 1,000 unchanged encoded-frame hashes took 6.67 ms with one 576-byte sample. That hash benchmark excludes native JPEG decoding. Test-process RSS was about 68.8 MB; negative heap delta reflects GC, not app savings.
- `npm run intelligence:screen-bench`: 50 actual native JPEG decode/resize/bitmap/sample operations on a generated 1600×900 gradient, 74,259-byte JPEG. Total 219.26 ms, mean 4.385 ms, p95 5.849 ms; 2,304-byte bitmap / 576-byte retained grid. Isolated Electron main RSS 266,559,488 bytes; 187 ms user + 78 ms system CPU. This is not steady-state whole-app memory or a 15-minute measure.
- Real local P7 dictionary-question fixture: 3.75-second PCM16 mono 16 kHz offline TTS; direct tiny.en load 122 ms/inference 351 ms, worker RSS about 172 MB. The gated synthetic-microphone capture run used two actual Whisper jobs, no gaps/drops, about 425 ms mean inference and 173 MB worker RSS. The labelled fixture provider's 1 ms response is not remote latency. JFK smoke measured load 96 ms, mean 377 ms over 12 jobs, queue 0, gaps/drops 0, about 174 MB worker RSS. CPU diagnostics are process totals and may exceed 100% across four threads.
- Local events/questions/recent text/seen IDs/suggestions are capped; identical frames skip decoding, provisional text cannot trigger, duplicate questions cannot retransmit during the grant, and queue depth is at most one. The native tray reads scalar indicators instead of cloning frame/transcript snapshots. Full-app CPU/RSS, real call precision/recall and long-run scheduling remain manual measurements.

## P7 Windows manual acceptance — all remaining human checks open

Use authorised non-sensitive content and consented participants. Inspect the exact in-app Live account/model/sources/limits before permitting remote sharing. Automated synthetic audio proves the software pipeline only.

1. **Startup/Manual:** restart; verify Manual, no capture, no grant and no automatic request despite saved local source/limit preferences. Make a normal reviewed P6 text/image request and verify unchanged acknowledgement/cancel/follow-up behaviour.
2. **Physical microphone:** consent/select the intended input, enable local Whisper and microphone analysis, choose Auto-Hint; speak complete and punctuation-free coding/work questions. Check final-source labels, useful suggestions, incomplete/rhetorical suppression and no remote activity.
3. **Windows system audio:** with consented playback/call audio, independently select system analysis; verify actual source routing/transcript and question detection. Ensure unshared microphone speech cannot trigger a Live request or enter its context.
4. **Both audio sources:** test simultaneous speech, speakerphone echo/repeated questions, ordering and duplicate suppression. Source labels must not imply speaker identity. Record false positives/misses rather than inferring real accuracy from authored fixtures.
5. **VS Code plus speech:** select the intended non-sensitive editor window and supported image model; ask a spoken code question. Check current source/time correlation and review/source isolation. Screen-only changes must not trigger remote inference or claim a recognized error/question.
6. **Stable screen changes:** move cursor/animate then switch substantial content. Verify noise/stability debounce, one optional review candidate and no repeated upload of identical images. Whole-monitor sources may include other visible apps; exclusions cover the entire selected handle, not masking inside it.
7. **Suggestions:** verify at most three, sensible ranking, keyboard focus/top review, Accept→frozen review→acknowledge→Ask, Dismiss, Dismiss Similar and TTL expiry. An old/forged/removed suggestion cannot be accepted.
8. **Actions:** review talking points/follow-up questions; Fact Check stays unverified without retrieval, Recap states selected retained context only, Who reports provided data/unknown without inventing identity. These do not create meeting records.
9. **Live consent before speech:** after capture/Whisper becomes ready, verify sharing choices enable before saying a question. Choose exact source/account/model and conservative limits, then acknowledge the separate scope. Local capture/transcription consent alone must not authorise remote sharing.
10. **Physical automatic answer:** in a deliberately authorised short Live session, speak a new complete question after the grant. Verify one automatic answer from the selected model, exact selected categories, visible status/counters/cancel and terminal completion. This physical test remains open despite any genuine provider test with synthetic audio.
11. **Follow-up:** ask another fresh question after cooldown. Optional history must include only bounded current-session text when explicitly permitted; old images/transcripts are never silently reattached.
12. **Cooldown/cap:** speak several questions; confirm one active request, at most one fresh pending candidate, no stale backlog, minimum 30-second interval and conservative failed-attempt count. Reaching cap ends sharing; no automatic renewal or paid fallback.
13. **Expiry/catalog/auth:** test a short lease and lost/expired model/auth access. No request may start after expiry. The five-minute catalog can stop a longer grant early; explicit refresh/reselect/renew is required, and model/account changes clear prior context.
14. **Immediate controls:** use root Pause Live and remote Cancel during preparation/streaming, then capture Pause/Stop via UI/tray/global shortcuts while hidden. Verify cancellation, cleared scope and no late answer; capture Resume never restores Live permission.
15. **Permission/device/source loss:** remove screen capture permission, disconnect microphone/playback, mute a shared input, change selected window/source/exclusion or settings. Verify safe stop/revocation and no fallback to unrelated windows/sources.
16. **Lifecycle/account isolation:** switch account/provider/model, Clear, lock/suspend/wake, reload/crash/quit/restart during pending work. Nothing resumes automatically or enters the new session/account.
17. **Compact/expanded/dashboard:** exercise suggestions, answer updates, hidden Settings/panels, persistent root Live/Pause/Stop/Cancel and tray/title state between requests. Preserve manual draft/review; layout changes never grant permission.
18. **Windows visual/accessibility:** themes/opacity, physical global shortcuts, Narrator/high contrast/keyboard focus, mixed 100/125/150/200% DPI, multi-monitor dragging/resizing and tiny work areas. Carry forward every pending P5/P1 visual check.
19. **Hardware/endurance:** real consented conversations for 15 minutes; record main/renderer/worker CPU/RSS, question precision/recall, suggestion/request frequency, latency, queue/drop/gap counts and controls under load. Base.en, ARM64 and older-CPU builds remain unverified; retain P1–P3 checklists below.

## Known limitations and unresolved release acceptance

English rule cues can miss questions or produce false suggestions; fixed keyword cues have no custom list editor. Perceptual visual changes provide no OCR/semantic/error classification. There is no multilingual/diarisation model, person research, external factual retrieval, full-session recap or saved meeting memory. Content on a whole monitor cannot be selectively masked by source exclusions. In-scope content may be sent automatically while an explicitly granted lease is active; Pause cannot recall data already transmitted. Subscription request counts are not prices. No unresolved implementation finding remains in the tested permission boundary; this is not an independent security audit. Distribution eligibility, Anthropic subscription approval and the physical/visual/endurance release gates remain unresolved. No paid Claude request or P8 implementation is authorised by this delivery.

---

# P6 Screen-Aware Assist verification — historical record, 2026-10-28

Baseline `f00bf2a`. P5 human Windows/visual acceptance remains open. P6 extends the existing capture/context/provider pipeline; it adds no automatic inference, raw-audio transfer, paid fallback or model/tool execution. No dependency or model download was added.

| Check | P6 result |
| --- | --- |
| `npm run check` | Passed: generated theme/spec consistency, strict TypeScript, zero-warning ESLint, **367 unit tests / 30 files**, production build |
| `npm run test:plan` | **5 passed**, actual local OAuth/JWT/catalog/review/SSE HTTP and isolated Windows vault fixtures; no OpenAI calls |
| `npm run test:ai-sdk` | **6 passed**, installed Claude SDK against loopback fixtures; no paid requests |
| Electron core / AI / speech / UI | **47 / 44 / 11 / 44 assertions passed**, total **146**; synthetic capture, labelled renderer fixtures, real cached tiny.en through synthetic audio |
| `npm run speech:test` | Real cached upstream JFK speech transcribed correctly through microphone/system fixture paths; about 514/545 ms inference in this run |
| Production build | Passed: main about 157 kB, renderer JS about 273 kB, CSS about 24 kB; offline fonts/licences retained |
| Genuine P6 image plus follow-up | **Both completed with gpt-6.1-sol**, separately authorised as exactly two plan-backed inference requests; details below |

## Genuine image and multi-turn evidence

The user explicitly authorised opening the harmless [Python sample](../examples/p6_dictionary.py) in a new VS Code window, capturing only that window and making two ChatGPT-plan inference requests. EveryHint restored its own OS-vault registration, explicitly fetched the current account catalog and selected image-capable **gpt-6.1-sol**. The test used the actual Get Answer → frozen preview → fresh acknowledgement → Ask UI, not an injected provider reply.

The selected source was **p6_dictionary.py - Visual Studio Code**. Its real fresh JPEG was **1440×900 / 52,459 bytes**. The preview was visually inspected; it showed only the sample editor, no EveryHint recursion or unrelated application. Capture was paused after the review. The first approved question asked for an explanation of the visible function, function name and sample result, with no transcripts/history. It completed with **1,803 input / 321 output tokens**, first text **3.190 s**, total **9.346 s**. The real answer identified `count_colours(colours)`, explained `counts.get(colour, 0) + 1`, and derived `{'red': 3, 'blue': 2, 'green': 1}`. It correctly stated that no execution output was visible and did not claim to run the code.

The second approved question was **Why did it use a dictionary?** A new review contained exactly the preceding question/answer pair, no screenshot and no transcripts; it required fresh acknowledgement. It completed with **571 input / 195 output tokens**, first text **3.142 s**, total **7.583 s**. The answer explained colour keys/count values, direct updates and average O(1) lookup; it explicitly said it relied on the previous answer because no screenshot was present. Both controller completions required the real terminal `response.completed` event. These are single observations, not latency/quality/usage guarantees for every model/account.

Exactly **two inference requests** were made, with no inference retry, API-key/provider fallback, microphone, system audio, raw audio or paid Claude request. Initial test-editor startup attempts stopped before capture/inference; their explicit catalog requests did not submit questions. Capture was **STOPPED** afterwards, clearing source consent/frame/review/conversation; the temporary screenshot was deleted. Text/usage/timing evidence is ignored at `artifacts/p6-live-result.json`. No captured image, credential or live result is committed. The app remains open on the P6 build with capture stopped. Other models/accounts, real audio-backed assistance and broad human acceptance remain unverified.

## Automated P6 coverage

| Required area | Evidence |
| --- | --- |
| Manual trigger; no automatic inference; shortcuts/conflicts | `hotkeys`, `assist-context`, `ai-controller` unit suites; AI/UI Electron checks; compact Assist event is simulated, not a physical-key claim |
| Context selection/removal/privacy; final filtering/order/deduplication; four windows and size bounds | `assist-context`, `ai-context`, `ai-controller`; removed utterance IDs stay excluded within the conversation; removal invalidates approval |
| Screenshot state/freshness/resolution/bytes; image capability/body | `session`, `capture`, `electron-capture`, `assist-context`, `assist-plan`, `plan-provider`; actual native thumbnail fitting and current-generation shared snapshots |
| Streaming Markdown/code/copy; cancellation/stale updates | `assist-markdown`, `ai-controller`, `plan-provider`; renderer smoke covers headings/lists/tables/labels/per-code copy/incomplete streaming safely |
| Follow-up/regenerate; account/provider isolation | `assist-plan` runs the shared builder/controller and actual ChatGPT provider with synthetic HTTP for image→text history; controller/account suites cover clearing and stale work |
| Rate/network/auth errors; no file/tools authority/fallback | Existing provider/SDK/security suites and actual loopback HTTP/native-vault tests retained |
| P1–P5 regression | Core/AI/speech/UI smoke, real cached Whisper, theme/contrast/migration/spec tests and build |

Strict screen-state validation exposed an old synthetic HTTP fixture marked IDLE; its selected-image case now correctly represents ACTIVE authorised capture. JPEG byte/header/dimension validation uses the documented synthetic white test fixture, not a saved user screenshot. Capture regression also verifies that a queued snapshot cannot issue a new native call after Stop. Regenerate completion replaces its original history entry. Tests use isolated profiles/vault fixtures and checked cleanup paths, with no production fixture mode or arbitrary IPC added. Test/preview artifacts stay ignored. Native enumeration may transiently thumbnail other sources of the chosen kind; only the selected frame is retained/sent, so exclusive OS acquisition is not claimed.

Automatic approval review rejected deletion of the four unused isolated editor setup profiles under Windows Temp (policy block). They remain outside the repository and EveryHint credential store; automated smoke-test profiles and native-vault fixtures were cleaned normally. The live screenshot itself was deleted successfully.

The final build was reopened after verifying the live-test session was idle: capture IDLE, empty review/history, its own ChatGPT plan connection restored, zero startup model discovery/inference, and all five native chords registered. Physical keyboard acceptance is still separate. Models must be explicitly refreshed/selected after restart, as before.

## P6 Windows manual acceptance -- remaining human checks

1. Open the rebuilt EveryHint and sign in to its own ChatGPT registration; grant plan permission. Expand connection settings, explicitly refresh models and choose a currently listed image-capable model. A restored account/model test does not replace fresh browser lifecycle acceptance.
2. Open [examples/p6_dictionary.py](../examples/p6_dictionary.py) in VS Code at readable font size. In EveryHint enable screen-only consent, acknowledge authorisation, enumerate sources and choose that external VS Code **window**. Start capture; avoid unrelated/private sources.
3. Expand the assistant, choose Code Assist, select Fresh authorised screenshot and ask “Explain what this Python function does.” Click Get Answer. Inspect source name, fresh timestamp, dimensions/bytes, exact text and image. For a whole-screen source, pause to inspect its frozen image; an application window avoids recursive previews. New image acquisition while paused/stopped must fail.
4. Remove unwanted image/excerpts/exchanges; each removal must reset approval. Acknowledge the inspected remote transfer and Ask only when authorised. Verify the real answer refers to the visible `count_colours`, `.get` update and sample counts. Steps 2–4 passed once with the automated driver and genuine provider; broad human/window/DPI acceptance remains open.
5. Click Ask follow-up and ask “Why did it use a dictionary?” Review only the selected previous exchange, with image/audio selectors off. Acknowledge and submit. This passed once genuinely as recorded above; new remote checks need their own authorisation.
6. In a separately consented audio session enable local Whisper. Select microphone/system/both/neither; try 30/60/180/300 seconds and inspect final chronological source/time-labelled text. Remove an excerpt; it must stay excluded in later reviews. No raw audio or invented system speaker identity is permitted. Real audio/call-backed assistance remains pending.
7. Change Assist and Clear context chords in Settings. Try a duplicate Pause/Stop chord (reject without changing preferences), a valid chord and an OS conflict (visible unavailable status). From another app and compact mode, trigger Assist: expand/focus and prepare selected context for review, with no inference. Test focus-only Ctrl+Enter. Physical chords remain pending.
8. Read streaming headings/lists/tables/code and incomplete fences; copy one block and the whole response. HTML/links/images stay inert text. Check compact latest answer/provider/status/Expand at 100/125/150/200% Windows scaling, with Pause/Stop and remote Cancel accessible.
9. With separately authorised requests, cancel generation; no late update may enter a cleared/new conversation. Regenerate must create a new review/approval without silently reattaching old images/transcripts. A source-only answer may need a new question/context. An unchanged submitted image is rejected; use text history, an updated source or explicit Clear for a new conversation.
10. Clear by button and shortcut; verify draft/review/history disappear. Pause/Stop independently control capture; Stop clears consent/frame/review. Check source disappearance, resume and restart. The live test verified Pause and final Stop for one real VS Code window only.
11. Switch model/provider/ChatGPT account, sign out/reconnect and confirm old account context cannot enter a new review. Verify no automatic request or billing fallback. Expired model catalogs require explicit refresh/selection and reset context. Broad real account lifecycle acceptance remains open.
12. Retain the earlier P1–P5 checklist: real devices/playback/consented calls, mute/tray, Narrator/high contrast/keyboard, themes/opacity, mixed-DPI dragging/resizing, base.en, ARM64/older CPU and 15-minute CPU/RSS/stability. No fixture or single live image closes those checks. P7 has not started.

---

# P5 UI foundation verification -- historical record, 2026-10-28

Baseline e7b3e38; this task changes product documentation, appearance and the connected desktop shell. **No new live AI/authentication request, paid API request or real desktop/audio capture was made.** Existing P4.2 genuine ChatGPT evidence below remains historical provider evidence, not a new UI-test claim. Capture/transcription/provider implementations, OS token storage and trusted IPC security boundaries are preserved.

| Check | Result |
| --- | --- |
| Theme/spec generation consistency | Passed; checked by npm run check |
| Strict TypeScript and zero-warning ESLint | Passed |
| Unit/regression suite | **315 passed in 27 files**, retaining all 298 baseline cases; 14 presentation/contrast/migration and 3 specification cases added |
| UI visual/interaction smoke | **41 assertions passed**, five app-only screenshots; no remote requests or real capture |
| Existing core Electron smoke | **47 assertions passed**, synthetic capture/source combinations |
| Existing assistant Electron smoke | **37 assertions passed**, auth/consent/IPC rejection and labelled renderer fixtures |
| Existing speech Electron smoke | **11 assertions passed**, real tiny.en through both synthetic P2 sources |
| Real native vault/local HTTP plan tests | **5 passed**, synthetic OAuth/JWT/model/SSE and actual isolated Windows credential storage |
| Installed Claude SDK loopback tests | **6 passed**, streaming/cancel/tool denial; not paid provider authentication |
| Offline speech inference | Passed twice on cached real JFK fixture through one loaded tiny.en helper |
| Production build | Passed; main about 146 kB, renderer JS about 266 kB, CSS about 23 kB; local font assets 1.68 MB |
| Font distribution | Six original local faces bundled; both SIL OFL notices present in out/renderer/licenses/fonts |
| EverySession non-modification | SHA-256 of all 15 inspected source/assets unchanged; HEAD 1256e54dffebfd7b839d8b4b849dd62d22f372e5 and clean Git unchanged |

Electron assertions total **136** (47 + 37 + 11 + 41). The long-running separate EveryHint instance held the global shortcuts during isolated tests; conflicts were correctly reported with overlay/tray fallbacks. This is not proof of physical hotkey behaviour. Test profiles are temporary and removed with checked paths; isolated native vault fixtures are cleaned up. No production fixture mode or arbitrary IPC/test endpoint is added.

## New coverage and visual evidence

- Actual renderer EverySession red, loaded Inter/Poppins font faces, Light/Dark/System and reduced motion.
- Actual native opacity, layout resizing, monitor-bound geometry, per-view dimensions and legacy version-1 preference migration.
- Eight dashboard destinations with truthful planned states; no dummy meetings/analytics/connections.
- Composer/review preserved through navigation, settings and panel collapse; focus-only Ctrl+Enter and compact Quick Ask send nothing.
- Focus skip control preserves the exact trusted URL; root remote cancellation remains visible in Settings/planned pages; emergency controls remain within the minimum window at 125% zoom.
- Semantic text/action/status/focus/control contrast, no palette literals in component CSS, generated token/spec consistency and exactly 103 complete inventory records with valid action mappings.
- Network is forbidden during the UI scenario; capture remains IDLE, inference history remains empty, and only appearance is persisted.

Screenshots under ignored artifacts/ui/: dashboard-light.png, dashboard-dark.png, assistant-light.png, compact-light.png, narrow-settings-light.png. Reports: artifacts/ui-smoke.json and existing core/AI/speech fixture reports. Screenshots are inspected app-only captures; visual regression assertions use rendered colours/fonts/geometry/interactions rather than machine-specific pixel-perfect golden files. Human visual parity/acceptance is not claimed.

Run:

```powershell
npm run check
npm run smoke:ui
npm run smoke
npm run smoke:ai
npm run test:plan
npm run test:ai-sdk
npm run speech:test
npm run smoke:speech
```

No model/runtime/font download is needed for these checks on the current workspace. tiny.en/runtime/JFK were previously authorised and cached. The fonts are now repository assets with notices. Regenerate tokens with npm run theme:build and inventory Markdown with npm run spec:build; check rejects stale generated files.

## Manual Windows visual and interaction acceptance -- still pending

1. Compare the actual EverySession app with EveryHint Light: red #E01A34, warm neutral cards/borders, Poppins/Inter hierarchy, pill buttons and compact spacing. Review dark mode as a desktop extension, not a canonical EverySession palette. Confirm logo distinction.
2. Review all three layouts at 100/125/150/200% Windows display scale; test mixed-DPI monitors, negative monitor coordinates, docking changes, moving/resizing and a 360px minimum native window. Confirm controls/text reflow rather than overlap.
3. Use keyboard only: skip control, all eight destinations, panel summaries, composer focus, consent checkboxes, provider/model selection, copy/cancel and capture Pause/Stop. Check Narrator and Windows high contrast. Ctrl+Enter opens only the composer while focused; existing global shortcuts retain their roles.
4. Change Light/Dark/System; change the real OS theme while running; restart and confirm local preferences. Check native opacity at 80/85/100% against varied wallpaper/apps; full-opacity contrast tests cannot guarantee lower-opacity contrast against arbitrary backgrounds.
5. Drag each layout using the titlebar; verify buttons are not drag handles. Compact overlay shows latest provider/answer and all source states with notices condensed; Quick Ask and emergency controls stay visible. Inspect active remote status/cancel on Home, Settings and planned pages using a separately authorised real request only if desired.
6. Preserve a draft and frozen review through navigation/theme/panel collapse. Explicit Clear and capture/account changes retain their established clearing policy. Review expiry still applies. Future pages must contain no fake records or enabled integrations.
7. In a consented real session, verify screen/window/mic/Windows playback, partial/final local transcript, per-source states/mute and pause/stop. Verify capture persists while intentionally hidden and the tray remains clear. Test shortcut conflicts and missing tray behaviour.
8. Check the already configured ChatGPT connection survives the UI upgrade without token exposure. Account switching/sign-out/revocation, real screenshot/transcript transfer and broad model acceptance remain pending. Do not make a paid Claude or new model test without separate permission.
9. Keep the earlier physical-device/call/base.en/ARM64/older-CPU and 15-minute combined CPU/RSS/queue/stability checks open. Public distribution, signing, updates and release approval belong to P13, not this milestone.

---

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
