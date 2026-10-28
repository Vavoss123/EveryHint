import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import electronPath from "electron";
import { _electron } from "playwright-core";

const project = resolve(import.meta.dirname, "..");
const profile = await mkdtemp(join(tmpdir(), "everyhint-ai-smoke-"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  EVERYHINT_SPEECH_HOME: join(profile, "speech"),
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
])
  delete env[key];
let desktop,
  assertions = 0;
const errors = [];
const startedAt = performance.now();
const check = (value, message) => {
  assert.ok(value, message);
  assertions++;
};
try {
  desktop = await _electron.launch({
    executablePath: electronPath,
    args: [project],
    cwd: project,
    env,
    timeout: 30000,
  });
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.everyhint));
  const get = async () => {
    const result = await page.evaluate(() => window.everyhint.getAssistant());
    assert.ok(result.ok, result.error);
    return result.value;
  };
  const wait = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const value = await get();
      if (predicate(value)) return value;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error("Assistant state did not settle.");
  };
  const initial = await wait((value) =>
    value.providers.every((provider) => provider.auth !== "unknown"),
  );
  const startupMs = performance.now() - startedAt;
  const idleRssBytes = await desktop.evaluate(() => process.memoryUsage().rss);
  const account = await page.evaluate(() =>
    window.everyhint.getAccountConnection(),
  );
  check(
    account.ok &&
      account.value.state === "signed-out" &&
      initial.providers.find((provider) => provider.id === "codex").auth ===
        "missing",
    "EveryHint uses a fresh account profile without reusing the shared Codex login",
  );
  check(
    await page
      .getByRole("button", { name: "Continue with ChatGPT", exact: true })
      .isEnabled(),
    "official ChatGPT sign-in can be started from the app",
  );
  check(
    await page
      .getByRole("button", { name: "Sign out of ChatGPT", exact: true })
      .isDisabled(),
    "sign-out is unavailable without an app-owned connection",
  );
  check(
    initial.selected === "codex" &&
      !initial.claudeApiBilling &&
      initial.responses.length === 0,
    "startup never starts requests or enables billing",
  );
  check(
    initial.providers.find((provider) => provider.id === "codex").ready ===
      false,
    "ChatGPT inference requires an app-owned plan grant and selected model",
  );
  check(
    (
      await page.getByLabel("Assist preset").locator("option").allTextContents()
    ).join("|") === "General Assist|Code Assist|Conversation Assist",
    "three built-in presets are available without a custom-mode editor",
  );
  check(
    (
      await page
        .getByLabel("Transcript time window")
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value))
    ).join(",") === "30,60,180,300",
    "transcript windows expose 30 seconds, one, three and five minutes",
  );
  await page
    .getByRole("button", { name: "Get Answer · review context", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Enter a question or select available" })
    .waitFor();
  check(
    (await get()).review === null && (await get()).responses.length === 0,
    "blank Assist never invents context or triggers inference",
  );
  check(
    await page.getByLabel("ChatGPT model", { exact: true }).isDisabled(),
    "model selection waits for an explicit authorised catalog request",
  );
  check(
    await page
      .getByRole("button", { name: "Refresh ChatGPT models", exact: true })
      .isDisabled(),
    "model discovery cannot start without account sign-in",
  );
  check(
    await page.getByLabel("AI provider").isEnabled(),
    "provider selection works",
  );
  const rejected = await page.evaluate(async () => ({
    select: await window.everyhint.selectProvider("automatic"),
    billing: await window.everyhint.setClaudeApiBilling("true"),
    review: await window.everyhint.reviewContext({
      question: "q",
      options: {},
    }),
    ask: await window.everyhint.ask({ reviewId: "forged", acknowledged: true }),
    action: await window.everyhint.assistant("run-command"),
    copy: await window.everyhint.copyResponse({ command: "invalid" }),
    account: await window.everyhint.account({
      action: "sign-in",
      apiKey: "invalid",
    }),
    model: await window.everyhint.selectModel("unlisted-model"),
    accountSelect: await window.everyhint.selectChatgptAccount({
      token: "invalid",
    }),
    models: await window.everyhint.discoverModels(),
  }));
  check(
    Object.values(rejected).every((value) => !value.ok),
    "all AI IPC routes reject malformed or unauthorised input",
  );
  const untrusted = await desktop.evaluate(
    async ({ BrowserWindow }, preload) => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          preload,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      try {
        await win.loadURL("data:text/html,<p>Untrusted test sender</p>");
        return await win.webContents.executeJavaScript(
          'window.everyhint.account("sign-in")',
        );
      } finally {
        win.destroy();
      }
    },
    join(project, "out", "preload", "index.cjs"),
  );
  check(
    !untrusted.ok && untrusted.error.includes("Untrusted"),
    "real IPC rejects a second renderer outside the authorised window",
  );
  await page.getByLabel("AI provider").selectOption("claude");
  check(
    await page
      .getByRole("button", {
        name: "Sign in with Claude — unavailable",
        exact: true,
      })
      .isDisabled(),
    "unsupported Claude subscription login is labelled and disabled",
  );
  await page
    .getByLabel("Your question")
    .fill("Explain this synthetic question.");
  const reviewStart = performance.now();
  await page
    .getByRole("button", { name: "Get Answer · review context", exact: true })
    .click();
  await page.getByLabel("Context review").waitFor();
  const reviewMs = performance.now() - reviewStart;
  const reviewedRssBytes = await desktop.evaluate(
    () => process.memoryUsage().rss,
  );
  check(
    (await get()).review.question === "Explain this synthetic question.",
    "review freezes the question in main",
  );
  check(
    (await get()).responses.length === 0,
    "review makes no provider request",
  );
  check(
    await page
      .getByRole("button", { name: "Ask Claude", exact: true })
      .isDisabled(),
    "Ask requires transfer acknowledgement and readiness",
  );
  check(
    !(await page.getByLabel("Acknowledge remote transfer").isChecked()),
    "remote consent is not preselected",
  );
  await page.getByLabel("Acknowledge remote transfer").check();
  check(
    await page
      .getByRole("button", { name: "Ask Claude", exact: true })
      .isDisabled(),
    "transfer consent cannot bypass disabled billing/auth",
  );
  await page.getByLabel("Your question").fill("Updated question.");
  await wait((value) => value.review === null);
  check(
    (await get()).review === null,
    "editing the question invalidates the review",
  );
  await page
    .getByText("Enable separately billed Claude API requests", { exact: false })
    .click();
  await wait((value) => value.claudeApiBilling);
  const enabled = await get();
  check(
    enabled.providers.find((provider) => provider.id === "claude").auth ===
      "missing",
    "opt-in does not invent an API credential",
  );
  await page
    .getByRole("button", { name: "Get Answer · review context", exact: true })
    .click();
  const id = (await get()).review.requestId;
  const denied = await page.evaluate(
    (reviewId) => window.everyhint.ask({ reviewId, acknowledged: false }),
    id,
  );
  check(!denied.ok, "main enforces per-request disclosure independently of UI");
  await page.evaluate(
    (reviewId) => window.everyhint.ask({ reviewId, acknowledged: true }),
    id,
  );
  await wait((value) => value.responses[0]?.status === "error");
  check(
    (await get()).responses[0].error.code === "auth",
    "missing API key is a real error with no provider fallback",
  );
  await page
    .getByRole("button", { name: "Regenerate · review first", exact: true })
    .click();
  await page.getByLabel("Context review", { exact: true }).waitFor();
  check(
    !(await page.getByLabel("Acknowledge remote transfer").isChecked()) &&
      (await get()).responses.length === 1,
    "regenerate prepares a new review and requires fresh approval",
  );
  const previousSession = (await get()).sessionId;
  await page.getByLabel("AI provider").selectOption("codex");
  const switched = await get();
  check(
    switched.sessionId !== previousSession &&
      !switched.responses.length &&
      !switched.review,
    "provider switch resets conversation and reviewed context",
  );
  // Renderer fixture events test rendering/streaming only, never live provider verification.
  const fixture = structuredClone(switched);
  fixture.revision += 1;
  fixture.responses = [
    {
      requestId: "renderer-fixture",
      sessionId: fixture.sessionId,
      provider: "codex",
      question: "Renderer fixture",
      text: '# Rendered answer\n\n- First point\n- Second point\n\n| Item | Count |\n| --- | --- |\n| Red | 3 |\n\n<img src="https://invalid.example/evil" onerror="window.injected=true">\n\n```ts\nconst answer = 42;\n```',
      status: "generating",
      startedAt: Date.now(),
      firstTextAt: Date.now(),
      endedAt: null,
      error: null,
      usage: null,
      model: "local rendering fixture",
    },
  ];
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:assistant",
        value,
      ),
    fixture,
  );
  await page.getByText("const answer = 42;", { exact: true }).waitFor();
  check(
    (await page.locator(".ai-response pre code").innerText()) ===
      "const answer = 42;\n",
    "code fences render as selectable code",
  );
  check(
    (await page.locator(".ai-response h1").innerText()) === "Rendered answer" &&
      (await page.locator(".ai-response li").count()) === 2 &&
      (await page.locator(".ai-response td").count()) === 2,
    "headings, lists and tables render during streaming",
  );
  check(
    await page
      .locator(".code-toolbar")
      .innerText()
      .then((text) => text.includes("ts")),
    "code language is labelled",
  );
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Copied$/ })
    .waitFor();
  check(
    (await desktop.evaluate(({ clipboard }) => clipboard.readText())) ===
      "const answer = 42;\n",
    "per-code copy sends only code through the bounded clipboard route",
  );
  check(
    (await page.locator(".ai-response img").count()) === 0 &&
      (await page.evaluate(() => !window.injected)),
    "provider HTML is escaped and cannot create remote images or execute code",
  );
  await page
    .getByRole("button", { name: "Copy response", exact: true })
    .click();
  await page.getByText("Response copied.", { exact: true }).waitFor();
  const copied = await desktop.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  check(
    copied === fixture.responses[0].text,
    "copy response preserves the original code and text",
  );
  check(
    await page
      .getByRole("button", { name: "Cancel request", exact: true })
      .isEnabled(),
    "cancel is available while generating",
  );
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  check(
    !(await page.locator(".capture-status").innerText()).includes("LOCAL ONLY"),
    "capture status does not claim the entire app is local-only during an AI request",
  );
  check(
    await page.locator(".assistant-compact").isVisible(),
    "assistant status and cancel remain available in compact mode",
  );
  await page
    .getByRole("button", { name: "Expand EveryHint", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear conversation", exact: true })
    .click();
  await wait((value) => value.responses.length === 0);
  check(
    (await get()).responses.length === 0,
    "clear resets actual local history",
  );
  // Account UI states are fixtures only: no browser/OAuth operation is launched.
  const actualAccount = (
    await page.evaluate(() => window.everyhint.getAccountConnection())
  ).value;
  const accountFixture = {
    ...actualAccount,
    revision: actualAccount.revision + 100,
    state: "signing-in",
    message: "Local sign-in rendering fixture.",
  };
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:account",
        value,
      ),
    accountFixture,
  );
  check(
    await page
      .getByRole("button", { name: "Cancel sign-in", exact: true })
      .isEnabled(),
    "pending sign-in exposes cancellation",
  );
  check(
    await page
      .getByRole("button", { name: "Continue with ChatGPT", exact: true })
      .isDisabled(),
    "pending sign-in prevents repeated clicks",
  );
  await page
    .getByRole("button", { name: "Cancel sign-in", exact: true })
    .click();
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:account",
        value,
      ),
    {
      ...accountFixture,
      revision: accountFixture.revision + 1,
      state: "signed-in",
      message: "Local signed-in rendering fixture.",
      planUsage: false,
      selectedAccount: "fixture-account",
      accounts: [
        {
          id: "fixture-account",
          label: "Local account rendering fixture",
          signedIn: true,
        },
      ],
    },
  );
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (button) =>
        button.textContent.trim() === "Sign out of ChatGPT" && !button.disabled,
    ),
  );
  check(
    (await page
      .getByRole("button", { name: "Continue with ChatGPT", exact: true })
      .isEnabled()) &&
      (await page
        .getByRole("button", { name: "Sign out of ChatGPT", exact: true })
        .isEnabled()),
    "signed-in controls expose account switching and sign-out",
  );
  check(
    await page
      .getByRole("button", {
        name: "Grant ChatGPT plan permission",
        exact: true,
      })
      .isEnabled(),
    "identity-only sign-in exposes explicit plan consent",
  );
  check(
    await page.getByLabel("ChatGPT registration", { exact: true }).isEnabled(),
    "saved registration picker is available",
  );
  await desktop.evaluate(
    ({ BrowserWindow }, value) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "everyhint:account",
        value,
      ),
    { ...actualAccount, revision: accountFixture.revision + 2 },
  );
  check(
    (await page.getByLabel("Your question").inputValue()) === "",
    "clear also removes the question draft",
  );
  await mkdir("artifacts", { recursive: true });
  await page
    .getByLabel("ChatGPT account connection", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/everyhint-ai.png" });
  check(errors.length === 0, `no renderer exceptions: ${errors.join(", ")}`);
  await desktop.close();
  desktop = undefined;
  const files = await readdir(profile, { recursive: true });
  check(
    !files.some((file) =>
      /transcript|conversation|screenshot|auth\.json|ai.*\.json/i.test(file),
    ),
    "assistant payloads and credentials are not persisted in the app profile",
  );
  const settings = JSON.parse(
    await readFile(join(profile, "settings.json"), "utf8"),
  );
  check(
    !JSON.stringify(settings).includes("claudeApiBilling"),
    "billing opt-in is not persisted",
  );
  await writeFile(
    "artifacts/ai-smoke.json",
    JSON.stringify(
      {
        assertions,
        startupMs,
        reviewMs,
        idleRssBytes,
        reviewedRssBytes,
        chatgptAuth: initial.providers.find(
          (provider) => provider.id === "codex",
        ).auth,
        liveProviderRequests: 0,
        paidRequests: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    `AI Electron smoke passed: ${assertions} assertions. ChatGPT auth=${initial.providers.find((provider) => provider.id === "codex").auth}. No remote inference or paid requests. Renderer streaming used labelled fixtures.`,
  );
} finally {
  if (desktop) await desktop.close();
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep))
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
}
