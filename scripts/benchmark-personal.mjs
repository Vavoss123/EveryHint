import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import electron from "electron";
if (!process.versions.electron) {
  execFileSync(electron, ["scripts/benchmark-personal.mjs"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
    stdio: "inherit",
  });
} else {
  const root = await mkdtemp(join(tmpdir(), "everyhint-p9-bench-")),
    path = join(root, "personal.sqlite"),
    key = randomBytes(32),
    profile = createHash("sha256").update(root).digest("hex");
  let sequence = 0;
  const worker = new Worker(resolve("out/main/personal-worker.js"), {
      workerData: { path, key: new Uint8Array(key), profile },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
      },
    }),
    pending = new Map();
  worker.on("message", (message) => {
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    clearTimeout(job.timer);
    if (message.error) job.reject(Error(message.error));
    else job.resolve(message.value);
  });
  worker.on("error", (error) => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    pending.clear();
  });
  const call = (method, value) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(
          () => reject(Error("Personal benchmark timeout")),
          15000,
        );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, method, value });
    });
  const timed = async (action) => {
    const start = performance.now();
    const value = await action();
    return { value, ms: performance.now() - start };
  };
  try {
    await call("config");
    const emptyBytes = (await stat(path)).size,
      baseline = await call("metrics"),
      saves = [];
    for (let index = 0; index < 10; index++) {
      const text =
          `Release prototype Thursday document ${index}. Checklist approved Wednesday. `
            .repeat(7000)
            .slice(0, 399000),
        sections = [];
      for (let offset = 0; offset < text.length; offset += 1100)
        sections.push({
          id: `s${sections.length}`,
          heading: `Release ${index}`,
          page: null,
          text: text.slice(offset, offset + 1200),
        });
      saves.push(
        (
          await timed(() =>
            call("import", {
              document: {
                id: `doc${index}`,
                name: `Generated release fixture ${index}`,
                type: "txt",
                bytes: text.length,
                importedAt: 1,
                updatedAt: 1,
                enabled: true,
                status: "ready",
                notices: [],
                sectionCount: sections.length,
              },
              extraction: { sections, notices: [], partial: false },
            }),
          )
        ).ms,
      );
    }
    const ids = Array.from({ length: 10 }, (_, i) => `doc${i}`),
      searches = [];
    let result;
    for (let index = 0; index < 5; index++) {
      const run = await timed(() =>
        call("retrieve", {
          query: "prototype Thursday checklist",
          ids,
          offset: 0,
        }),
      );
      searches.push(run.ms);
      result = run.value;
    }
    assert.ok(result.excerpts.length > 0 && result.excerpts.length <= 4);
    assert.ok(result.excerpts.reduce((n, e) => n + e.text.length, 0) <= 4800);
    const after = await call("metrics"),
      bytes = (await stat(path)).size;
    const report = {
      node: process.versions.node,
      electron: process.versions.electron,
      fixture:
        "10 generated documents, 399,000 source characters each; full extraction sections include 100-character overlap",
      documentCount: 10,
      indexedSections: 3630,
      storedSourceCharacters: 3990000,
      encryptedImportMeanMs: saves.reduce((a, b) => a + b) / saves.length,
      retrievalSamplesMs: searches,
      retrievalMeanMs: searches.reduce((a, b) => a + b) / searches.length,
      retrievalMaxMs: Math.max(...searches),
      additionalExcerptChars: result.excerpts.reduce(
        (n, e) => n + e.text.length,
        0,
      ),
      serializedExcerptChars: JSON.stringify(result.excerpts).length,
      emptyBytes,
      databaseBytes: bytes,
      encryptedIndexGrowthBytes: bytes - emptyBytes,
      baselineWorkerHeapBytes: baseline.memory.heapUsed,
      afterWorkerHeapBytes: after.memory.heapUsed,
      sharedTestProcessRssBytes: after.memory.rss,
      remoteRequests: 0,
      note: "Single local synthetic run. RSS is the combined standalone test process and worker; V8 heap limits do not cap all native/external allocations. No startup full-document index is loaded.",
    };
    assert.equal(
      (await readFile(path)).includes(
        Buffer.from("Checklist approved Wednesday"),
      ),
      false,
    );
    await writeFile(
      "artifacts/p9-performance.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await worker.terminate();
    key.fill(0);
    if (
      dirname(root) === resolve(tmpdir()) &&
      basename(root).startsWith("everyhint-p9-bench-")
    )
      await rm(root, { recursive: true, force: true });
  }
}
