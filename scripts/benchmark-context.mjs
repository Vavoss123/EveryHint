import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import electron from "electron";
if (!process.versions.electron) {
  execFileSync(electron, ["scripts/benchmark-context.mjs"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
    stdio: "inherit",
  });
} else {
  const root = await mkdtemp(join(tmpdir(), "everyhint-p10-bench-")),
    path = join(root, "context.sqlite"),
    key = randomBytes(32),
    profile = createHash("sha256").update(root).digest("hex"),
    worker = new Worker(resolve("out/main/personal-worker.js"), {
      workerData: { path, key: new Uint8Array(key), profile },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
      },
    }),
    pending = new Map();
  let sequence = 0;
  worker.on("message", (m) => {
    const job = pending.get(m.id);
    if (!job) return;
    pending.delete(m.id);
    clearTimeout(job.timer);
    if (m.error) job.reject(Error(m.error));
    else job.resolve(m.value);
  });
  worker.on("error", (e) => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(e);
    }
    pending.clear();
  });
  const call = (method, value) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(
          () => reject(Error("Context benchmark timeout")),
          15000,
        );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, method, value });
    });
  const timed = async (fn) => {
    const at = performance.now(),
      value = await fn();
    return { ms: performance.now() - at, value };
  };
  const series = async (query) => {
    const samples = [];
    let value;
    for (let i = 0; i < 7; i++) {
      const r = await timed(() => call("workspaceQuery", query));
      samples.push(r.ms);
      value = r.value;
    }
    return {
      samplesMs: samples,
      meanMs: samples.reduce((a, b) => a + b) / samples.length,
      maxMs: Math.max(...samples),
      returned: value.items.length,
      scanned: value.scanned,
    };
  };
  try {
    const open = await timed(() => call("config")),
      emptyBytes = (await stat(path)).size,
      baseline = await call("metrics"),
      now = Date.now(),
      saves = {},
      bytesAfterCategory = {};
    for (const kind of ["event", "person", "memory"]) {
      const rows = Array.from({ length: 1000 }, (_, i) => {
        const id = `${kind}-${i}`,
          value =
            kind === "memory"
              ? {
                  id,
                  type: "action",
                  description: `Prototype release Thursday; checklist due Wednesday. ${i}`,
                  quote: "The checklist is due Wednesday.",
                  ref: `user:${id}`,
                  source: {
                    kind: "user",
                    id,
                    revision: 1,
                    title: `Prototype project ${i}`,
                  },
                  createdAt: now,
                  updatedAt: now,
                  lastVerifiedAt: now,
                  personIds: [`person-${i % 50}`],
                  topics: ["prototype", "checklist"],
                  status: "open",
                  review: i % 2 ? "pending" : "approved",
                  authorship: "user",
                }
              : kind === "person"
                ? {
                    id,
                    manual: {
                      name: `Test person ${i}`,
                      email: `test${i}@example.test`,
                      emailVerified: true,
                      organisation: "Test organisation",
                      jobTitle: "Engineer",
                    },
                    imported: null,
                    notes: `Prototype checklist participant ${i}`,
                    meetingIds: [],
                    updatedAt: now,
                  }
                : {
                    id,
                    title: `Prototype calendar fixture ${i}`,
                    description: "Prototype Thursday",
                    startAt: now + i * 60000,
                    endAt: now + (i + 30) * 60000,
                    calendarId: `calendar-${i % 5}`,
                    subject: "fixture",
                    attendees: [],
                    updated: new Date(now).toISOString(),
                  };
        return { kind, id, value, updatedAt: now + i, expiresAt: null };
      });
      saves[kind] = (
        await timed(() => call("workspaceBatch", { rows, remove: [] }))
      ).ms;
      bytesAfterCategory[kind] = (await stat(path)).size;
    }
    const people = await series({
        kind: "person",
        query: "person 999",
        offset: 0,
      }),
      memory = await series({
        kind: "memory",
        query: "prototype checklist",
        offset: 0,
      }),
      matched = await series({
        kind: "memory",
        query: "checklist",
        personId: "person-2",
        offset: 0,
      }),
      after = await call("metrics"),
      bytes = (await stat(path)).size;
    assert.equal(people.returned, 1);
    assert.equal(memory.returned, 25);
    assert.equal(matched.returned, 20);
    assert.equal(
      (await readFile(path)).includes(Buffer.from("checklist due Wednesday")),
      false,
    );
    const report = {
      node: process.versions.node,
      electron: process.versions.electron,
      fixture:
        "1,000 synthetic events / 1,000 people / 1,000 structured memories; actual compiled encrypted SQLite worker",
      records: 3000,
      workerOpenMs: open.ms,
      encryptedBatchMs: saves,
      bytesAfterCategory,
      peopleSearch: people,
      memoryRetrieval: memory,
      personMatchedMemory: matched,
      emptyBytes,
      databaseBytes: bytes,
      encryptedGrowthBytes: bytes - emptyBytes,
      baselineWorkerHeapBytes: baseline.memory.heapUsed,
      afterWorkerHeapBytes: after.memory.heapUsed,
      sharedProcessRssBytes: after.memory.rss,
      remoteRequests: 0,
      note: "Single local run. Searches rank the bounded 1,000-record category and return 25. RSS includes standalone process and worker; no real Google latency or genuine AI latency is measured here.",
    };
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/p10-performance.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await worker.terminate();
    key.fill(0);
    if (
      dirname(root) === resolve(tmpdir()) &&
      basename(root).startsWith("everyhint-p10-bench-")
    )
      await rm(root, { recursive: true, force: true });
    else {
      console.error("Unsafe benchmark cleanup target left untouched");
      process.exitCode = 1;
    }
  }
}
