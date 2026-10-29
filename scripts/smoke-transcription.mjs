import {
  dashboardPage,
  finishSetup,
  settingsSection,
} from "./desktop-harness.mjs";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  link,
  copyFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import electronPath from "electron";
import { _electron } from "playwright-core";
import { loadSpeechFixture } from "./speech-fixture.mjs";
import { installSyntheticAudio } from "./synthetic-audio.mjs";
const root =
  process.env.EVERYHINT_SPEECH_HOME ??
  join(process.env.LOCALAPPDATA, "EveryHint", "speech");
const fixture = await loadSpeechFixture(root);
const profile = await mkdtemp(join(tmpdir(), "everyhint-speech-"));
const speech = join(profile, "speech");
let desktop,
  assertions = 0;
const check = (value, message) => {
  assert.ok(value, message);
  assertions++;
};
async function wait(page, predicate, timeout = 40000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    const result = await page.evaluate(() =>
      window.everyhint.getTranscription(),
    );
    assert.ok(result.ok, result.error);
    value = result.value;
    if (predicate(value)) return value;
    if (value.state === "ERROR") throw new Error(value.error);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Speech state timed out: ${JSON.stringify(value)}`);
}
try {
  for (const file of [
    "models/ggml-tiny.en.bin",
    "runtime/everyhint-transcriber.exe",
  ]) {
    await mkdir(join(speech, file, ".."), { recursive: true });
    await link(join(root, file), join(speech, file)).catch(() =>
      copyFile(join(root, file), join(speech, file)),
    );
  }
  const env = {
    ...process.env,
    EVERYHINT_TEST_USER_DATA: profile,
    EVERYHINT_SPEECH_HOME: speech,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await _electron.launch({
    executablePath: electronPath,
    args: [resolve(".")],
    env,
  });
  await desktop.context().addInitScript(installSyntheticAudio, {
    samples: Array.from(fixture.samples),
    sampleRate: fixture.sampleRate,
  });
  const page = await dashboardPage(desktop);
  await finishSetup(page);
  await page.waitForFunction(
    () => !!window.everyhint && !!document.querySelector(".capture-controls"),
  );
  const initial = await wait(page, (state) =>
    state.models.some(
      (model) => model.id === "tiny.en" && model.state === "installed",
    ),
  );
  check(
    initial.state === "OFF" && initial.events.length === 0,
    "transcription disabled on startup",
  );
  check(
    !(await page.evaluate(() => window.everyhint.transcription("enable"))).ok,
    "transcription cannot acquire audio or bypass consent",
  );
  await page
    .getByRole("button", { name: "Start EveryHint", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /^Microphone/ }).check();
  await page.getByRole("checkbox", { name: /^System audio/ }).check();
  await page.getByRole("checkbox", { name: /I authorise/ }).check();
  await page.getByRole("button", { name: "Start EveryHint" }).click();
  await page.waitForFunction(
    async () =>
      (await window.everyhint.getSnapshot()).value.session.sources.microphone
        .state === "CAPTURING" &&
      (await window.everyhint.getSnapshot()).value.session.sources.systemAudio
        .state === "CAPTURING",
  );
  await settingsSection(page, "Advanced");
  await page
    .getByText("Capture diagnostics and transcription logs", { exact: true })
    .click();
  await wait(page, (state) => state.state === "LISTENING");
  check(
    true,
    "Start automatically enables local transcription without another panel",
  );
  await wait(page, (state) =>
    state.events.some(
      (event) => event.state === "partial" && event.text.length,
    ),
  );
  check(true, "actual inference produces provisional text during speech");
  const final = await wait(page, (state) =>
    ["microphone", "systemAudio"].every((source) =>
      state.events.some(
        (event) =>
          event.source === source &&
          event.state === "final" &&
          /country/i.test(event.text),
      ),
    ),
  );
  check(
    new Set(final.events.map((event) => event.sessionId)).size === 1,
    "both sources share the authorised capture session",
  );
  check(
    final.events.every(
      (event, index) =>
        !index || event.startMs >= final.events[index - 1].startMs,
    ),
    "transcripts ordered across sources",
  );
  check(
    final.diagnostics.queueLength <= 4 && final.diagnostics.completedJobs >= 2,
    "bounded single-worker inference queue",
  );
  const capture = await page.evaluate(() => window.everyhint.getSnapshot());
  check(
    capture.value.session.sources.screen.state === "DISABLED",
    "transcription does not start screen capture",
  );
  await mkdir("artifacts", { recursive: true });
  await page.locator(".transcription-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/everyhint-transcription.png" });
  await page
    .getByRole("button", { name: "Pause transcription", exact: true })
    .click();
  await wait(page, (state) => state.state === "PAUSED");
  check(true, "transcription pauses independently of capture");
  const stillCapturing = await page.evaluate(() =>
    window.everyhint.getSnapshot(),
  );
  check(
    stillCapturing.value.session.state === "ACTIVE",
    "pausing transcription preserves authorised capture",
  );
  await page
    .getByRole("button", { name: "Clear transcript", exact: true })
    .click();
  await wait(page, (state) => !state.events.length);
  check(true, "clear removes final and provisional text");
  await page.getByRole("button", { name: /Stop/ }).click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stopped = await page.evaluate(() =>
    window.everyhint.getTranscription(),
  );
  check(
    stopped.value.events.length === 0 && stopped.value.state !== "LISTENING",
    "no results arrive after stop",
  );
  await writeFile(
    "artifacts/speech-smoke.json",
    JSON.stringify(
      { assertions, diagnostics: final.diagnostics, events: final.events },
      null,
      2,
    ),
  );
  console.log(
    `Speech Electron smoke passed: ${assertions} assertions; real tiny.en inference through both synthetic P2 audio sources.`,
  );
  console.log(JSON.stringify(final.diagnostics));
} finally {
  if (desktop) await desktop.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
