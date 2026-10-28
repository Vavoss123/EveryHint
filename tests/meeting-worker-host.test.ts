import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import { HistoryWorker } from "../src/main/meetings/store";
import { MeetingKeys } from "../src/main/meetings/keys";
const roots: string[] = [],
  hosts: HistoryWorker[] = [];
// Actual worker thread; deterministic RPC fixture rather than SQLite (covered separately).
const workerURL = new URL(
  `data:text/javascript,${encodeURIComponent(`
import {parentPort,workerData} from 'node:worker_threads';
workerData.key.fill(0);
let doc={id:'meeting-fixture',revision:1,title:'Labelled worker fixture'};
parentPort.on('message',({id,method,args})=>{
 const reply=(value,error)=>parentPort.postMessage({id,value,error});
 if(method==='ready'){reply(true,workerData.path.includes('host-fail-')?'Labelled fixture open failure':undefined);return;}
 if(method==='get'){reply(doc);return;}
 if(method==='create'){doc={...doc,title:args[0]};reply(doc);return;}
 if(method==='update'){setTimeout(()=>{doc={...args[0],revision:doc.revision+1};reply(doc);},30);return;}
 if(method==='retention'){setTimeout(()=>reply(0),30);return;}
 reply(undefined,'Unsupported fixture operation');
});
`)}`,
);
function setup(fail = false) {
  const root = mkdtempSync(
    join(tmpdir(), fail ? "everyhint-p8-host-fail-" : "everyhint-p8-host-"),
  );
  roots.push(root);
  const key = randomBytes(32),
    keys = new MeetingKeys(() => ({
      getSecret: async () => Array.from(key),
      setSecret: async () => {},
      deleteCredential: async () => true,
    })),
    host = new HistoryWorker(root, "a".repeat(64), keys, workerURL);
  hosts.push(host);
  return host;
}
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
describe("P8 host-worker lifecycle and synchronous transport guards", () => {
  it("terminates a real worker that rejects initial database readiness", async () => {
    const terminate = vi.spyOn(Worker.prototype, "terminate"),
      host = setup(true);
    await expect(host.open()).rejects.toThrow(/fixture open failure/);
    expect(terminate).toHaveBeenCalledOnce();
    await expect(host.get("meeting-fixture")).rejects.toThrow(/Unlock/);
    expect(host.isCurrent("meeting-fixture", 1)).toBe(false);
  });
  it("invalidates revisions synchronously before an asynchronous write and only restores the committed version", async () => {
    const host = setup();
    await host.open();
    const doc = await host.create("Fixture title", 30);
    expect(host.isCurrent(doc.id, doc.revision)).toBe(true);
    const update = host.update(
      { ...doc, title: "Changed fixture" },
      doc.revision,
      30,
    );
    expect(host.isCurrent(doc.id, doc.revision)).toBe(false);
    const saved = await update;
    expect(host.isCurrent(doc.id, doc.revision)).toBe(false);
    expect(host.isCurrent(saved.id, saved.revision)).toBe(true);
    await host.close();
    expect(host.isCurrent(saved.id, saved.revision)).toBe(false);
  });
  it("blocks all cached revisions while retention is pending and requires a fresh committed read afterwards", async () => {
    const host = setup();
    await host.open();
    const doc = await host.create("Fixture title", 30);
    const retention = host.retention(30);
    expect(host.isCurrent(doc.id, doc.revision)).toBe(false);
    await retention;
    expect(host.isCurrent(doc.id, doc.revision)).toBe(false);
    await host.get(doc.id);
    expect(host.isCurrent(doc.id, doc.revision)).toBe(true);
  });
});
