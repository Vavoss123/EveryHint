// Final fused app, real bundled helper/SQLite/keyring, synthetic owned media only.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, link, copyFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createServer } from "node:net";
import { builtinModules } from "node:module";
import { build } from "rolldown";
import { chromium } from "playwright-core";
import { loadSpeechFixture } from "./speech-fixture.mjs";
import { installSyntheticAudio } from "./synthetic-audio.mjs";

const output = resolve("artifacts/rc");
await mkdir(output, { recursive: true });
await build({ input: "scripts/rc-vault.ts", external: [...builtinModules, ...builtinModules.map(n => `node:${n}`), "@napi-rs/keyring"],
  platform: "node", output: { file: join(output, "vault.mjs"), format: "esm" } });
const cache = process.env.EVERYHINT_SPEECH_HOME ?? join(process.env.LOCALAPPDATA, "EveryHint/speech");
const fixture = await loadSpeechFixture(cache);
const home = await mkdtemp(join(tmpdir(), "everyhint-rc-"));
const env = { ...process.env, EVERYHINT_TEST_USER_DATA: home, EVERYHINT_SPEECH_HOME: join(home, "speech"),
  ELECTRON_RENDERER_URL: "http://127.0.0.1:1/forbidden" };
for (const key of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"])
  delete env[key];
const checks = [], errors = [], report = { physicalCapture: false, genuineOAuth: false, genuineAIRequests: 0, syntheticIdentityRegistrations: true, providerGrant: false, restarts: 0 };
let child, browser, page, seeded = false;
const check = (value, name) => { assert.ok(value, name); checks.push(name); };
const unwrap = result => { assert.ok(result.ok, result.error); return result.value; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const vault = action => execFileSync(process.execPath, [join(output, "vault.mjs"), action, home], { windowsHide: true });
const native = (pid, affinity = false) => {
  const value = execFileSync(join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-File", resolve("scripts/rc-process.ps1"), "-RootProcessId", String(pid), ...(affinity ? ["-Affinity"] : [])], { windowsHide: true, encoding: "utf8", timeout: 20000 });
  return value.trim() ? JSON.parse(value) : [];
};
async function waitState(read, predicate, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) { value = unwrap(await page.evaluate(read)); if (predicate(value)) return value; await pause(100); }
  throw Error(`Fixture state did not settle: ${JSON.stringify(value)}`);
}
async function launch() {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const start = performance.now();
  child = spawn(resolve("release/win-unpacked/EveryHint.exe"), [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"], { env, windowsHide: false, stdio: "ignore" });
  child.on("error", error => errors.push(error.message));
  const deadline = Date.now() + 30000;
  while (!browser && Date.now() < deadline) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await pause(200); } }
  assert.ok(browser, "Packaged renderer debugging endpoint opened");
  const context = browser.contexts()[0];
  await context.addInitScript(() => {
    if (!location.pathname.endsWith("/audio.html")) return;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { this.loop = true; return start.apply(this, args); };
  });
  await context.addInitScript(installSyntheticAudio, { samples: Array.from(fixture.samples), sampleRate: fixture.sampleRate });
  page = context.pages().find(p => p.url().startsWith("everyhint://app/index")) ?? context.pages()[0] ?? await context.waitForEvent("page");
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForFunction(() => window.everyhint && document.querySelector(".capture-controls"));
  report.readyMs ??= performance.now() - start;
  report.processId = child.pid;
  report.processIds ??= []; report.processIds.push(child.pid);
  check(page.url().startsWith("everyhint://app/"), "Packaged app rejects developer renderer override");
  const status = unwrap(await page.evaluate(() => window.everyhint.desktopStatus()));
  check(status.packaged && status.updates.state === "unconfigured", "Packaged identity and unconfigured updates");
  const initial = unwrap(await page.evaluate(() => window.everyhint.getSnapshot()));
  check(initial.session.state === "IDLE" && initial.session.consent === null, "Startup restores no capture permission");
  check(unwrap(await page.evaluate(() => window.everyhint.getIntelligence())).live === null, "Startup restores no automatic AI grant");
}
async function quit() {
  const target = child, started = performance.now();
  const exited = new Promise(resolve => { if (target.exitCode !== null) resolve(target.exitCode); else target.once("exit", resolve); });
  await page.evaluate(() => window.everyhint.window("quit")).catch(error => { if (!/closed|destroyed|Execution context/.test(error.message)) throw error; });
  let deadline;
  const code = await Promise.race([exited, new Promise(resolve => { deadline = setTimeout(() => resolve("timeout"), 10000); })]);
  clearTimeout(deadline);
  check(code === 0, `Graceful packaged quit returns zero (observed ${code})`);
  report.quitMs = performance.now() - started;
  const after = native(target.pid);
  check((Array.isArray(after) ? after : after ? [after] : []).length === 0, "Owned main process and descendants exit after graceful quit");
  report.quits ??= []; report.quits.push({ ms: report.quitMs, exitCode: code, remainingOwnedProcesses: Array.isArray(after) ? after.length : 1 });
  if (browser) await browser.close(); browser = undefined; child = undefined;
}
async function meeting(method, input) {
  return page.evaluate(async ({ method, input }) => {
    const state = await window.everyhint.meetings.getState(); if (!state.ok) return state;
    return window.everyhint.meetings[method]({ scopeId: state.value.scopeId, input });
  }, { method, input });
}
try {
  vault("seed"); seeded = true;
  const ids = JSON.parse(await readFile(join(home, "fixture-accounts.json"), "utf8"));
  await mkdir(join(home, "speech/models"), { recursive: true });
  await link(join(cache, "models/ggml-tiny.en.bin"), join(home, "speech/models/ggml-tiny.en.bin"))
    .catch(() => copyFile(join(cache, "models/ggml-tiny.en.bin"), join(home, "speech/models/ggml-tiny.en.bin")));
  // A development runtime must never override the packaged resource helper.
  await mkdir(join(home, "speech/runtime"), { recursive: true });
  await writeFile(join(home, "speech/runtime/everyhint-transcriber.exe"), "Not an executable: development fallback sentinel");
  await launch();
  const account = unwrap(await page.evaluate(() => window.everyhint.getAccountConnection()));
  check(account.accounts.length === 2 && account.selectedAccount === ids[0] && !account.planUsage, "Only isolated identity fixtures restored, without plan permission");
  check(!unwrap(await page.evaluate(() => window.everyhint.getAssistant())).providers.find(p => p.id === "codex").ready, "No inference readiness without a plan grant/catalog");
  check(!(await page.evaluate(() => window.everyhint.ask({ reviewId: "forged", acknowledged: true }))).ok, "Forged Ask rejected without inference");
  check(!(await page.evaluate(() => window.everyhint.discoverModels())).ok, "Identity-only model discovery rejected before provider transport");
  const original = unwrap(await page.evaluate(() => window.everyhint.getSnapshot()));
  unwrap(await page.evaluate(settings => window.everyhint.saveSettings({ ...settings, protectWindow: true }), original.settings));
  await waitState(() => window.everyhint.getTranscription(), v => v.models.some(m => m.id === "tiny.en" && m.state === "installed"));
  const affinity = native(child.pid, true);
  report.affinity = affinity;
  check(affinity.success && affinity.affinity === 0x11, "Windows display-affinity configuration reads WDA_EXCLUDEFROMCAPTURE (not receiver proof)");
  unwrap(await page.evaluate(async () => { const state = await window.everyhint.getSnapshot(); return window.everyhint.saveSettings({ ...state.value.settings, compact: false, layout: "dashboard" }); }));
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  const privacy = page.getByRole("checkbox", { name: "Protect EveryHint window content during screen sharing (Windows)" });
  await privacy.focus(); await page.keyboard.press("Space");
  await page.waitForFunction(async () => !(await window.everyhint.getSnapshot()).value.settings.protectWindow);
  check(native(child.pid, true).affinity === 0, "Keyboard Space disables actual Windows affinity");
  await page.keyboard.press("Space");
  await page.waitForFunction(async () => (await window.everyhint.getSnapshot()).value.settings.protectWindow);
  check(native(child.pid, true).affinity === 0x11, "Keyboard Space re-enables actual Windows affinity");
  const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll("button,input,select,textarea"))
    .filter(element => element.getClientRects().length && element.getAttribute("type") !== "hidden")
    .filter(element => !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby") && !(element.labels?.length)
      && !(element.tagName === "BUTTON" && element.textContent.trim()))
    .map(element => ({ tag: element.tagName, type: element.getAttribute("type"), title: element.getAttribute("title") })));
  report.unnamedControls = unnamed;
  check(unnamed.length === 0, `Rendered Settings controls have programmatic labels (${JSON.stringify(unnamed)})`);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  const media = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".desktop-privacy input"));
    return { reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      forced: matchMedia("(forced-colors: active)").matches,
      transition: style.transitionDuration, animation: style.animationName };
  });
  report.accessibilityMedia = media;
  check(media.reduced && media.forced && media.transition.split(",").every(v => parseFloat(v) === 0) && media.animation === "none", "Reduced-motion styles apply under emulated accessibility media (OS/Narrator acceptance pending)");
  await page.locator(".desktop-privacy").screenshot({ path: join(output, "settings-forced-colors.png") });
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });

  unwrap(await meeting("configure", { settings: { enabled: true, autoSave: false, retentionDays: 7 }, acknowledged: true, applyRetention: true }));
  unwrap(await meeting("unlock"));
  const first = unwrap(await meeting("create", { title: "RC encrypted canary A", acknowledged: true }));
  check(first.title === "RC encrypted canary A", "Packaged encrypted SQLite worker creates a meeting");
  const oldScope = unwrap(await page.evaluate(() => window.everyhint.meetings.getState())).scopeId;
  unwrap(await page.evaluate(id => window.everyhint.selectChatgptAccount(id), ids[1]));
  check(!(await page.evaluate(scopeId => window.everyhint.meetings.get({ scopeId, input: { id: "forged" } }), oldScope)).ok, "Account switch rejects the previous encrypted scope");
  unwrap(await meeting("configure", { settings: { enabled: true, autoSave: false, retentionDays: 7 }, acknowledged: true, applyRetention: true }));
  unwrap(await meeting("unlock"));
  const crossAccount = await meeting("get", { id: first.id });
  check(!crossAccount.ok || crossAccount.value === null, `Account B cannot retrieve Account A meeting (${JSON.stringify(crossAccount)})`);
  unwrap(await page.evaluate(id => window.everyhint.selectChatgptAccount(id), ids[0]));
  unwrap(await meeting("unlock"));
  check(unwrap(await meeting("get", { id: first.id })).title === first.title, "Switching back restores A without losing its encrypted data");
  unwrap(await page.evaluate(() => window.everyhint.selectChatgptAccount("new")));
  unwrap(await page.evaluate(() => window.everyhint.account("sign-out")));
  check(unwrap(await page.evaluate(() => window.everyhint.getAccountConnection())).state === "signed-out", "Unconnected local sign-out is safe and idempotent (no real revocation claimed)");
  unwrap(await page.evaluate(id => window.everyhint.selectChatgptAccount(id), ids[0]));

  const speech = await waitState(() => window.everyhint.getTranscription(), v => v.models.some(m => m.id === "tiny.en" && m.state === "installed"));
  check(speech.runtimeInstalled && speech.state === "OFF", "Bundled helper validates and transcription defaults off");
  check(!(await page.evaluate(() => window.everyhint.transcription("enable"))).ok, "Packaged Whisper cannot acquire unconsented audio");
  unwrap(await page.evaluate(() => window.everyhint.prepare({ consent: { screen: false, microphone: true, systemAudio: true, acknowledged: true } })));
  unwrap(await page.evaluate(() => window.everyhint.session("start")));
  unwrap(await page.evaluate(() => window.everyhint.transcription("enable")));
  const final = await waitState(() => window.everyhint.getTranscription(), v => ["microphone", "systemAudio"].every(source => v.events.some(e => e.source === source && e.state === "final" && /country/i.test(e.text))));
  check(final.diagnostics.completedJobs >= 2 && final.diagnostics.queueLength <= 6, "Real bundled Whisper transcribes both synthetic sources within queue bounds");
  report.whisper = final.diagnostics;
  const profileStart = performance.now();
  for (let index = 0; index < 5; index++) {
    await pause(1000);
    const started = performance.now();
    const current = native(child.pid);
    const list = Array.isArray(current) ? current : [current];
    const collected = performance.now();
    const snapshot = unwrap(await page.evaluate(() => window.everyhint.getTranscription()));
    report.samples ??= [];
    report.samples.push({ elapsedMs: performance.now()-profileStart, collectionMs: collected-started, ipcMs: performance.now()-collected, queue: snapshot.diagnostics.queueLength,
      processes: list, worker: snapshot.diagnostics });
  }
  const capture = unwrap(await page.evaluate(() => window.everyhint.getSnapshot()));
  check(capture.session.sources.screen.state === "DISABLED", "Audio verification never captures the real desktop");
  unwrap(await page.evaluate(() => window.everyhint.setOperatingMode("live")));
  const deniedLive = await page.evaluate(async () => {
    const current = (await window.everyhint.getIntelligence()).value;
    return window.everyhint.authoriseLive({ acknowledged: true, expected: current.liveContext,
      sharing: { microphone: true, systemAudio: false, screenshot: false, history: false },
      limits: { sessionMinutes: current.settings.sessionMinutes, cooldownSeconds: current.settings.cooldownSeconds, requestLimit: current.settings.requestLimit } });
  });
  check(!deniedLive.ok && unwrap(await page.evaluate(() => window.everyhint.getIntelligence())).live === null,
    "Packaged Live authorisation refuses a fixture account without plan/model permission");
  unwrap(await page.evaluate(() => window.everyhint.setOperatingMode("manual")));
  const saved = unwrap(await meeting("saveSession", { title: "RC retained synthetic speech", sessionId: capture.session.sessionId, acknowledged: true }));
  unwrap(await page.evaluate(() => window.everyhint.session("stop")));
  await pause(800);
  check(unwrap(await page.evaluate(() => window.everyhint.getTranscription())).diagnostics.queueLength === 0, "Stop drains transcription queue");
  check(unwrap(await page.evaluate(() => window.everyhint.getAssistant())).responses.length === 0, "No AI responses or provider inference throughout capture");
  report.savedMeetingId = saved.id;
  await quit();
  for (const name of await readdir(join(home, "meetings"))) if (name.endsWith(".sqlite"))
    check(!(await readFile(join(home, "meetings", name))).includes(Buffer.from("RC encrypted canary")), "No fixture meeting-title plaintext in SQLite");
  await launch(); report.restarts++;
  unwrap(await meeting("unlock"));
  check(unwrap(await meeting("get", { id: first.id })).title === first.title, "Packaged encrypted records survive a full graceful restart");
  const transcript = unwrap(await meeting("transcript", { id: saved.id, offset: 0 }));
  check(transcript.segments.length > 0, "Saved synthetic transcript loads after restart");
  unwrap(await page.evaluate(() => window.everyhint.prepare({ consent: { screen: false, microphone: true, systemAudio: true, acknowledged: true } })));
  unwrap(await page.evaluate(() => window.everyhint.session("start")));
  unwrap(await page.evaluate(() => window.everyhint.transcription("enable")));
  await waitState(() => window.everyhint.getTranscription(), v => v.state === "LISTENING");
  const activeCapture = unwrap(await page.evaluate(() => window.everyhint.getSnapshot()));
  const activeSaved = unwrap(await meeting("saveSession", { title: "RC active quit", sessionId: activeCapture.session.sessionId, acknowledged: true }));
  await waitState(() => window.everyhint.getTranscription(), v => v.events.some(e => e.state === "final" && /country/i.test(e.text)));
  const activeChildren = native(child.pid);
  const ownedChildren = (Array.isArray(activeChildren) ? activeChildren : [activeChildren]).filter(p => p.pid !== child.pid);
  check(ownedChildren.some(p => p.name === "everyhint-transcriber.exe"), "Actual packaged Whisper child is running before active Quit");
  await quit();
  for (const process of ownedChildren) {
    const remaining = native(process.pid);
    const list = Array.isArray(remaining) ? remaining : remaining ? [remaining] : [];
    check(!list.some(p => p.pid === process.pid && p.created === process.created), `Active Quit releases owned ${process.name} child`);
  }
  await launch(); report.restarts++;
  unwrap(await meeting("unlock"));
  const afterActiveQuit = unwrap(await meeting("get", { id: activeSaved.id }));
  check(afterActiveQuit.status !== "active" && afterActiveQuit.segmentCount > 0, "Active Quit flushes saved final text and leaves no stuck active meeting");
  await quit();
  check(errors.length === 0, "No packaged renderer errors");
  report.status = "passed";
} catch (error) { report.status = "failed"; report.failure = error.message; throw error; }
finally {
  report.checks = checks; report.errors = errors;
  let cleanupFailure;
  report.cleanup = { credentialsCleared: !seeded, profileRemoved: false, forcedProcessTermination: false };
  try { if (browser) await browser.close(); } catch (error) { cleanupFailure = error; }
  try {
    if (child && child.exitCode === null) {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      report.cleanup.forcedProcessTermination = true;
    }
  } catch (error) { if (child?.exitCode === null) cleanupFailure ??= error; }
  try { if (seeded) vault("clear"); report.cleanup.credentialsCleared = true; } catch (error) { cleanupFailure ??= error; }
  try {
    if (dirname(home) !== resolve(tmpdir()) || !basename(home).startsWith("everyhint-rc-")) cleanupFailure ??= Error("Unowned cleanup path.");
    else { await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); report.cleanup.profileRemoved = true; }
  } catch (error) { cleanupFailure ??= error; }
  if (cleanupFailure) { report.status = "failed"; report.cleanupFailure = cleanupFailure.message; }
  await writeFile(join(output, "packaged.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: checks.length, failure: report.failure, readyMs: report.readyMs, quits: report.quits,
    affinity: report.affinity, whisper: report.whisper, physicalCapture: false, genuineAIRequests: 0 }));
  if (cleanupFailure) process.exitCode = 1;
}
