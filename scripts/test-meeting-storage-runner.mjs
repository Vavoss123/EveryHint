// Run inside Electron's bundled Node, with isolated SQLite and Windows credentials.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { AsyncEntry } from "@napi-rs/keyring";
const root = mkdtempSync(join(tmpdir(), "everyhint-p8-worker-"));
const profile = createHash("sha256").update(root).digest("hex");
const entry = new AsyncEntry("EveryHint.Tests.Meetings.v1", randomUUID());
const file = join(root, "history.sqlite");
let worker,
  sequence = 0,
  assertions = 0;
const pending = new Map();
const check = (value, message) => {
  assert.ok(value, message);
  assertions++;
};
function open(key) {
  worker = new Worker(resolve("out/main/meetings-worker.js"), {
    workerData: { path: file, profile, key: new Uint8Array(key) },
  });
  worker.on("message", (message) => {
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    clearTimeout(job.timer);
    if (message.error) job.reject(new Error(message.error));
    else job.resolve(message.value);
  });
  worker.on("error", (error) => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    pending.clear();
  });
}
function call(method, ...args) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("Meeting worker test timed out"));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, method, args });
  });
}
(async () => {
  try {
    const key = randomBytes(32);
    await entry.setSecret(key);
    const restored = Buffer.from(await entry.getSecret());
    check(restored.equals(key), "actual native credential round trip");
    open(restored);
    check(await call("ready"), "compiled Electron worker opens actual SQLite");
    const emptyBytes = statSync(file).size,
      start = performance.now();
    const doc = await call("create", "Sensitive fixture meeting marker", 30);
    const createMs = performance.now() - start;
    await call(
      "begin",
      doc.id,
      {
        sessionId: "capture-fixture",
        startedAt: Date.now() - 60000,
        endedAt: null,
        sources: [
          {
            kind: "microphone",
            id: "synthetic",
            name: "Private fixture microphone label",
          },
          {
            kind: "systemAudio",
            id: "synthetic-system",
            name: "Private fixture playback label",
          },
        ],
      },
      30,
    );
    const saveTimes = [];
    let event;
    for (let batch = 0; batch < 25; batch++) {
      const events = Array.from({ length: 20 }, (_, index) => ({
        id: `final-${batch * 20 + index}`,
        sessionId: "capture-fixture",
        source: index % 2 ? "microphone" : "systemAudio",
        state: "final",
        startMs: Date.now() - 50000 + batch * 20 + index,
        endMs: Date.now() - 49000 + batch * 20 + index,
        text: `Private transcript marker ${batch * 20 + index}. We agreed to release on Thursday. Alice will prepare the checklist.`,
        model: "tiny.en",
      }));
      event = events[0];
      const started = performance.now();
      await call("append", doc.id, "capture-fixture", events, 30);
      saveTimes.push(performance.now() - started);
    }
    check(
      (await call("append", doc.id, "capture-fixture", [event], 30)) === 0,
      "final segment IDs deduplicate in the real worker",
    );
    check(
      (await call("get", doc.id)).segmentCount === 500,
      "500 final segments committed",
    );
    const retrievalStart = performance.now(),
      page = await call("transcript", doc.id, 0, 100),
      retrievalMs = performance.now() - retrievalStart;
    check(
      page.segments.length === 100 && page.nextOffset === 100,
      "bounded lazy transcript retrieval",
    );
    check(
      new Set(page.segments.map((segment) => segment.source)).size === 2,
      "source provenance retained without identities",
    );
    await call("finish", doc.id, "capture-fixture", false, 30);
    const savedBytes = statSync(file).size;
    await worker.terminate();
    worker = undefined;
    check(
      !readFileSync(file).includes(Buffer.from("Private transcript marker")),
      "no plaintext transcript in SQLite",
    );
    check(
      !readFileSync(file).includes(
        Buffer.from("Sensitive fixture meeting marker"),
      ),
      "no plaintext title in SQLite",
    );
    open(restored);
    await call("ready");
    const loadStart = performance.now(),
      reopened = await call("get", doc.id),
      loadMs = performance.now() - loadStart;
    check(
      reopened.segmentCount === 500 && reopened.status === "ended",
      "actual SQLite persistence across worker restart",
    );
    const searchStart = performance.now(),
      search = await call("list", {
        query: "Private transcript marker 499",
        tag: "",
        from: null,
        to: null,
        status: "all",
        sort: "newest",
        offset: 0,
      }),
      search500Ms = performance.now() - searchStart;
    check(
      search.items.length === 1 &&
        search.items[0].id === doc.id &&
        search.scanned === 500,
      "bounded search correctly finds the last of 500 encrypted segments",
    );
    await call("delete", doc.id);
    check(
      (
        await call("list", {
          query: "",
          from: null,
          to: null,
          status: "all",
          sort: "newest",
          offset: 0,
        })
      ).items.length === 0,
      "application-level deletion removes meeting",
    );
    let absent = false;
    try {
      await call("transcript", doc.id, 0, 100);
    } catch {
      absent = true;
    }
    check(absent, "deleted transcript cannot be retrieved");
    await worker.terminate();
    worker = undefined;
    restored.fill(0);
    key.fill(0);
    saveTimes.sort((a, b) => a - b);
    const report = {
      assertions,
      fixture: "500 generated final transcript segments; no physical capture",
      node: process.versions.node,
      electron: process.versions.electron,
      remoteRequests: 0,
      createMs,
      loadMs,
      retrieval100Ms: retrievalMs,
      search500Ms,
      saveBatch20MeanMs:
        saveTimes.reduce((sum, time) => sum + time, 0) / saveTimes.length,
      saveBatch20P95Ms: saveTimes[Math.floor(saveTimes.length * 0.95)],
      emptyBytes,
      savedBytes,
      workerTestProcessRssBytes: process.memoryUsage().rss,
      hardwareAcceptance: false,
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/p8-storage-integration.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    if (worker) await worker.terminate();
    await entry.deleteCredential();
    const target = resolve(root),
      ownedPrefix = resolve(tmpdir(), "everyhint-p8-worker-");
    assert.ok(target.startsWith(ownedPrefix));
    rmSync(target, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
