// One explicitly authorised real ChatGPT-plan request. Google content below is
// synthetic; this never represents genuine Google sign-in/API verification.
import assert from "node:assert/strict";
import { build } from "rolldown";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import electron from "electron";
const dry = process.argv.includes("--dry-run"),
  authorised = process.argv.includes("--authorised-one-request"),
  reportPath = resolve("artifacts/p10-genuine-brief.json");
if (!dry && !authorised)
  throw Error(
    "Requires explicit user authorisation for exactly one genuine scoped brief request, or --dry-run (no network).",
  );
if (!process.versions.electron) {
  await mkdir("artifacts", { recursive: true });
  await build({
    input: "scripts/context-verification-entry.ts",
    platform: "node",
    external: [/^node:/, "@napi-rs/keyring"],
    output: { file: "artifacts/p10-verification-adapter.mjs", format: "esm" },
  });
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  for (const key of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
  ])
    delete env[key];
  execFileSync(
    electron,
    [
      "scripts/verify-context-ai.mjs",
      dry ? "--dry-run" : "--authorised-one-request",
    ],
    { env, windowsHide: true, stdio: "inherit", timeout: 150000 },
  );
} else {
  if (!dry) {
    try {
      await access(reportPath);
      throw Error("One-request test already reserved; no retry authorised.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const {
    WorkspaceController,
    WorkspaceResume,
    PersonalStore,
    MeetingKeys,
    historyProfile,
    AssistantController,
    ChatGptProvider,
    ChatGptAccounts,
    planFetch,
    defaultConfig,
    HistoryWorker,
  } = await import(
    pathToFileURL(resolve("artifacts/p10-verification-adapter.mjs")).href
  );
  const root = await mkdtemp(join(tmpdir(), "everyhint-p10-inference-")),
    key = randomBytes(32),
    profile = historyProfile(root, "synthetic-context"),
    report = {
      genuineRequests: 0,
      authorisedRequestLimit: dry ? 0 : 1,
      googleData: "Synthetic local fixture; no Google sign-in or API",
      model: "gpt-6.1-sol",
      physicalMicrophone: false,
      screen: false,
      systemAudio: false,
      personalDocuments: false,
      paidFallback: false,
      automaticRetries: false,
    },
    noBrowser = async () => {
      throw Error("New sign-in is outside this verification scope.");
    };
  let accounts,
    assistant,
    workspace,
    history,
    expectedPrompt = "",
    reserved = false;
  try {
    const provider = dry
      ? {
          id: "codex",
          inspect: async () => ({
            id: "codex",
            auth: "chatgpt",
            ready: true,
            message: "Dry-run fixture",
            models: ["gpt-6.1-sol"],
            selectedModel: "gpt-6.1-sol",
            capabilities: { text: true, images: false, tools: false },
          }),
          respond: async function* (request) {
            yield {
              type: "complete",
              text: `Prototype release: Thursday. Checklist: Wednesday. [${request.workspaceContext.entries.find((e) => e.kind === "memory").ref}]`,
              model: "gpt-6.1-sol",
            };
          },
          dispose: () => {},
        }
      : new ChatGptProvider(
          (accounts = new ChatGptAccounts(
            join(process.env.APPDATA, "EveryHint", "chatgpt-plan"),
            () => {},
            noBrowser,
          )),
          async (url, init) => {
            if (new URL(url).pathname.endsWith("/responses")) {
              assert.equal(init.method, "POST");
              assert.equal(report.genuineRequests, 0);
              const body = JSON.parse(init.body);
              assert.equal(body.store, false);
              assert.equal(body.stream, true);
              assert.equal(body.model, "gpt-6.1-sol");
              assert.ok(!body.tools?.length);
              assert.equal(body.input[0].content[0].text, expectedPrompt);
              assert.ok(expectedPrompt);
              report.genuineRequests++;
              report.serializedPromptChars = expectedPrompt.length;
              await writeFile(
                reportPath,
                JSON.stringify(
                  { ...report, status: "attempt-reserved" },
                  null,
                  2,
                ),
                { flag: "wx" },
              );
              reserved = true;
            }
            return planFetch(url, init);
          },
        );
    if (accounts) {
      await accounts.restore();
      assert.ok(
        accounts.value.state === "signed-in" && accounts.value.planUsage,
        "Existing EveryHint plan sign-in is required; no credentials will be invented or imported.",
      );
      await provider.discoverModels();
      provider.selectModel("gpt-6.1-sol");
    }
    const unavailable = {
      id: "claude",
      inspect: async () => ({
        id: "claude",
        auth: "missing",
        ready: false,
        message: "Outside scoped test",
        models: [],
        capabilities: { text: false, images: false, tools: false },
      }),
      respond: async function* () {
        yield* [];
        throw Error("No fallback authorised");
      },
      dispose: () => {},
    };
    assistant = new AssistantController(
      [provider, unavailable],
      () => ({
        capture: {
          sessionId: null,
          state: "IDLE",
          epoch: 0,
          frame: null,
          consent: null,
        },
        events: [],
      }),
      () => {},
      90000,
      Date.now,
      undefined,
      () => ({
        mode: {
          ...defaultConfig().modes[0],
          id: "p10-test",
          name: "Harmless preparation",
          instructions:
            "Keep the pre-call preparation concise. Preserve references.",
        },
        outputLanguage: "default",
      }),
      undefined,
      (query, selection) => workspace.buildContext(query, selection),
    );
    let connected = false;
    const now = Date.now();
    const event = {
      id: "synthetic-event",
      summary: "Harmless prototype preparation",
      description: "Prototype release is Thursday. Checklist is due Wednesday.",
      updated: new Date(now).toISOString(),
      start: { dateTime: new Date(now + 86400000).toISOString() },
      end: { dateTime: new Date(now + 88200000).toISOString() },
    };
    const fixtureKeys = new MeetingKeys(() => ({
      getSecret: async () => Array.from(key),
      setSecret: async () => {},
      deleteCredential: async () => true,
    }));
    history = new HistoryWorker(
      join(root, "history"),
      profile,
      fixtureKeys,
      pathToFileURL(resolve("out/main/meetings-worker.js")),
    );
    await history.open();
    let prior = await history.create(
      "Synthetic previous prototype discussion",
      30,
    );
    prior = await history.update(
      {
        ...prior,
        status: "ended",
        endedAt: Date.now(),
        notes:
          "The prototype release is Thursday. The checklist is due Wednesday.",
      },
      prior.revision,
      30,
    );
    const unrelated = await history.create(
      "Unrelated private test fixture",
      30,
    );
    await history.update(
      {
        ...unrelated,
        status: "ended",
        endedAt: Date.now(),
        notes: "UNRELATED_CANARY_MUST_STAY_LOCAL",
      },
      unrelated.revision,
      30,
    );
    workspace = new WorkspaceController(
      {
        store: (p) =>
          new PersonalStore(
            join(root, "encrypted"),
            p,
            new MeetingKeys(() => ({
              getSecret: async () => Array.from(key),
              setSecret: async () => {},
              deleteCredential: async () => true,
            })),
            pathToFileURL(resolve("out/main/personal-worker.js")),
          ),
        google: (_profile, service) => ({
          get subject() {
            return service === "calendar" && connected
              ? "synthetic-calendar-subject"
              : null;
          },
          get value() {
            return {
              service,
              state:
                service === "calendar" && connected
                  ? "connected"
                  : "disconnected",
              subject: this.subject,
              email: null,
              message: "Synthetic local fixture only",
              configured: true,
            };
          },
          restore: async () => {},
          connect: async () => {
            connected = true;
          },
          cancel: () => {},
          close: async () => {},
          read: async (url) =>
            url.includes("calendarList")
              ? {
                  items: [
                    {
                      id: "synthetic-calendar",
                      summary: "Synthetic calendar",
                      timeZone: "Europe/London",
                      accessRole: "reader",
                    },
                  ],
                }
              : { items: [event] },
        }),
        changed: () => {},
        invalidate: () => assistant.clear(),
        notify: () => {
          throw Error("Notifications are outside this test.");
        },
        openURL: noBrowser,
        assistant,
        meetings: { value: { locked: false }, requireStore: () => history },
        personal: { value: { unlocked: false } },
        captureIdle: () => true,
        exportText: async () => {
          throw Error("No plaintext export authorised.");
        },
      },
      new WorkspaceResume(join(root, "resume")),
    );
    workspace.switchProfile(profile);
    const command = (command, value) =>
      workspace.command({
        scopeId: workspace.value.scopeId,
        command,
        ...(value === undefined ? {} : { value }),
      });
    await command("unlock");
    await command("configure", {
      settings: { ...workspace.value.config, memoryEnabled: true },
      acknowledged: true,
    });
    await command("connect-calendar", { acknowledged: true });
    await command("list-calendars");
    await command("configure", {
      settings: {
        ...workspace.value.config,
        selectedCalendarIds: ["synthetic-calendar"],
      },
      acknowledged: true,
    });
    await command("refresh-calendar");
    const eventRecord = (
      await workspace.query({
        scopeId: workspace.value.scopeId,
        query: { kind: "event", query: "", offset: 0 },
      })
    ).items[0];
    const person = await command("save-person", {
      id: "new",
      updatedAt: 0,
      manual: {
        name: "Test Participant",
        email: "",
        emailVerified: false,
        organisation: "",
        jobTitle: "",
      },
      notes:
        "Synthetic test participant; no professional background is supplied.",
      meetingIds: [],
    });
    await command("rebuild-memory", {
      meetingIds: [prior.id],
      documentIds: [],
      acknowledged: true,
    });
    let memory = (
      await workspace.query({
        scopeId: workspace.value.scopeId,
        query: { kind: "memory", query: "prototype", offset: 0 },
      })
    ).items[0];
    memory = await command("save-memory", {
      id: memory.id,
      updatedAt: memory.updatedAt,
      type: memory.type,
      description: memory.description,
      personIds: [],
      topics: ["prototype"],
      status: "open",
      review: "approved",
    });
    await assistant.inspect();
    const review = await command("prepare-brief", {
      selection: {
        purpose: "brief",
        eventId: eventRecord.id,
        description: true,
        personIds: [person.id],
        memoryIds: [memory.id],
        meetingIds: [],
      },
      knowledgeIds: [],
    });
    assert.equal(review.workspaceContext.entries.length, 3);
    assert.equal(review.screenshot, null);
    assert.equal(review.transcripts.length, 0);
    assert.equal(review.history.length, 0);
    assert.ok(review.prompt.includes("untrusted"));
    assert.ok(!review.prompt.includes("UNRELATED_CANARY_MUST_STAY_LOCAL"));
    expectedPrompt = review.prompt;
    report.unrelatedInformationExcluded = true;
    report.previousMeetingContext =
      "Reviewed literal memory from a new synthetic saved note; no capture or personal history";
    report.reviewedSources = review.workspaceContext.entries.map((e) => ({
      kind: e.kind,
      ref: e.ref,
    }));
    const started = performance.now();
    await assistant.ask({ reviewId: review.requestId, acknowledged: true });
    const deadline = Date.now() + 100000;
    let result;
    while (Date.now() < deadline) {
      result = assistant.value.responses.at(-1);
      if (result && !["sending", "generating"].includes(result.status)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(
      result?.status,
      "completed",
      result?.error?.message ?? "Brief did not complete; no retry.",
    );
    assert.equal(result.model, "gpt-6.1-sol");
    assert.match(result.text, /Thursday/i);
    assert.match(result.text, /Wednesday/i);
    assert.ok(
      result.workspaceContext.entries.some((e) =>
        result.text.includes(`[${e.ref}]`),
      ),
      "Response must preserve a supplied citation.",
    );
    Object.assign(report, {
      status: "passed",
      latencyMs: performance.now() - started,
      firstTextMs: result.firstTextAt - result.startedAt,
      usage: result.usage,
      responseChars: result.text.length,
      citationPresent: true,
    });
    if (dry)
      await writeFile(
        "artifacts/p10-brief-dry-run.json",
        JSON.stringify(report, null, 2),
      );
    else await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    if (reserved)
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            ...report,
            status: "failed-no-retry",
            error:
              error instanceof Error ? error.message : "Verification failed",
          },
          null,
          2,
        ),
      );
    throw error;
  } finally {
    await workspace?.dispose();
    await history?.close();
    await assistant?.dispose();
    accounts?.dispose();
    key.fill(0);
    if (
      dirname(root) === resolve(tmpdir()) &&
      basename(root).startsWith("everyhint-p10-inference-")
    )
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    else {
      console.error("Unsafe verification cleanup target left untouched");
      process.exitCode = 1;
    }
  }
}
