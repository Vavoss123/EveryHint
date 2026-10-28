// Opt-in genuine integration. Never run automatically as part of npm check/smoke.
// Two subscription-backed requests, no API-key fallback, retry, real microphone,
// screenshots, system playback, unrelated documents or tool execution.
import assert from "node:assert/strict";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import electron from "electron";
import { _electron, chromium } from "playwright-core";
import { installSyntheticAudio } from "./synthetic-audio.mjs";
if (!process.argv.includes("--authorised-two-requests"))
  throw Error(
    "Requires explicit user authorisation for the two documented genuine requests.",
  );
const reportPath = "artifacts/p9-live-ai-result.json";
try {
  await access(reportPath);
  throw Error(
    "This two-request test has already been reserved. No automatic retry.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const unwrap = (result) => {
  assert.ok(result.ok, result.error);
  return result.value;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(read, predicate, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const state = await read();
    if (predicate(state)) return state;
    await pause(100);
  }
  throw Error("P9 genuine verification timed out; no retry.");
}
const env = { ...process.env };
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "EVERYHINT_TEST_USER_DATA",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
let desktop,
  page,
  original,
  modeId,
  templateId,
  documentId,
  meetingId,
  reserved = false;
const report = {
  authorisedRequestLimit: 2,
  genuineRequests: 0,
  model: "gpt-6.1-sol",
  physicalMicrophone: false,
  screenshot: false,
  systemAudio: false,
  paidFallback: false,
  fixture:
    "One new Markdown reference plus three offline-TTS sentences through synthetic microphone and real tiny.en",
};
async function personal(value) {
  return unwrap(
    await page.evaluate(async (value) => {
      const state = await window.everyhint.personal.get();
      if (!state.ok) return state;
      return window.everyhint.personal.command({
        scopeId: state.value.scopeId,
        value,
      });
    }, value),
  );
}
async function meeting(method, input) {
  return unwrap(
    await page.evaluate(
      async ({ method, input }) => {
        const state = await window.everyhint.meetings.getState();
        if (!state.ok) return state;
        return window.everyhint.meetings[method]({
          scopeId: state.value.scopeId,
          input,
        });
      },
      { method, input },
    ),
  );
}
async function ai() {
  return unwrap(await page.evaluate(() => window.everyhint.getAssistant()));
}
async function allow(review) {
  await desktop.evaluate((_, prompt) => {
    globalThis.__p9Genuine.expected = prompt;
  }, review.prompt);
}
try {
  // A quiet existing development preview can be replaced without touching
  // user drafts/capture. Otherwise abort before reserving any inference.
  let existing;
  try {
    const port = (
      await readFile(
        join(process.env.APPDATA, "EveryHint", "DevToolsActivePort"),
        "utf8",
      )
    )
      .split("\n")[0]
      .trim();
    existing = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (error) {
    if (
      error.code !== "ENOENT" &&
      !String(error.message).includes("ECONNREFUSED")
    )
      throw error;
  }
  if (existing) {
    try {
      const previous = existing
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url() === "everyhint://app/index.html");
      assert.ok(
        previous,
        "Expected the existing EveryHint development preview.",
      );
      const current = await previous.evaluate(async () => ({
        app: await window.everyhint.getSnapshot(),
        ai: await window.everyhint.getAssistant(),
        speech: await window.everyhint.getTranscription(),
        intelligence: await window.everyhint.getIntelligence(),
        meetingAI: await window.everyhint.meetings.getAI(),
      }));
      assert.ok(
        ["IDLE", "STOPPED"].includes(unwrap(current.app).session.state),
        "User capture must stay untouched.",
      );
      assert.equal(unwrap(current.ai).review, null);
      assert.equal(current.ai.value.responses.length, 0);
      assert.equal(unwrap(current.speech).events.length, 0);
      assert.equal(unwrap(current.intelligence).live, null);
      assert.notEqual(unwrap(current.meetingAI).status, "draft");
      assert.equal(current.meetingAI.value.autoGrant, null);
      const draft = previous.getByLabel("Your question", { exact: true });
      if (await draft.count())
        assert.equal((await draft.inputValue()).trim(), "");
      await previous
        .evaluate(() => window.everyhint.window("quit"))
        .catch(() => {});
      await pause(1000);
    } finally {
      await existing.close();
    }
  }
  desktop = await _electron.launch({
    executablePath: electron,
    args: [process.cwd()],
    cwd: process.cwd(),
    env,
    timeout: 30000,
  });
  const wave = await readFile("artifacts/p8-meeting.wav");
  let offset = 12,
    pcm,
    rate = 0;
  while (offset + 8 <= wave.length) {
    const kind = wave.toString("ascii", offset, offset + 4),
      size = wave.readUInt32LE(offset + 4);
    if (kind === "fmt ") {
      assert.equal(wave.readUInt16LE(offset + 8), 1);
      assert.equal(wave.readUInt16LE(offset + 10), 1);
      assert.equal(wave.readUInt16LE(offset + 22), 16);
      rate = wave.readUInt32LE(offset + 12);
    }
    if (kind === "data") pcm = wave.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  assert.ok(pcm);
  assert.equal(rate, 16000);
  const samples = new Float32Array(rate * 4 + pcm.length / 2);
  for (let i = 0; i < pcm.length / 2; i++)
    samples[rate + i] = pcm.readInt16LE(i * 2) / 32768;
  await desktop.context().addInitScript(() => {
    if (!location.pathname.endsWith("/audio.html")) return;
    const start = AudioBufferSourceNode.prototype.start,
      pending = [];
    AudioBufferSourceNode.prototype.start = function () {
      pending.push(() => start.call(this, this.context.currentTime + 0.1));
    };
    window.__p9Play = () => {
      if (pending.length !== 1) throw Error("Expected one synthetic source.");
      pending.splice(0).forEach((play) => play());
    };
  });
  await desktop.context().addInitScript(installSyntheticAudio, {
    samples: Array.from(samples),
    sampleRate: rate,
  });
  page = await desktop.firstWindow();
  await page.waitForFunction(() => Boolean(window.everyhint?.personal));
  const snapshot = unwrap(
    await page.evaluate(() => window.everyhint.getSnapshot()),
  );
  assert.ok(["IDLE", "STOPPED"].includes(snapshot.session.state));
  assert.equal((await ai()).responses.length, 0);
  assert.equal((await ai()).review, null);
  const draft = page.getByLabel("Your question", { exact: true });
  if (await draft.count()) assert.equal((await draft.inputValue()).trim(), "");
  await wait(
    async () =>
      unwrap(
        await page.evaluate(() => window.everyhint.getAccountConnection()),
      ),
    (s) => s.state === "signed-in" && s.planUsage,
  );
  original = {
    app: snapshot,
    speech: unwrap(
      await page.evaluate(() => window.everyhint.getTranscription()),
    ),
    personal: unwrap(
      await page.evaluate(() => window.everyhint.personal.get()),
    ),
    meetings: unwrap(
      await page.evaluate(() => window.everyhint.meetings.getState()),
    ),
  };
  assert.equal(original.speech.events.length, 0);
  const intelligence = unwrap(
    await page.evaluate(() => window.everyhint.getIntelligence()),
  );
  assert.equal(intelligence.live, null);
  await desktop.evaluate(({ shell }) => {
    shell.openExternal = async () => {
      throw Error("External handoff not authorised.");
    };
    const genuine = globalThis.fetch;
    globalThis.__p9Genuine = {
      expected: null,
      requests: 0,
      rejected: 0,
      shapes: [],
    };
    globalThis.fetch = async function (url, init = {}) {
      const target = new URL(typeof url === "string" ? url : url.url);
      if (!["api.openai.com", "auth.openai.com"].includes(target.hostname))
        throw Error("Other network endpoints not authorised.");
      if (target.pathname.endsWith("/responses")) {
        const state = globalThis.__p9Genuine,
          body = JSON.parse(init.body),
          content = body.input?.[0]?.content;
        if (!(
          state.requests < 2 &&
          state.expected &&
          target.href === "https://api.openai.com/v1/responses" &&
          init.method === "POST" &&
          body.model === "gpt-6.1-sol" &&
          body.store === false &&
          body.stream === true &&
          body.tools?.length === 0 &&
          body.tool_choice === "none" &&
          content?.length === 1 &&
          content[0].type === "input_text" &&
          content[0].text === state.expected
        )) {
          state.rejected++;
          throw Error("Exact approved P9 request scope did not match.");
        }
        state.requests++;
        state.expected = null;
        state.shapes.push({
          model: body.model,
          store: body.store,
          stream: body.stream,
          tools: body.tools,
          toolChoice: body.tool_choice,
          inputTypes: content.map((c) => c.type),
        });
      }
      return genuine.call(this, url, init);
    };
  });
  unwrap(
    await page.evaluate(
      (settings) =>
        window.everyhint.saveSettings({
          ...settings,
          compact: false,
          layout: "assistant",
        }),
      original.app.settings,
    ),
  );
  unwrap(await page.evaluate(() => window.everyhint.selectProvider("codex")));
  unwrap(await page.evaluate(() => window.everyhint.discoverModels()));
  unwrap(
    await page.evaluate(() => window.everyhint.selectModel("gpt-6.1-sol")),
  );
  if (!original.personal.unlocked) await personal({ type: "unlock" });
  const before = unwrap(
    await page.evaluate(() => window.everyhint.personal.get()),
  );
  await mkdir("artifacts/p9", { recursive: true });
  const sourcePath = resolve("artifacts/p9/authorised-reference.md");
  await writeFile(
    sourcePath,
    "# Release plan\nThe prototype release is Thursday. The test checklist is due Wednesday.\n",
  );
  await desktop.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, sourcePath);
  const imported = await personal({ type: "import" });
  documentId = imported.documents.find(
    (d) => !before.documents.some((old) => old.id === d.id),
  )?.id;
  assert.ok(documentId);
  modeId = crypto.randomUUID();
  templateId = crypto.randomUUID();
  await personal({
    type: "save-template",
    template: {
      ...before.config.templates[0],
      id: templateId,
      name: "P9 authorised release template",
      builtIn: false,
      sections: [
        {
          heading: "Release overview",
          source: "overview",
          instructions: "State only supported release information.",
        },
        {
          heading: "Confirmed decisions",
          source: "decisions",
          instructions: "Only explicitly agreed decisions.",
        },
        {
          heading: "Checklist commitments",
          source: "actions",
          instructions:
            "Owners and deadlines must be literally supported or null.",
        },
      ],
    },
  });
  await personal({
    type: "save",
    mode: {
      ...before.config.modes.find((m) => m.id === "general"),
      id: modeId,
      name: "P9 authorised release coach",
      builtIn: false,
      category: "Custom",
      instructions:
        "Respond concisely with release talking points grounded in supplied facts. Cite exact source refs when using knowledge. Never claim actions were executed.",
      output: { length: "short", language: "English", format: "bullets" },
      knowledgeIds: [documentId],
      templateId,
    },
  });
  await personal({ type: "select", id: modeId });
  const options = {
    microphone: false,
    systemAudio: false,
    screenshot: false,
    history: false,
    recentSeconds: 60,
    transcriptChars: 6000,
    totalChars: 20000,
    imageBytes: 1500000,
  };
  unwrap(
    await page.evaluate((input) => window.everyhint.reviewContext(input), {
      question:
        "Using only the approved release plan, when is the prototype release and when is the checklist due? Cite the exact knowledge reference in square brackets.",
      options,
      knowledgeIds: [documentId],
    }),
  );
  const review = (await ai()).review;
  assert.equal(review.knowledge.length, 1);
  assert.equal(review.modeContext.mode.id, modeId);
  assert.equal(review.screenshot, null);
  assert.deepEqual(review.history, []);
  assert.deepEqual(review.transcripts, []);
  report.knowledgeReview = {
    modeName: review.modeContext.mode.name,
    sources: review.knowledge,
    question: review.question,
    textChars: review.textChars,
  };
  await allow(review);
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" });
  reserved = true;
  unwrap(
    await page.evaluate(
      (reviewId) => window.everyhint.ask({ reviewId, acknowledged: true }),
      review.requestId,
    ),
  );
  const completed = await wait(
      ai,
      (state) =>
        state.responses.some(
          (r) =>
            r.requestId === review.requestId &&
            !["sending", "generating"].includes(r.status),
        ),
      110000,
    ),
    response = completed.responses.find(
      (r) => r.requestId === review.requestId,
    );
  report.knowledgeResponse = response;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  assert.equal(response.status, "completed");
  assert.ok(response.text.includes(`[${review.knowledge[0].ref}]`));
  assert.match(response.text, /Thursday/);
  assert.match(response.text, /Wednesday/);
  unwrap(await page.evaluate(() => window.everyhint.assistant("clear")));
  await wait(
    async () =>
      unwrap(await page.evaluate(() => window.everyhint.getTranscription())),
    (s) =>
      s.runtimeInstalled &&
      s.models.some((m) => m.id === "tiny.en" && m.state === "installed"),
  );
  unwrap(
    await page.evaluate(
      (settings) =>
        window.everyhint.saveTranscriptionSettings({
          ...settings,
          model: "tiny.en",
          silenceMs: 900,
        }),
      original.speech.settings,
    ),
  );
  await meeting("configure", {
    settings: {
      ...original.meetings.preferences,
      enabled: true,
      autoSave: false,
    },
    acknowledged: true,
    applyRetention: true,
  });
  unwrap(
    await page.evaluate(() =>
      window.everyhint.prepare({
        microphoneDeviceId: "default",
        consent: {
          screen: false,
          microphone: true,
          systemAudio: false,
          acknowledged: true,
        },
      }),
    ),
  );
  unwrap(await page.evaluate(() => window.everyhint.session("start")));
  unwrap(await page.evaluate(() => window.everyhint.transcription("enable")));
  await wait(
    async () =>
      unwrap(await page.evaluate(() => window.everyhint.getTranscription())),
    (s) => s.state === "LISTENING",
  );
  const capture = unwrap(
    await page.evaluate(() => window.everyhint.getSnapshot()),
  );
  const saved = await meeting("saveSession", {
    sessionId: capture.session.sessionId,
    title: "P9 authorised synthetic transcript",
    acknowledged: true,
  });
  meetingId = saved.id;
  const audio = desktop
    .context()
    .pages()
    .find((p) => p.url().endsWith("/audio.html"));
  assert.ok(audio);
  await audio.evaluate(() => window.__p9Play());
  const speech = await wait(
    async () =>
      unwrap(await page.evaluate(() => window.everyhint.getTranscription())),
    (s) => {
      const text = s.events
        .filter((e) => e.state === "final")
        .map((e) => e.text)
        .join(" ");
      return (
        /decided.*release/i.test(text) &&
        /checklist.*Wednesday/i.test(text) &&
        /not specified/i.test(text) &&
        s.diagnostics.queueLength === 0
      );
    },
    70000,
  );
  report.transcripts = speech.events
    .filter((e) => e.state === "final")
    .map(({ text, source, model }) => ({ text, source, model }));
  unwrap(await page.evaluate(() => window.everyhint.session("stop")));
  await wait(
    async () => await meeting("get", { id: meetingId }),
    (doc) => doc.status === "ended",
  );
  await meeting("prepareAI", {
    purpose: "summary",
    meetingIds: [meetingId],
    temporary: false,
    question: "",
    sources: { microphone: true, systemAudio: false, notes: false },
    segmentIds: [],
    sections: ["overview", "decisions", "actions"],
    templateId,
  });
  const summaryReview = (await ai()).review;
  assert.equal(summaryReview.meetingContext.template.id, templateId);
  assert.ok(
    summaryReview.meetingContext.excerpts.every((e) =>
      report.transcripts.some((t) => t.text === e.text),
    ),
  );
  report.summaryReview = {
    template: summaryReview.meetingContext.template,
    excerptCount: summaryReview.meetingContext.excerpts.length,
    textChars: summaryReview.textChars,
  };
  await allow(summaryReview);
  await meeting("askAI", {
    reviewId: summaryReview.requestId,
    acknowledged: true,
  });
  const terminal = await wait(
    async () =>
      unwrap(await page.evaluate(() => window.everyhint.meetings.getAI())),
    (state) => ["draft", "error"].includes(state.status),
    110000,
  );
  report.summaryDraft = terminal.draft;
  report.summaryResponse = (await ai()).responses.find(
    (r) => r.requestId === summaryReview.requestId,
  );
  assert.equal(terminal.status, "draft", terminal.error);
  assert.equal((await meeting("get", { id: meetingId })).summary, null);
  const doc = await meeting("get", { id: meetingId }),
    applied = await meeting("applyAI", {
      draftId: terminal.draft.id,
      meetingId,
      expectedRevision: doc.revision,
      sections: terminal.draft.sections,
      overwriteManual: false,
    });
  assert.equal(applied.summary.template.id, templateId);
  report.reviewedSummarySaved = true;
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed()) {
    report.transport = await desktop
      .evaluate(() => {
        const { expected, ...state } = globalThis.__p9Genuine ?? {};
        void expected;
        return state;
      })
      .catch(() => null);
    report.genuineRequests = report.transport?.requests ?? 0;
    await page
      .evaluate(async () => {
        await window.everyhint.pauseLive();
        await window.everyhint.session("stop");
        await window.everyhint.assistant("clear");
        await window.everyhint.transcription("clear");
        await window.everyhint.setOperatingMode("manual");
      })
      .catch(() => {});
    try {
      if (meetingId) {
        const doc = await meeting("get", { id: meetingId });
        await meeting("operation", {
          id: meetingId,
          expectedRevision: doc.revision,
          action: "delete",
          acknowledged: true,
        });
      }
      if (modeId) await personal({ type: "delete", id: modeId });
      if (documentId)
        await personal({ type: "delete-document", id: documentId });
      if (templateId)
        await personal({ type: "delete-template", id: templateId });
      if (original) {
        await personal({
          type: "select",
          id: original.personal.config.activeModeId,
        });
        await meeting("configure", {
          settings: original.meetings.preferences,
          acknowledged: true,
          applyRetention: true,
        });
        unwrap(
          await page.evaluate(
            (s) => window.everyhint.saveTranscriptionSettings(s),
            original.speech.settings,
          ),
        );
        unwrap(
          await page.evaluate(
            (s) => window.everyhint.saveSettings(s),
            original.app.settings,
          ),
        );
        if (!original.personal.unlocked) await personal({ type: "lock" });
        await meeting("lock", undefined);
      }
      report.testRecordsRemovedAndPreferencesRestored = true;
    } catch (error) {
      report.cleanupError = error.message;
      process.exitCode = 1;
    }
  }
  if (desktop) await desktop.close().catch(() => {});
  report.testAppClosed = true;
  await writeFile(
    reserved ? reportPath : "artifacts/p9-live-preparation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      success: report.success,
      genuineRequests: report.genuineRequests,
      error: report.error,
      cleanupError: report.cleanupError,
    }),
  );
}
