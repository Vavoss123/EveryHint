// Launch the final fused binary normally; Chromium CDP observes only its renderer.
// No Node inspector, shell startup, provider auth or physical media.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { chromium } from "playwright-core";
const packageVersion = JSON.parse(
  await readFile("package.json", "utf8"),
).version;
const executable = resolve(
  process.env.EVERYHINT_PACKAGED_EXE ?? "release/win-unpacked/EveryHint.exe",
);
const root = await mkdtemp(join(tmpdir(), "everyhint-p11-packaged-")),
  env = {
    ...process.env,
    EVERYHINT_TEST_USER_DATA: root,
    EVERYHINT_SPEECH_HOME: join(root, "speech"),
    ELECTRON_RENDERER_URL: "http://127.0.0.1:1/untrusted",
  };
for (const k of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "NODE_OPTIONS",
])
  delete env[k];
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await new Promise((r) => server.close(r));
let child, browser;
let checks = 0;
const errors = [],
  check = (v, m) => {
    assert.ok(v, m);
    checks++;
  };
try {
  child = spawn(
    executable,
    [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"],
    { env, windowsHide: true, stdio: "ignore" },
  );
  const deadline = Date.now() + 30000;
  while (!browser && Date.now() < deadline) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(browser, "Packaged CDP start");
  const context = browser.contexts()[0];
  let page;
  const readyBy = Date.now() + 15000;
  while (!page && Date.now() < readyBy) {
    page = context
      .pages()
      .find(
        (p) => p.url().includes("index.html") && !p.url().includes("overlay=1"),
      );
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(page, "Packaged dashboard opened");
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(
    () => window.everyhint && document.querySelector(".app"),
  );
  check(
    page.url().startsWith("everyhint://app/"),
    "Packaged renderer ignores malicious development URL",
  );
  const status = await page.evaluate(() => window.everyhint.desktopStatus());
  check(
    status.ok &&
      status.value.packaged &&
      status.value.version === packageVersion &&
      status.value.updates.state === "unconfigured",
    "Packaged identity and disabled updates",
  );
  check(
    !(await page.evaluate(() => window.everyhint.update("check"))).ok,
    "Packaged update check refuses unconfigured feed",
  );
  check(
    !(await page.evaluate(() => window.everyhint.update("install"))).ok,
    "Packaged update install refuses unconfigured trust",
  );
  const state = (await page.evaluate(() => window.everyhint.getSnapshot()))
    .value;
  check(
    state.session.state === "IDLE" && state.session.consent === null,
    "Capture initially disabled",
  );
  check(
    await page.evaluate(
      () => typeof window.everyhint.getIntelligence === "undefined",
    ),
    "No automatic AI API is exposed",
  );
  check(
    (
      await page.evaluate(
        (s) => window.everyhint.saveSettings({ ...s, protectWindow: true }),
        state.settings,
      )
    ).ok,
    "Packaged settings writable",
  );
  check(
    (await page.evaluate(() => window.everyhint.getSnapshot())).value.privacy
      .configured,
    "Packaged protection readback",
  );
  check(
    (await page.evaluate(() => window.everyhint.getTranscription())).value
      .runtimeInstalled,
    "Packaged helper hash verified",
  );
  const contextState = await page.evaluate(() => ({
    node: typeof window.require,
    process: typeof window.process,
  }));
  check(
    contextState.node === "undefined" && contextState.process === "undefined",
    "Packaged sandbox bridge",
  );
  const accounts = await page.evaluate(() =>
    window.everyhint.getAccountConnection(),
  );
  check(accounts.ok, "Packaged account bridge/native credential module loads");
  const moduleProgram =
    '$ErrorActionPreference="Stop"; $ProgressPreference="SilentlyContinue"; @((Get-Process -Id ([int]$env:EVERYHINT_ROOT_PROCESS)).Modules | Where-Object { $_.ModuleName -eq "vcruntime140.dll" } | Select-Object -ExpandProperty FileName) | ConvertTo-Json -Compress';
  const loaded = JSON.parse(
    execFileSync(
      join(
        process.env.SystemRoot,
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(moduleProgram, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, EVERYHINT_ROOT_PROCESS: String(child.pid) },
      },
    ),
  );
  // Windows can preload an already-installed system CRT before the addon loads.
  // Record that honestly; checking a host without the CRT requires a clean VM.
  check(
    [loaded].flat().some((p) => /vcruntime140\.dll$/i.test(p)) &&
      (await readFile(join(dirname(executable), "vcruntime140.dll"))).length >
        0,
    "Native credential runtime is loaded and the app-local fallback is installed",
  );
  check(errors.length === 0, "No renderer errors");
  await writeFile(
    "artifacts/p11-packaged-smoke.json",
    JSON.stringify(
      {
        checks,
        errors,
        url: page.url(),
        status: status.value,
        vcRuntimeLoadedFrom: loaded,
        appLocalRuntimePresent: true,
        hardware: "pending",
        cleanWindowsInstaller: "pending",
        oauthRealBrowser: "pending",
      },
      null,
      2,
    ),
  );
  console.log(`${checks} final packaged-binary assertions passed`);
} finally {
  if (browser) await browser.close();
  // The fixture has not started capture. Terminate only this known test process tree.
  if (child && child.exitCode === null)
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  if (
    dirname(root) === resolve(tmpdir()) &&
    basename(root).startsWith("everyhint-p11-packaged-")
  )
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
}
