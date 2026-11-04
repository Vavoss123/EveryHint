import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { posixPaths } from "./posix-paths.mjs";
import { rendererCdp } from "./renderer-cdp.mjs";

const paths = posixPaths(),
  profile = await mkdtemp(join(tmpdir(), "everyhint-portable-"));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const env = {
  ...process.env,
  EVERYHINT_TEST_USER_DATA: profile,
  EVERYHINT_SPEECH_HOME: join(profile, "speech"),
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
])
  delete env[key];
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
let child, browser, floating;
let startupLog = "";
const checks = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
};
try {
  child = spawn(
    paths.executable,
    [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      startupLog = (startupLog + chunk.toString()).slice(-64000);
    });
  const exited = new Promise((r) => child.once("exit", r));
  const deadline = Date.now() + 30000;
  while (!browser && Date.now() < deadline && child.exitCode === null) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(browser, "Native packaged app opened");
  const context = browser.contexts()[0];
  let page;
  while (!page && Date.now() < deadline) {
    page = context
      .pages()
      .find(
        (p) => p.url().includes("index.html") && !p.url().includes("overlay=1"),
      );
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(page, "Native dashboard loaded");
  await page.locator(".app").waitFor();
  const status = await page.evaluate(() => window.everyhint.desktopStatus());
  check(
    status.ok &&
      status.value.packaged &&
      status.value.version === version &&
      status.value.platform === process.platform,
    "Packaged identity matches native platform/version",
  );
  const state = (await page.evaluate(() => window.everyhint.getSnapshot()))
    .value;
  check(
    state.session.state === "IDLE" && state.session.consent === null,
    "Startup begins no capture",
  );
  check(
    state.privacy.state === "unsupported",
    "Windows content protection is not falsely advertised",
  );
  check(
    (await page.evaluate(() => window.everyhint.getTranscription())).value
      .runtimeInstalled,
    "Native signed/hash-bound speech helper loads",
  );
  check(
    (
      await page.evaluate(() => ({
        node: typeof window.require,
        process: typeof window.process,
      }))
    ).node === "undefined",
    "Renderer stays sandboxed",
  );
  check(
    !(await page.evaluate(() => window.everyhint.update("check"))).ok,
    "No unconfigured automatic update access",
  );
  const personal = await page.evaluate(() => window.everyhint.personal.get());
  const unlocked = await page.evaluate(
    (scopeId) =>
      window.everyhint.personal.command({ scopeId, value: { type: "unlock" } }),
    personal.value.scopeId,
  );
  check(
    unlocked.ok,
    "Native persistent credential store and encrypted worker unlock",
  );
  const shown = await page.evaluate(() => window.everyhint.window("overlay"));
  check(shown.ok, "Native assistant show action accepted");
  floating = await rendererCdp(port, (url) => url.includes("overlay=1"));
  const assistantDeadline = Date.now() + 15000;
  let roots = 0;
  while (roots === 0 && Date.now() < assistantDeadline) {
    roots = await floating.evaluate(
      'document.querySelectorAll(".floating-assistant").length',
    );
    if (roots === 0) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(
    roots === 1,
    "One native assistant renderer",
  );
  check(
    await floating.evaluate(`(() => {
      const hide = [...document.querySelectorAll('button')]
        .find(button => button.textContent.trim() === 'Hide');
      if (!hide) return false;
      hide.click();
      return true;
    })()`),
    "Native assistant Hide control responds",
  );
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.session
      .state === "IDLE",
    "Hiding grants no capture permission",
  );
  await page.evaluate(() => window.everyhint.window("quit")).catch(() => {});
  let timer;
  const code = await Promise.race([
    exited,
    new Promise((r) => {
      timer = setTimeout(() => r("timeout"), 10000);
    }),
  ]);
  clearTimeout(timer);
  check(code === 0, "Native app quits gracefully");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    `artifacts/smoke-${paths.label}-${process.arch}.json`,
    JSON.stringify(
      {
        version,
        platform: process.platform,
        arch: process.arch,
        checks,
        genuineInference: 0,
        physicalCapture: false,
      },
      null,
      2,
    ),
  );
  console.log(
    `Native ${paths.label}/${process.arch} smoke passed: ${checks.length} assertions.`,
  );
} catch (error) {
  if (startupLog) console.error(startupLog);
  throw error;
} finally {
  floating?.close();
  if (browser) await browser.close().catch(() => {});
  if (child && child.exitCode === null) child.kill("SIGKILL");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
