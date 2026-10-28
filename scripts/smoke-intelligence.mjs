import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { _electron } from "playwright-core";
import electron from "electron";
const project = resolve(import.meta.dirname, ".."),
  profile = await mkdtemp(join(tmpdir(), "everyhint-p7-smoke-"));
const env = {
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
  assertions = 0;
const errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  assertions++;
};
async function open() {
  desktop = await _electron.launch({
    executablePath: electron,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() =>
    Boolean(window.everyhint && document.querySelector(".capture-controls")),
  );
  if (
    await page
      .getByRole("button", { name: "Expand EveryHint", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Expand EveryHint", exact: true })
      .click();
  await page.getByLabel("Operating mode", { exact: true }).waitFor();
  await desktop.evaluate(() => {
    globalThis.__p7Network = [];
    globalThis.fetch = async (url) => {
      globalThis.__p7Network.push(String(url));
      throw new Error("No external requests authorised in P7 smoke.");
    };
  });
  return page;
}
try {
  let page = await open();
  const get = async () => {
    const value = await page.evaluate(() => window.everyhint.getIntelligence());
    assert.ok(value.ok, value.error);
    return value.value;
  };
  const ai = async () => {
    const value = await page.evaluate(() => window.everyhint.getAssistant());
    assert.ok(value.ok, value.error);
    return value.value;
  };
  const state = async () => {
    const value = await page.evaluate(() => window.everyhint.getSnapshot());
    assert.ok(value.ok, value.error);
    return value.value;
  };
  const wait = async (predicate) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const value = await get();
      if (predicate(value)) return value;
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error("Intelligence state did not settle.");
  };
  check(
    (await get()).mode === "manual" && (await get()).live === null,
    "startup is Manual with no automatic authorisation",
  );
  check(
    (await state()).session.state === "IDLE" &&
      (await get()).questions.length === 0,
    "intelligence does not start media or invent questions",
  );
  const rejected = await page.evaluate(async () => ({
    mode: await window.everyhint.setOperatingMode("proactive-always"),
    settings: await window.everyhint.saveIntelligenceSettings({ mode: "live" }),
    action: await window.everyhint.contextualAction({
      action: "run-shell",
      options: {},
    }),
    dismiss: await window.everyhint.dismissSuggestion({
      id: "forged",
      similar: true,
    }),
  }));
  check(
    Object.values(rejected).every((value) => !value.ok),
    "new IPC rejects forged modes/settings/actions/suggestions",
  );
  await page
    .getByLabel("Operating mode", { exact: true })
    .selectOption("auto-hint");
  await wait((value) => value.mode === "auto-hint");
  check(
    (await get()).live === null && (await ai()).responses.length === 0,
    "Auto-Hint does not enable remote inference",
  );
  await page.getByText("Contextual actions", { exact: true }).click();
  await page
    .getByLabel("Contextual action", { exact: true })
    .selectOption("who");
  await page
    .getByRole("button", {
      name: "Show authorised participant information",
      exact: true,
    })
    .click();
  await page.getByLabel("Local contextual result", { exact: true }).waitFor();
  check(
    (await get()).localResult.text.includes("not people") &&
      (await ai()).responses.length === 0,
    "unknown participant is an honest local result without inference",
  );
  await page
    .getByLabel("Authorised participant information", { exact: true })
    .fill('Alex, reviewer <img src="https://invalid.example/x">');
  await page
    .getByRole("button", {
      name: "Show authorised participant information",
      exact: true,
    })
    .click();
  await wait((value) => value.localResult?.text.includes("Alex"));
  check(
    (await page
      .getByLabel("Local contextual result")
      .locator("img")
      .count()) === 0,
    "participant reference text is escaped and cannot load remote images",
  );
  await page
    .getByLabel("Contextual action", { exact: true })
    .selectOption("fact-check");
  await page
    .getByLabel("Action topic", { exact: true })
    .fill("Dictionary lookup is always constant time");
  await page
    .getByRole("button", { name: "Review contextual action", exact: true })
    .click();
  await page.getByLabel("Context review", { exact: true }).waitFor();
  check(
    (await ai()).review.action === "fact-check" &&
      (await ai()).review.prompt.includes("UNVERIFIED, CONTEXT-ONLY"),
    "fact-check uses the shared frozen unverified context review",
  );
  check(
    !(await page
      .getByLabel("Acknowledge remote transfer", { exact: true })
      .isChecked()) && (await ai()).responses.length === 0,
    "action preparation cannot bypass per-request approval",
  );
  await page
    .getByRole("button", { name: "EveryHint settings", exact: true })
    .click();
  await page.getByLabel("Analyse microphone locally", { exact: true }).check();
  await page
    .getByRole("button", { name: "Apply intelligence settings", exact: true })
    .click();
  await wait((value) => value.settings.sources.microphone);
  check(
    (await state()).session.consent === null && (await ai()).review === null,
    "local source preferences neither grant capture nor retain an outdated review",
  );
  await page
    .getByLabel("Automatic request cooldown seconds", { exact: true })
    .fill("29");
  await page
    .getByRole("button", { name: "Apply intelligence settings", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "cooldownSeconds" })
    .waitFor();
  check(
    (await get()).settings.cooldownSeconds === 30,
    "invalid cooldown is rejected without changing authoritative preferences",
  );
  await page
    .getByLabel("Automatic request cooldown seconds", { exact: true })
    .fill("30");
  await page
    .getByRole("button", { name: "EveryHint settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await page
    .getByLabel("Compact conversation intelligence", { exact: true })
    .waitFor();
  check(
    (await state()).settings.compact,
    "compact layout exposes selected operating mode",
  );
  check(
    await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds().height >= 280,
    ),
    "automatic-mode compact window allocates room for question/suggestion/answer",
  );
  const geometry = await page.evaluate(() => {
    const footer = document
      .querySelector(".capture-controls")
      .getBoundingClientRect();
    const panel = document
      .querySelector(".intelligence-compact")
      .getBoundingClientRect();
    return (
      footer.bottom <= innerHeight &&
      panel.top >= 0 &&
      panel.bottom <= footer.top
    );
  });
  check(geometry, "compact intelligence and emergency controls remain visible");
  await page
    .getByRole("button", { name: "Expand EveryHint", exact: true })
    .click();
  await page.getByLabel("Operating mode", { exact: true }).selectOption("live");
  await wait((value) => value.mode === "live");
  await page.getByLabel("Live Assist permission", { exact: true }).waitFor();
  check(
    await page
      .getByRole("button", { name: "Authorise Live Assist", exact: true })
      .isDisabled(),
    "Live permission cannot start without active capture, local transcription and an available own-account model",
  );
  check(
    (await page
      .getByLabel("Acknowledge Live remote sharing", { exact: true })
      .isDisabled()) && (await get()).live === null,
    "Live sharing acknowledgement is never preselected or inferred from local preferences",
  );
  const noGrant = await page.evaluate(() =>
    window.everyhint.authoriseLive({ acknowledged: false }),
  );
  check(
    !noGrant.ok && (await get()).live === null,
    "main enforces separate explicit Live acknowledgement",
  );
  // Labelled renderer-only events exercise the suggestion/timeline UI. They are
  // not captured speech or provider output, and forged acceptance must fail main.
  const fixture = structuredClone(await get());
  fixture.revision += 10000;
  fixture.questions = [
    {
      id: "renderer-question",
      sessionId: "renderer-fixture",
      transcriptId: "renderer-speech",
      source: "systemAudio",
      text: "Renderer fixture: Why use a dictionary?",
      at: Date.now(),
      expiresAt: Date.now() + 90000,
      confidence: 0.94,
      relevance: 0.95,
      automaticEligible: true,
      reason: "Renderer fixture only",
      screen: null,
      contextIds: [],
    },
  ];
  fixture.suggestions = [0, 1, 2].map((index) => ({
    id: `renderer-suggestion-${index}`,
    sessionId: "renderer-fixture",
    questionId: "renderer-question",
    action: "get-answer",
    text: `Renderer fixture suggestion ${index + 1}`,
    at: Date.now(),
    expiresAt: Date.now() + 90000,
    score: 0.9 - index * 0.1,
    source: "systemAudio",
  }));
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:intelligence",
        value,
      ),
    fixture,
  );
  await page
    .getByText("Renderer fixture suggestion 1", { exact: true })
    .waitFor();
  check(
    (await page.locator(".suggestion-card").count()) === 3,
    "renderer displays at most the three ranked suggestion cards",
  );
  const top = page
    .locator(".suggestion-card")
    .first()
    .getByRole("button", { name: "Accept · Get Answer", exact: true });
  await top.focus();
  check(
    await top.evaluate((element) => element === document.activeElement),
    "top suggestion is keyboard focusable",
  );
  await top.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "suggestion expired" })
    .waitFor();
  check(
    (await ai()).responses.length === 0,
    "forged renderer suggestion cannot become remote content",
  );
  const liveFixture = {
    ...fixture,
    revision: fixture.revision + 1,
    mode: "live",
    live: {
      id: "renderer-live-fixture",
      captureSessionId: "renderer-fixture",
      captureEpoch: 1,
      assistantSessionId: (await ai()).sessionId,
      accountId: "renderer-account",
      model: "Renderer fixture only",
      sourceId: null,
      sourceName: null,
      sharing: {
        microphone: true,
        systemAudio: false,
        screenshot: false,
        history: false,
      },
      startedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      cooldownSeconds: 30,
      requestLimit: 20,
      requests: 1,
      nextRequestAt: Date.now() + 30000,
      confidenceThreshold: 0.85,
    },
  };
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:intelligence",
        value,
      ),
    liveFixture,
  );
  const responseFixture = {
    ...(await ai()),
    revision: 100000,
    responses: [
      {
        requestId: "renderer-automatic-answer",
        sessionId: (await ai()).sessionId,
        provider: "codex",
        question: "Renderer automatic answer fixture",
        text: "Synthetic streaming UI fixture only",
        automatic: true,
        status: "generating",
        startedAt: Date.now(),
        firstTextAt: Date.now(),
        endedAt: null,
        error: null,
        usage: null,
        model: "Renderer fixture only",
      },
    ],
  };
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:assistant",
        value,
      ),
    responseFixture,
  );
  await page
    .getByLabel("Automatic remote sharing enabled", { exact: true })
    .waitFor();
  check(
    await page
      .getByRole("button", { name: "Pause Live Assist", exact: true })
      .isVisible(),
    "remote-enabled state remains visible even between answers with immediate Pause Live",
  );
  await page
    .getByRole("button", { name: "EveryHint settings", exact: true })
    .click();
  check(
    (await page
      .getByRole("button", { name: "Pause Live Assist", exact: true })
      .isVisible()) &&
      (await page
        .getByRole("button", { name: "Cancel remote request", exact: true })
        .isVisible()),
    "Live permission and remote cancel remain accessible in Settings",
  );
  await page
    .getByRole("button", { name: "Pause Live Assist", exact: true })
    .click();
  check(
    (await get()).live === null,
    "fixture display cannot mint a real automatic-sharing grant",
  );
  await page
    .getByRole("button", { name: "EveryHint settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await page.locator(".assistant-compact").waitFor({ state: "visible" });
  await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setZoomFactor(1.25);
    win.setBounds({ width: 360, height: 320 });
  });
  await page.waitForFunction(() => innerWidth <= 300);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const liveGeometry = await page.evaluate(() => {
    const content = document.querySelector(".content").getBoundingClientRect(),
      answer = document
        .querySelector(".assistant-compact")
        .getBoundingClientRect(),
      question = document
        .querySelector(".intelligence-compact")
        .getBoundingClientRect(),
      controls = document
        .querySelector(".capture-controls")
        .getBoundingClientRect();
    const clippedButtons = Array.from(document.querySelectorAll("button"))
      .filter(
        (button) =>
          button.getClientRects().length &&
          getComputedStyle(button).visibility !== "hidden" &&
          (!button.classList.contains("skip-link") ||
            button === document.activeElement),
      )
      .map((button) => ({
        label: button.getAttribute("aria-label") || button.textContent,
        rect: button.getBoundingClientRect().toJSON(),
      }))
      .filter(
        ({ rect }) =>
          rect.left < -1 ||
          rect.right > innerWidth + 1 ||
          rect.top < -1 ||
          rect.bottom > innerHeight + 1,
      );
    return {
      clippedButtons,
      fits:
        answer.top >= content.top &&
        answer.bottom <= content.bottom &&
        question.top >= content.top &&
        question.bottom <= content.bottom &&
        controls.bottom <= innerHeight,
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= innerWidth + 1,
      viewport: { width: innerWidth, height: innerHeight },
      content: content.toJSON(),
      answer: answer.toJSON(),
      question: question.toJSON(),
      controls: controls.toJSON(),
    };
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/p7-compact-geometry.json",
    JSON.stringify(liveGeometry, null, 2),
  );
  const compactImage = await desktop.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage())
      .toPNG()
      .toString("base64"),
  );
  await writeFile(
    "artifacts/p7-compact-live-125.png",
    Buffer.from(compactImage, "base64"),
  );
  check(
    liveGeometry.fits,
    "narrow compact Live view keeps question, suggestion, answer and emergency controls visible at 125% zoom",
  );
  check(
    liveGeometry.noHorizontalOverflow && !liveGeometry.clippedButtons.length,
    "narrow compact Live view has no horizontal overflow or clipped visible controls",
  );
  check(
    (await desktop.evaluate(() => globalThis.__p7Network.length)) === 0,
    "all local intelligence/action/UI checks made zero external requests",
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/p7-suggestions-fixture.png" });
  await desktop.close();
  desktop = undefined;
  const saved = JSON.parse(
    await readFile(join(profile, "settings.json"), "utf8"),
  );
  check(
    saved.settings.intelligence.sources.microphone &&
      !JSON.stringify(saved).includes("Alex") &&
      !JSON.stringify(saved).includes("expiresAt") &&
      !JSON.stringify(saved).includes("Dictionary lookup"),
    "only validated local preferences persist, not participant text/context/grants",
  );
  page = await open();
  check(
    (await get()).mode === "manual" &&
      (await get()).live === null &&
      (await state()).session.state === "IDLE",
    "restart restores neither mode, automatic permission nor capture",
  );
  check(errors.length === 0, `no renderer exceptions: ${errors.join(", ")}`);
  await desktop.close();
  desktop = undefined;
  await writeFile(
    "artifacts/p7-smoke.json",
    JSON.stringify(
      {
        assertions,
        remoteRequests: 0,
        paidRequests: 0,
        realCapture: false,
        rendererFixtures: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Intelligence Electron smoke passed: ${assertions} assertions; no remote requests or real capture. Suggestions used labelled renderer fixtures.`,
  );
} finally {
  if (desktop) await desktop.close();
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes("everyhint-p7-smoke-")
  )
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  else {
    process.exitCode = 1;
    console.error("Unsafe smoke cleanup path; cleanup skipped.");
  }
}
