import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { WhisperWorker } from "../src/main/transcription/worker.ts";
import { verifyModel } from "../src/main/transcription/model-files.ts";
import { loadSpeechFixture } from "./speech-fixture.mjs";
const root =
  process.env.EVERYHINT_SPEECH_HOME ??
  join(process.env.LOCALAPPDATA, "EveryHint", "speech");
assert.ok(
  await verifyModel(join(root, "models"), "tiny.en"),
  "Install the verified tiny.en model before running actual inference.",
);
const fixture = await loadSpeechFixture(
  root,
  process.argv.includes("--install-fixture"),
);
const worker = new WhisperWorker(
  join(root, "runtime", "everyhint-transcriber.exe"),
);
try {
  const ready = await worker.start(
    join(root, "models", "ggml-tiny.en.bin"),
    (message) => console.error(message),
  );
  const results = [];
  for (const source of ["microphone", "systemAudio"]) {
    const result = await worker.infer(fixture.samples);
    assert.match(result.text.toLowerCase(), /ask not what your country/);
    results.push({ source, ...result });
  }
  const report = {
    fixture: "upstream JFK",
    model: "tiny.en",
    threads: 4,
    loadMs: ready.loadMs,
    initialMemoryBytes: ready.memoryBytes,
    results,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/inference.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  worker.stop();
}
