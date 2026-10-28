import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import electron from "electron";
import { _electron } from "playwright-core";
const project = resolve(import.meta.dirname, ".."),
  profile = await mkdtemp(join(tmpdir(), "everyhint-p8-ui-")),
  env = {
    ...process.env,
    EVERYHINT_TEST_USER_DATA: profile,
    EVERYHINT_SPEECH_HOME: join(profile, "speech"),
  };
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
let desktop,
  page,
  assertions = 0,
  keyCreated = false;
const errors = [],
  performanceResults = {};
function check(value, label) {
  assert.ok(value, label);
  assertions++;
}
async function start() {
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  page = await desktop.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".capture-controls"),
  );
  await desktop.evaluate(({ dialog, shell, clipboard }) => {
    globalThis.__meetingRemoteCalls = 0;
    globalThis.__meetingNative = {
      savePath: null,
      saveOptions: [],
      emails: [],
      clipboard: [],
    };
    dialog.showSaveDialog = async (...args) => {
      globalThis.__meetingNative.saveOptions.push(args.at(-1));
      return {
        canceled: globalThis.__meetingNative.savePath === null,
        filePath: globalThis.__meetingNative.savePath ?? undefined,
      };
    };
    shell.openExternal = async (url) => {
      globalThis.__meetingNative.emails.push(url);
    };
    clipboard.writeText = (text) => {
      globalThis.__meetingNative.clipboard.push(text);
    };
    globalThis.fetch = async () => {
      globalThis.__meetingRemoteCalls++;
      throw Error("No remote requests authorised in meeting UI smoke.");
    };
  });
  await page.evaluate(async () => {
    const r = await window.everyhint.getSnapshot();
    if (!r.ok) throw Error(r.error);
    const changed = await window.everyhint.saveSettings({
      ...r.value.settings,
      layout: "dashboard",
      compact: false,
    });
    if (!changed.ok) throw Error(changed.error);
  });
  await nav("Meetings");
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function call(method, input) {
  return page.evaluate(
    async ({ method, input }) => {
      const state = await window.everyhint.meetings.getState();
      if (!state.ok) throw Error(state.error);
      const r = await window.everyhint.meetings[method]({
        scopeId: state.value.scopeId,
        input,
      });
      if (!r.ok) throw Error(r.error);
      return r.value;
    },
    { method, input },
  );
}
async function state() {
  const r = await page.evaluate(() => window.everyhint.getSnapshot());
  assert.ok(r.ok, r.error);
  return r.value;
}
async function shot(name) {
  await page.screenshot({ path: `artifacts/ui/p8-${name}.png` });
}
try {
  await mkdir("artifacts/ui", { recursive: true });
  await start();
  check(
    await page
      .getByLabel("Locked meeting history", { exact: true })
      .isVisible(),
    "startup shows locked history and no fabricated records",
  );
  const startup = await page.evaluate(() =>
    window.everyhint.meetings.getState(),
  );
  check(
    startup.ok &&
      !startup.value.preferences.enabled &&
      !startup.value.preferences.autoSave,
    "temporary and auto-save-off defaults",
  );
  let files = [];
  try {
    files = await readdir(join(profile, "meetings"));
  } catch {
    /* No history directory exists before the first explicit unlock. */
  }
  check(
    !files.some((name) => name.endsWith(".sqlite")),
    "opening Meetings does not create or open a database",
  );
  check(
    (await state()).session.state === "IDLE",
    "opening history never starts capture",
  );
  await page
    .getByRole("button", { name: "Unlock meeting history", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Your meeting history starts here",
      exact: true,
    })
    .waitFor();
  keyCreated = true;
  check(
    true,
    "real native credential + worker unlock produces an honest empty state",
  );
  await shot("empty");
  await page.getByLabel("Save meeting history", { exact: true }).check();
  await page
    .getByLabel("Acknowledge meeting persistence and retention", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save history preferences", exact: true })
    .click();
  await page.waitForFunction(async () => {
    const r = await window.everyhint.meetings.getState();
    return r.ok && r.value.preferences.enabled;
  });
  await page
    .getByText("Create a meeting for manual notes", { exact: true })
    .click();
  await page
    .getByLabel("New saved meeting title", { exact: true })
    .fill("Labelled UI planning fixture");
  await page
    .getByLabel("Authorise creating saved meeting", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create saved meeting", exact: true })
    .click();
  await page.getByLabel("Saved meeting detail", { exact: true }).waitFor();
  check(
    (await state()).session.state === "IDLE",
    "creating a saved draft never acquires media",
  );
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("tab", { name: "Notes", exact: true })
    .press("ArrowLeft");
  check(
    (await page
      .getByRole("tab", { name: "Transcript", exact: true })
      .getAttribute("aria-selected")) === "true",
    "meeting tabs follow Arrow keys with focus/selection",
  );
  await page
    .getByRole("tab", { name: "Transcript", exact: true })
    .press("Home");
  check(
    (await page
      .getByRole("tab", { name: "Overview", exact: true })
      .getAttribute("aria-selected")) === "true",
    "meeting tabs support Home navigation",
  );
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("Manual meeting notes", { exact: true })
    .fill('My saffron notes <img src="https://invalid.example/x">');
  await page
    .getByLabel("Meeting tags", { exact: true })
    .fill("planning, local");
  await page
    .getByRole("button", { name: "Add action item", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Action 1", exact: true })
    .getByLabel("Description", { exact: true })
    .fill("Review the consent checklist");
  await page
    .getByLabel("Action 1 status", { exact: true })
    .selectOption("in-progress");
  await nav("Home");
  await nav("Meetings");
  check(
    (
      await page
        .getByLabel("Manual meeting notes", { exact: true })
        .inputValue()
    ).includes("saffron"),
    "navigation preserves unsaved meeting notes",
  );
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  check(
    await page
      .getByRole("button", { name: "Review meeting AI context", exact: true })
      .isDisabled(),
    "unsaved edits block AI generation/apply",
  );
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  const savedStart = performance.now();
  await page
    .getByRole("button", { name: "Save meeting edits", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save meeting edits", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Saved meeting detail"]') &&
      !Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
        el.textContent.includes("You have unsaved edits"),
      ),
  );
  performanceResults.editSaveMs = performance.now() - savedStart;
  check(
    await page
      .getByRole("button", { name: "Save meeting edits", exact: true })
      .isDisabled(),
    "saved notes become clean with a new revision",
  );
  await page
    .getByLabel("Manual meeting notes", { exact: true })
    .fill("Discard this draft");
  await page
    .getByRole("button", { name: "Revert unsaved edits", exact: true })
    .click();
  check(
    (
      await page
        .getByLabel("Manual meeting notes", { exact: true })
        .inputValue()
    ).includes("saffron"),
    "Revert restores the saved content",
  );
  await page
    .getByRole("button", { name: "Back to history", exact: true })
    .click();
  await page
    .getByLabel("Search meeting history", { exact: true })
    .fill("saffron");
  const searchStart = performance.now();
  await page
    .getByRole("button", { name: "Search history", exact: true })
    .click();
  await page
    .getByLabel("Saved meetings", { exact: true })
    .locator("mark")
    .waitFor();
  performanceResults.searchUiMs = performance.now() - searchStart;
  check(
    (await page
      .getByLabel("Saved meetings", { exact: true })
      .locator("mark")
      .count()) > 0,
    "search snippets safely highlight encrypted manual notes",
  );
  check(
    (await page
      .getByLabel("Meeting history workspace", { exact: true })
      .locator("img")
      .count()) === 0,
    "stored markup cannot create an image or external request",
  );
  await shot("search");
  await page
    .getByRole("button", { name: "Open, edit or export meeting", exact: true })
    .click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  check(
    (await page.getByLabel("Action 1 owner", { exact: true }).inputValue()) ===
      "" &&
      (await page
        .getByLabel("Action 1 deadline", { exact: true })
        .inputValue()) === "",
    "manual tasks retain unknown owners/deadlines",
  );
  check(
    (await page.getByLabel("Action 1 status", { exact: true }).inputValue()) ===
      "in-progress",
    "action status persists",
  );
  const document = (
    await call("list", {
      query: "",
      tag: "",
      from: null,
      to: null,
      status: "all",
      sort: "newest",
      offset: 0,
    })
  ).items[0];
  await page.getByText("Export and local sharing", { exact: true }).click();
  check(
    await page
      .getByRole("button", {
        name: "Choose file and export meeting",
        exact: true,
      })
      .isDisabled(),
    "export requires explicit plaintext acknowledgement",
  );
  await page
    .getByLabel("Acknowledge unencrypted meeting sharing", { exact: true })
    .check();
  for (const [format, extension] of [
    ["transcript-txt", "txt"],
    ["notes-md", "md"],
    ["meeting-json", "json"],
    ["summary-txt", "txt"],
  ]) {
    const path = join(profile, `smoke-export-${format}.${extension}`);
    await desktop.evaluate((_, path) => {
      globalThis.__meetingNative.savePath = path;
    }, path);
    await page
      .getByLabel("Meeting export format", { exact: true })
      .selectOption(format);
    await page
      .getByRole("button", {
        name: "Choose file and export meeting",
        exact: true,
      })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: `Exported smoke-export-${format}` })
      .waitFor();
    const text = await readFile(path, "utf8");
    check(
      format === "meeting-json"
        ? JSON.parse(text).meeting.id === document.id &&
            JSON.parse(text).segments.length === 0
        : text.includes(document.title),
      `${format} writes correct explicit native-dialog output`,
    );
  }
  check(
    await desktop.evaluate(() =>
      globalThis.__meetingNative.saveOptions.every(
        (options) =>
          options.title.includes("unencrypted") && options.filters.length === 1,
      ),
    ),
    "native dialog receives plaintext title and selected format filters",
  );
  await page
    .getByLabel("Meeting clipboard content", { exact: true })
    .selectOption("actions");
  await page
    .getByRole("button", { name: "Copy selected meeting content", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Copied selected saved content" })
    .waitFor();
  check(
    await desktop.evaluate(
      () =>
        globalThis.__meetingNative.clipboard.length === 1 &&
        globalThis.__meetingNative.clipboard[0].includes(
          "Review the consent checklist",
        ),
    ),
    "copy uses only selected saved actions (native clipboard port mocked to preserve user clipboard)",
  );
  const scope = (
    await page.evaluate(() => window.everyhint.meetings.getState())
  ).value.scopeId;
  await call("lock", undefined);
  const stale = await page.evaluate(
    ({ scope, id }) =>
      window.everyhint.meetings.operation({
        scopeId: scope,
        input: {
          id,
          expectedRevision: 1,
          action: "delete",
          acknowledged: true,
        },
      }),
    { scope, id: document.id },
  );
  check(
    !stale.ok && stale.error.includes("profile changed"),
    "stale scope deletion is rejected",
  );
  check(
    await desktop.evaluate(() => globalThis.__meetingRemoteCalls === 0),
    "history/edit/search paths make no remote request",
  );
  await desktop.close();
  desktop = undefined;
  const fixture = JSON.parse(
    execFileSync(
      electron,
      ["scripts/meeting-smoke-fixture.mjs", profile, "seed"],
      {
        cwd: project,
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        encoding: "utf8",
        windowsHide: true,
      },
    ).trim(),
  );
  await start();
  check(
    await page
      .getByLabel("Locked meeting history", { exact: true })
      .isVisible(),
    "restart restores neither unlock nor capture",
  );
  await page
    .getByRole("button", { name: "Unlock meeting history", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Labelled release transcript fixture",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  check(
    (await page.locator(".meeting-transcript:visible").count()) === 100,
    "actual persisted transcript uses 100-segment pages",
  );
  await page
    .getByRole("button", { name: "Next transcript page", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".meeting-transcript").length === 50,
  );
  check(
    (await page.locator(".meeting-transcript:visible").count()) === 50,
    "next transcript page retrieves remaining real encrypted fixture rows",
  );
  await page
    .getByLabel("Search within meeting transcript", { exact: true })
    .fill("orchid");
  await page
    .getByRole("button", { name: "Search transcript", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".meeting-transcript").length === 1,
  );
  check(
    (await page.locator(".meeting-transcript:visible").innerText()).includes(
      "orchid",
    ),
    "full transcript search finds a segment outside the first page",
  );
  const label = page.getByText("Correct speaker label", { exact: true });
  await label.click();
  await page
    .getByLabel("Speaker label final-149", { exact: true })
    .fill("My supplied speaker");
  await page
    .getByRole("button", { name: "Save speaker label", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".meeting-transcript").length === 100,
  );
  const ref = `${fixture.id}/fixture-capture/final-149`;
  check(
    (await call("reference", { id: fixture.id, ref })).speakerLabel ===
      "My supplied speaker",
    "explicit user speaker correction saves through real IPC/worker",
  );
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await page.getByLabel("Meeting AI share microphone", { exact: true }).check();
  await page
    .getByRole("button", { name: "Review meeting AI context", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "ChatGPT" })
    .first()
    .waitFor();
  check(
    (await page.evaluate(() => window.everyhint.getAssistant())).value.responses
      .length === 0,
    "missing signed-in model fails closed without fake AI success",
  );
  const actualAI = await page.evaluate(() => window.everyhint.meetings.getAI());
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:meeting-ai-state",
        value,
      ),
    {
      ...actualAI.value,
      revision: actualAI.value.revision + 100,
      status: "draft",
      purpose: "follow-up",
      textDraft:
        "Subject: Labelled follow-up fixture\n\nThis is a deterministic email UI fixture, not a genuine AI result.",
    },
  );
  await page.getByLabel("Editable follow-up email", { exact: true }).waitFor();
  check(
    (await page
      .getByLabel("Follow-up recipients", { exact: true })
      .inputValue()) === "",
    "follow-up fixture never invents a recipient",
  );
  check(
    await page
      .getByRole("button", {
        name: "Open approved draft in email app",
        exact: true,
      })
      .isDisabled(),
    "external application handoff needs a separate approval",
  );
  await page
    .getByLabel("Follow-up recipients", { exact: true })
    .fill("fixture@example.test");
  await page
    .getByLabel("Follow-up subject", { exact: true })
    .fill("Reviewed fixture subject");
  await page
    .getByLabel("Editable meeting AI draft", { exact: true })
    .fill("Reviewed fixture body.");
  await page
    .getByLabel("Approve external email-client handoff", { exact: true })
    .check();
  await page
    .getByRole("button", {
      name: "Open approved draft in email app",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Handed the draft to your email application" })
    .waitFor();
  check(
    await desktop.evaluate(() => {
      const urls = globalThis.__meetingNative.emails;
      if (urls.length !== 1) return false;
      const url = new URL(urls[0]);
      return (
        decodeURIComponent(url.pathname) === "fixture@example.test" &&
        url.searchParams.get("subject") === "Reviewed fixture subject" &&
        url.searchParams.get("body") === "Reviewed fixture body."
      );
    }),
    "mocked native email port receives only the exact separately approved draft; no external app/email opened",
  );
  await page
    .getByText("Continue this meeting with fresh capture", { exact: true })
    .click();
  await page
    .getByLabel("Acknowledge appending new capture to saved meeting", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", {
      name: "Prepare fresh capture for this meeting",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Prepare a session", exact: true })
    .waitFor();
  check(
    (await state()).session.state === "IDLE" &&
      (await state()).session.consent === null,
    "Resume arms context and opens consent without starting any source",
  );
  const settingsBeforeCompact = (await state()).settings;
  await page.evaluate(async (settings) => {
    const r = await window.everyhint.saveSettings({
      ...settings,
      compact: true,
      layout: "assistant",
    });
    if (!r.ok) throw Error(r.error);
  }, settingsBeforeCompact);
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setZoomFactor(1.25);
    win.setBounds({ width: 360, height: 230 });
  });
  await page.waitForFunction(() => document.querySelector(".app.is-compact"));
  await shot("compact-125");
  check(
    await page.evaluate(() => {
      const targets = [
        document.querySelector(
          '[aria-label="Meeting persistence and notes status"]',
        ),
        document.querySelector(".meeting-status button"),
        document.querySelector(
          '.capture-controls button[title="Stop all capture and revoke consent"]',
        ),
      ];
      return (
        targets.length === 3 &&
        targets.every((node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= innerWidth + 1 &&
            rect.bottom <= innerHeight + 1
          );
        })
      );
    }),
    "compact 360-DIP window at 125% keeps saved-meeting status, Open meetings and emergency Stop inside the viewport",
  );
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  await page.evaluate(async (settings) => {
    const r = await window.everyhint.saveSettings({
      ...settings,
      compact: false,
      layout: "dashboard",
    });
    if (!r.ok) throw Error(r.error);
  }, settingsBeforeCompact);
  await nav("Meetings");
  await page.getByText("Delete local content", { exact: true }).click();
  await page
    .getByLabel("Confirm selected meeting data deletion", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Delete selected local content", exact: true })
    .click();
  await page.getByRole("heading", { name: "Meetings", exact: true }).waitFor();
  check(
    !(
      await call("list", {
        query: "",
        tag: "",
        from: null,
        to: null,
        status: "all",
        sort: "newest",
        offset: 0,
      })
    ).items.some((item) => item.id === fixture.id),
    "delete removes transcript fixture, associated content and pending resume",
  );
  await page.getByRole("button", { name: "Lock history", exact: true }).click();
  await page.getByLabel("Locked meeting history", { exact: true }).waitFor();
  check(
    !(
      await page
        .getByLabel("Meeting history workspace", { exact: true })
        .innerText()
    ).includes("saffron"),
    "locking clears renderer history content",
  );
  check(
    (await state()).session.state === "IDLE",
    "all history operations leave capture off",
  );
  check(
    await desktop.evaluate(() => globalThis.__meetingRemoteCalls === 0),
    "all meeting smoke checks made zero remote or paid requests",
  );
  check(!errors.length, `no renderer exceptions: ${errors.join(", ")}`);
  await desktop.close();
  desktop = undefined;
  for (const file of await readdir(join(profile, "meetings"))) {
    if (!file.endsWith(".sqlite")) continue;
    const bytes = await readFile(join(profile, "meetings", file));
    check(
      !bytes.includes(Buffer.from("saffron")) &&
        !bytes.includes(Buffer.from("orchid")),
      "actual application database contains no plaintext content/search index",
    );
  }
  await writeFile(
    "artifacts/p8-meeting-smoke.json",
    JSON.stringify(
      {
        assertions,
        remoteRequests: 0,
        paidRequests: 0,
        realCapture: false,
        fixtureTranscripts: true,
        performanceResults,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Meeting Electron smoke passed: ${assertions} assertions; actual encrypted database/native key/worker; no remote requests or real capture.`,
  );
} finally {
  if (desktop) await desktop.close();
  if (keyCreated)
    execFileSync(
      electron,
      ["scripts/meeting-smoke-fixture.mjs", profile, "cleanup-key"],
      {
        cwd: project,
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        windowsHide: true,
      },
    );
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes("everyhint-p8-ui-")
  )
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
}
