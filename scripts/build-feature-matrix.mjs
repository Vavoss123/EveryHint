import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const { features, asOf, baseline } = JSON.parse(
  await readFile(resolve(root, "resources/feature-inventory.json"), "utf8"),
);
const statuses = [
  "NOT STARTED",
  "PLANNED",
  "IMPLEMENTED",
  "AUTOMATED VERIFIED",
  "MANUAL VERIFIED",
  "BLOCKED",
  "COMPLETE",
  "OUT OF SCOPE",
];
const sourceStates = ["CURRENT", "HISTORICAL", "ENTERPRISE-ONLY", "UNVERIFIED"];
const sources = {
  DESKTOP: ["Cluely public desktop site", "https://cluely.com/"],
  LIVE: [
    "Cluely Live Insights",
    "https://docs.cluely.com/feature/liveinsights",
  ],
  SETTINGS: ["Cluely Settings", "https://docs.cluely.com/feature/settings"],
  AUDIOREF: [
    "Cluely audio configuration",
    "https://docs.cluely.com/debugging/audio",
  ],
  NOTES: ["Cluely Meeting Notes", "https://docs.cluely.com/feature/postcall"],
  MODES: ["Cluely alternate public product site", "https://new.cluely.com/"],
  PRECALL: [
    "Cluely Pre Call Briefs",
    "https://docs.cluely.com/feature/precall",
  ],
  PEOPLE: [
    "People Search and Memory launch, 2025-09-13",
    "https://cluely.com/blog/people-search-live",
  ],
  KNOWLEDGE: [
    "Cluely enterprise Knowledge Base",
    "https://docs.cluely.com/enterprise/knowledgebase",
  ],
  INTEGRATIONS: [
    "Cluely enterprise CRM/ATS",
    "https://docs.cluely.com/enterprise/integrations",
  ],
  COACHING: ["Cluely Coaching", "https://docs.cluely.com/feature/coaching"],
  CUSTOM: [
    "Cluely enterprise Customization Suite",
    "https://docs.cluely.com/enterprise/customizationsuite",
  ],
  ADMIN: [
    "Cluely enterprise Admin Training",
    "https://docs.cluely.com/enterprise/admintraining",
  ],
  MOBILE: [
    "Cluely iPhone publisher listing",
    "https://apps.apple.com/us/app/cluely-ai-notetaker/id6755442775",
  ],
  REQ: [
    "User master specification; vendor support not established",
    "PRODUCT_SPEC.md",
  ],
  EH: [
    "EveryHint implementation and P4.2 evidence; not a competitor claim",
    "TESTING.md",
  ],
};
if (
  features.length !== 103 ||
  new Set(features.map((item) => item.id)).size !== 103
)
  throw new Error("Expected exactly 103 unique features.");
for (const [index, item] of features.entries()) {
  if (
    item.id !== `EH-${String(index + 1).padStart(3, "0")}` ||
    !statuses.includes(item.status) ||
    !sourceStates.includes(item.referenceState) ||
    !sources[item.reference] ||
    Object.values(item).some(
      (value) =>
        typeof value !== "string" || !value.trim() || value.includes("|"),
    )
  )
    throw new Error(`Invalid inventory requirement ${item.id}.`);
}
const groups = [
  [1, 14, "A. Desktop assistant"],
  [15, 27, "B. Live conversation intelligence"],
  [28, 43, "C. Meetings and history"],
  [44, 55, "D. AI modes and personalisation"],
  [56, 66, "E. Calendar, people and memory"],
  [67, 81, "F. Settings and desktop utilities"],
  [82, 97, "G. Enterprise and teams (permanently removed)"],
  [98, 103, "H. Mobile"],
];
const counts = Object.fromEntries(
  statuses.map((status) => [
    status,
    features.filter((item) => item.status === status).length,
  ]),
);
let text = `# EveryHint requirements coverage matrix\n\nAudit date: ${asOf}; baseline ${baseline}; P11 Windows release preparation evidence (2026-10-29) included; reference audit date above remains historical; P1–P10 limitations retained. **103** historical requirements including **16 permanently removed enterprise rows**; mobile unstarted, with no duplicate completion credit for named actions. Source data: [feature-inventory.json](../resources/feature-inventory.json). Regenerate with npm run spec:build; check with npm run spec:check.\n\n## Status and evidence rules\n\n- **OUT OF SCOPE:** permanently removed enterprise requirements; retained only for traceability, never planned work.\n- **NOT STARTED:** no implementation/design work beyond the inventory.\n- **PLANNED:** future phase, workflow, dependencies and acceptance are specified; implementation absent.\n- **IMPLEMENTED:** working code exists for the described scope, but partial capability or acceptance gaps remain.\n- **AUTOMATED VERIFIED:** the described implemented scope passes the referenced tests; hardware/manual acceptance may remain.\n- **MANUAL VERIFIED:** a human-authorised real workflow has been observed for the stated provider/platform scope; other variants may remain.\n- **BLOCKED:** an external approval, capability or dependency prevents that scope; reasons must be recorded.\n- **COMPLETE:** full acceptance plus required automated/manual verification and dependencies satisfied. No row is currently marked COMPLETE.\n\nCounts: ${statuses.map((status) => `${status}: **${counts[status]}**`).join("; ")}. Higher verification status does not erase a row's explicit limitations. A navigation page, disabled selector or fixture reply cannot establish feature completion.\n\n**Reference status is separate from EveryHint status.** CURRENT means official public documentation was accessible on the audit date, not that a live Cluely account or every plan was tested. HISTORICAL marks dated launch/compatibility behaviour; current availability is not inferred. ENTERPRISE-ONLY identifies enterprise documentation, with packaging/access unverified. UNVERIFIED means the supplied product requirement or EveryHint-specific feature was not established as a current competitor capability. No third-party clone, cluelyai.com, trycuely.com or unrelated brand was treated as the official product. The old widget/invisibility compatibility claims are not inherited as universal EveryHint promises.\n\n## Test evidence legend\n\n| Code | Actual evidence |\n| --- | --- |\n| CAP | tests/session.test.ts, capture/electron-capture/hotkeys/security tests; scripts/smoke.mjs |\n| AUDIO | audio-session/engine/host/processing/permissions tests; synthetic P2 source combinations in core smoke |\n| SPEECH | transcription-controller/pcm/segmenter/transcripts/worker/model tests; real tiny.en fixture; smoke-transcription.mjs |\n| AI | ai-context/controller/providers and plan-provider tests; scripts/smoke-ai.mjs; no paid live Claude proof |\n| PLAN | tests/plan.integration.ts: actual local HTTP/JWT/SSE and native OS vault; fixture replies only |\n| ACCOUNT | plan-oauth/accounts/vault tests; genuine ChatGPT browser sign-in/restart and one text reply in P4.2 |\n| ASSIST | tests/assist-context, assist-markdown, assist-plan and ai-controller: fresh images, selected final transcripts, review/removal, presets, actual transport fixtures, history/isolation and safe streaming; AI/UI Electron checks |\n| INTEL | tests/intelligence-local/actions/benchmark: rules, authored classifier comparison, stability/correlation, seven reviewed/local actions, ranking/dismiss/expiry and privacy; scripts/smoke-intelligence.mjs |\n| LIVEAUTO | tests/intelligence-live/plan plus plan-provider: consent, scheduling, source/account/model/token races, expiry, cancellation, cooldown/cap, no retries; genuine outcome separately in TESTING.md |\n| PRESENT | tests/presentation.test.ts: migration, validated preferences, monitor bounds and contrast |\n| UI | scripts/smoke-ui.mjs: real Electron layouts/theme/opacity/fonts/navigation/draft/focus/privacy checks and screenshots |\n\nManual cells deliberately retain real Windows, model/provider and long-run limitations. Live capture Resume and P8 saved-meeting Resume are separate; source/user-supplied labels are not inferred identity; Clear live text does not delete stored history. Tests listed for partial rows verify only the stated subset.\n`;
text +=
  "\nP8 evidence: **MEETINGS** = meeting-storage/controller/history tests and compiled worker/native-vault integration; **MEETINGAI** = meeting-ai/post-notes plus actual plan-provider pre-POST guards (genuine summary outcome separately in TESTING.md); **MEETINGSHARE** = meeting-sharing tests with actual chosen test files and mocked native external ports; **MEETINGUI** = scripts/smoke-meetings.mjs with real encrypted SQLite/IPC/worker, labelled transcript/email fixtures, no physical capture or remote requests. Hosted links/direct Gmail remain partial/deferred.\n";
text +=
  "\nP10 evidence: **CONTEXT** = google-oauth/calendar/people/memory/workspace-ai/workspace-export tests; scripts/smoke-context.mjs uses actual Electron/preload/encrypted workers/native vault with explicit Google/browser/toast fixtures (no genuine Google access or inference); scripts/benchmark-context.mjs and the no-network brief dry-run. Genuine Google and ChatGPT results are reported separately in TESTING.md, never inferred from fixtures.\n";
text +=
  "\nP9 evidence: **PERSONAL** = modes/knowledge/templates/personal-integration/personal-storage unit tests; scripts/smoke-personal.mjs (actual isolated extraction, encrypted SQLite and native key); scripts/benchmark-personal.mjs; two separately authorised genuine gpt-6.1-sol requests documented in TESTING.md. Source citations identify supplied excerpts, not semantic verification. Multilingual Whisper remains deferred.\n";
text += "\nP11 evidence: **WINDOWS** = window-privacy/runtime-integrity tests, scripts/smoke-windows.mjs and smoke-packaged.mjs, package audit, controlled real-time 30-minute capture/Whisper/mock Live reports. See [P11 acceptance matrix](P11_ACCEPTANCE.md) for measured scope and pending hardware, clean installation, signing and release gates. Configuration does not certify receiver privacy.\n";
for (const [first, last, label] of groups) {
  text += `\n## ${label} (${last - first + 1})\n\n| ID | Feature | Description / actual scope | Intended workflow | Target | EveryHint status | Dependencies | Acceptance criteria | Automated coverage | Manual verification | Source/reference | Reference state |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const item of features.slice(first - 1, last))
    text += `| ${[item.id, item.name, item.description, item.workflow, item.milestone, item.status, item.dependencies, item.acceptance, item.automated, item.manual, `[${item.reference}]`, item.referenceState].join(" | ")} |\n`;
}
text += `\n## I. Contextual actions (mappings, not additional features)\n\n| Named action | Inventory mapping | Current scope |\n| --- | --- | --- |\n| Get Answer | EH-002, EH-003, EH-004 | Manual/Auto-Hint use the shared review; separately granted Live can answer fresh eligible final spoken questions |\n| What Should I Say Next? | EH-025, EH-026 | Reviewed selected-context talking-point action; no automatic speech |\n| Suggest Follow-up Questions | EH-005, EH-024 | Reviewed bounded history continuation plus dedicated follow-up-question action |\n| Fact Check | EH-071 | Specific-claim, permanently unverified context-only assessment; no independent retrieval |\n| Who Am I Talking To? | EH-061, EH-062 | Local user-provided participant information or unknown; research/biometric identity absent |\n| Recap | EH-028, EH-029 | P7 retained-window action plus separate P8 saved/temporary summary review and independently granted End notes |\n| Dynamic Action | EH-022, EH-023, EH-024 | Local ranked question/keyword/stable-screen candidates; Accept prepares the shared reviewed action |\n| Clear Context | EH-004, EH-005, EH-077 | Clear conversation button and configured global shortcut cancel and reset local memory |\n| Copy Response | EH-070 | Explicit plain-text clipboard action exists |\n\n## Provider readiness within EH-080 (not extra inventory rows)\n\n| Scope | Status | Evidence / limitation |\n| --- | --- | --- |\n| ChatGPT official plan registration and gpt-6.1-sol text inference | MANUAL VERIFIED | User-authorised text reply plus P6 real image explanation/text follow-up on 2026-10-28; P7 one-request automatic answer and P8 genuine summary/review/Apply via synthetic mic/real Whisper also verified; physical audio and other models/account/source variants require acceptance |\n| Claude restricted API adapter | AUTOMATED VERIFIED | Installed SDK against local fixtures; separate billing opt-in off; live paid authentication unverified |\n| Claude subscription sign-in for distribution | BLOCKED | Anthropic approval required; no approval claimed; unavailable control is not working auth |\n| Enterprise | OUT OF SCOPE | Permanently removed; no backend or future milestone |\n| Mobile | NOT STARTED | Outside P11; no mobile implementation |\n\n## Public references inspected\n\n`;
for (const [key, [label, url]] of Object.entries(sources))
  text += `- [${key}]: [${label}](${url}).\n`;
text +=
  "\nOfficial enterprise pages describe requirements, not approvals for EveryHint. Dated People Search launch material is historical. The mobile publisher lists iPhone capability; EveryHint mobile platform and implementation are still undecided. Settings/docs contain older dates and compatibility limitations; current account availability was not tested. Exact email-client integration, personal templates, web tool access and EveryHint-specific utilities remain explicitly unverified where primary evidence was insufficient.\n\n";
for (const [key, [, url]] of Object.entries(sources))
  text += `[${key}]: ${url}\n`;
const target = resolve(root, "docs/FEATURE_MATRIX.md");
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== text)
    throw new Error("Feature matrix is stale. Run npm run spec:build.");
} else await writeFile(target, text);
