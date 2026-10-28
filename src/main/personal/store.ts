import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { AsyncEntry } from "@napi-rs/keyring";
import { MeetingKeys } from "../meetings/keys";

export class PersonalStore {
  private worker?: Worker;
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private root: string,
    private profile: string,
    private keys = new MeetingKeys(
      (p) => new AsyncEntry("EveryHint.Personal.v1", p),
    ),
    private url = new URL("./personal-worker.js", import.meta.url),
  ) {}
  async open(): Promise<void> {
    const path = join(this.root, `${this.profile}.sqlite`),
      key = await this.keys.load(this.profile, existsSync(path));
    try {
      if (this.closed) throw new Error("Library unlock cancelled.");
      await mkdir(this.root, { recursive: true });
      if (this.closed) throw new Error("Library unlock cancelled.");
      this.worker = new Worker(this.url, {
        workerData: { path, profile: this.profile, key: new Uint8Array(key) },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
        },
      });
      this.worker.on(
        "message",
        (m: { id: number; value: unknown; error?: string }) => {
          const job = this.pending.get(m.id);
          if (!job) return;
          this.pending.delete(m.id);
          clearTimeout(job.timer);
          if (m.error) job.reject(new Error(m.error));
          else job.resolve(m.value);
        },
      );
      this.worker.on("error", () => {
        void this.close();
      });
      this.worker.on("exit", () => {
        void this.close();
      });
      await this.call("config");
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      key.fill(0);
    }
  }
  call<T>(method: string, value?: unknown): Promise<T> {
    if (this.closed || !this.worker)
      return Promise.reject(new Error("Unlock the personal library first."));
    if (this.pending.size >= 8)
      return Promise.reject(new Error("Personal library queue is full."));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        void this.close();
      }, 15000);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this.worker!.postMessage({ id, method, value });
    });
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(
        new Error(
          "Personal library operation cancelled or worker failed. No automatic retry occurred.",
        ),
      );
    }
    this.pending.clear();
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
