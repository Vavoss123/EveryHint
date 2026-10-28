// Deterministic local fixtures, run only in Electron Node against this smoke's isolated profile.
import { AsyncEntry } from "@napi-rs/keyring";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { Worker } from "node:worker_threads";
const home = resolve(process.argv[2]),
  mode = process.argv[3];
if (!home.includes("everyhint-p8-ui-"))
  throw Error("Expected an isolated meeting smoke profile.");
const profile = createHash("sha256")
    .update(
      `${process.platform === "win32" ? home.toLowerCase() : home}\0local-only`,
    )
    .digest("hex"),
  entry = new AsyncEntry("EveryHint.Meetings.v1", profile);
if (mode === "cleanup-key") {
  await entry.deleteCredential();
  process.exit(0);
}
const key = await entry.getSecret();
if (!key) throw Error("Smoke history was not unlocked through the real app.");
const worker = new Worker(resolve("out/main/meetings-worker.js"), {
  workerData: {
    path: join(home, "meetings", `${profile}.sqlite`),
    profile,
    key: new Uint8Array(key),
  },
});
key.fill(0);
let sequence = 0;
const pending = new Map();
worker.on("message", (message) => {
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id);
  clearTimeout(job.timer);
  if (message.error) job.reject(Error(message.error));
  else job.resolve(message.value);
});
function call(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++sequence,
      timer = setTimeout(() => reject(Error("Fixture worker timeout")), 10000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, method, args });
  });
}
try {
  await call("ready");
  const doc = await call("create", "Labelled release transcript fixture", 30),
    now = Date.now();
  await call(
    "begin",
    doc.id,
    {
      sessionId: "fixture-capture",
      startedAt: now - 60000,
      endedAt: null,
      sources: [
        {
          kind: "microphone",
          name: "Synthetic fixture microphone",
          id: "synthetic",
        },
        {
          kind: "systemAudio",
          name: "Synthetic fixture system source",
          id: null,
        },
      ],
    },
    30,
  );
  for (let batch = 0; batch < 3; batch++)
    await call(
      "append",
      doc.id,
      "fixture-capture",
      Array.from({ length: 50 }, (_, index) => ({
        id: `final-${batch * 50 + index}`,
        sessionId: "fixture-capture",
        source: index % 2 ? "microphone" : "systemAudio",
        state: "final",
        startMs: now - 50000 + batch * 50 + index,
        endMs: now - 49000 + batch * 50 + index,
        text:
          batch === 2 && index === 49
            ? "We decided to release the orchid prototype on Thursday."
            : `Labelled fixture discussion ${batch * 50 + index}. No real conversation.`,
        model: "tiny.en",
      })),
      30,
    );
  await call("finish", doc.id, "fixture-capture", false, 30);
  console.log(JSON.stringify({ id: doc.id, segments: 150 }));
} finally {
  await worker.terminate();
}
