import { Worker } from "node:worker_threads";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MeetingKeys } from "./keys";
import type {
  MeetingDocument,
  MeetingRun,
  MeetingQuery,
  MeetingPage,
  TranscriptPage,
} from "../../shared/meetings";
import type { TranscriptEvent } from "../../shared/transcription";

export interface MeetingStore {
  findTranscript(
    id: string,
    query: string,
    offset: number,
  ): Promise<TranscriptPage & { scanned: number }>;
  speakerLabels(
    id: string,
    revision: number,
    labels: { ref: string; label: string }[],
    days: number | null,
  ): Promise<MeetingDocument>;
  isCurrent(id: string, revision: number): boolean;
  contextSegments(
    id: string,
    refs: string[],
  ): Promise<import("../../shared/meetings").MeetingSegment[]>;
  create(title: string, days: number | null): Promise<MeetingDocument>;
  get(id: string): Promise<MeetingDocument>;
  update(
    doc: MeetingDocument,
    revision: number,
    days: number | null,
  ): Promise<MeetingDocument>;
  begin(
    id: string,
    run: MeetingRun,
    days: number | null,
  ): Promise<MeetingDocument>;
  append(
    id: string,
    sessionId: string,
    events: TranscriptEvent[],
    days: number | null,
  ): Promise<number>;
  finish(
    id: string,
    sessionId: string,
    interrupted: boolean,
    days: number | null,
    at?: number,
  ): Promise<MeetingDocument>;
  transcript(
    id: string,
    offset?: number,
    limit?: number,
  ): Promise<TranscriptPage>;
  list(query: MeetingQuery): Promise<MeetingPage>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  retention(days: number | null): Promise<number>;
  clearTranscript(id: string, days: number | null): Promise<MeetingDocument>;
  recover(days: number | null): Promise<number>;
  close(): Promise<void>;
}
export class HistoryWorker implements MeetingStore {
  private worker: Worker | undefined;
  private closed = false;
  private sequence = 0;
  private versions = new Map<string, number>();
  private writes = new Map<string, number>();
  private globalWrites = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private readonly root: string,
    private readonly profile: string,
    private readonly keys = new MeetingKeys(),
    private readonly workerUrl = new URL(
      "./meetings-worker.js",
      import.meta.url,
    ),
  ) {}
  async open(): Promise<void> {
    const path = join(this.root, `${this.profile}.sqlite`);
    const key = await this.keys.load(this.profile, existsSync(path));
    try {
      if (this.closed) throw new Error("History unlock was cancelled.");
      mkdirSync(this.root, { recursive: true });
      this.worker = new Worker(this.workerUrl, {
        workerData: { path, profile: this.profile, key: new Uint8Array(key) },
      });
      this.worker.on(
        "message",
        (message: { id: number; value?: unknown; error?: string }) => {
          const job = this.pending.get(message.id);
          if (!job) return;
          clearTimeout(job.timer);
          this.pending.delete(message.id);
          if (message.error) job.reject(new Error(message.error));
          else job.resolve(message.value);
        },
      );
      this.worker.on("error", () => this.fail());
      this.worker.on("exit", () => this.fail());
      await this.call("ready", []);
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      key.fill(0);
    }
  }
  private fail(): void {
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(
        new Error(
          "History worker stopped. Reopen history to inspect committed data; no automatic write retry occurred.",
        ),
      );
    }
    this.pending.clear();
    this.closed = true;
  }
  private call<T>(method: string, args: unknown[]): Promise<T> {
    if (this.closed || !this.worker)
      return Promise.reject(new Error("Unlock local history first."));
    if (this.pending.size >= 64)
      return Promise.reject(
        new Error(
          "History write queue is full. Persistence was stopped; capture remains under your control.",
        ),
      );
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "History operation timed out; no automatic retry occurred. Reopen history to inspect committed data.",
          ),
        );
        void this.close();
      }, 30000);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.worker!.postMessage({ id, method, args });
    });
  }
  isCurrent(id: string, revision: number): boolean {
    return (
      !this.closed &&
      !this.globalWrites &&
      !this.writes.get(id) &&
      this.versions.get(id) === revision
    );
  }
  private remember(doc: MeetingDocument): MeetingDocument {
    if (doc.revision >= (this.versions.get(doc.id) ?? 0))
      this.versions.set(doc.id, doc.revision);
    while (this.versions.size > 500)
      this.versions.delete(this.versions.keys().next().value!);
    return doc;
  }
  private async mutation<T>(
    id: string,
    run: () => Promise<T>,
    refresh = true,
  ): Promise<T> {
    this.writes.set(id, (this.writes.get(id) ?? 0) + 1);
    this.versions.delete(id);
    try {
      const result = await run();
      if (refresh) this.remember(await this.call<MeetingDocument>("get", [id]));
      return result;
    } finally {
      const left = (this.writes.get(id) ?? 1) - 1;
      if (left) this.writes.set(id, left);
      else this.writes.delete(id);
    }
  }
  private async globalMutation<T>(run: () => Promise<T>): Promise<T> {
    this.globalWrites++;
    this.versions.clear();
    try {
      return await run();
    } finally {
      this.versions.clear();
      this.globalWrites--;
    }
  }
  create(title: string, days: number | null) {
    return this.call<MeetingDocument>("create", [title, days]).then((doc) =>
      this.remember(doc),
    );
  }
  get(id: string) {
    return this.call<MeetingDocument>("get", [id]).then((doc) =>
      this.remember(doc),
    );
  }
  update(doc: MeetingDocument, revision: number, days: number | null) {
    return this.mutation(doc.id, () =>
      this.call<MeetingDocument>("update", [doc, revision, days]),
    );
  }
  begin(id: string, run: MeetingRun, days: number | null) {
    return this.mutation(id, () =>
      this.call<MeetingDocument>("begin", [id, run, days]),
    );
  }
  append(
    id: string,
    sessionId: string,
    events: TranscriptEvent[],
    days: number | null,
  ) {
    return this.mutation(id, () =>
      this.call<number>("append", [id, sessionId, events, days]),
    );
  }
  finish(
    id: string,
    sessionId: string,
    interrupted: boolean,
    days: number | null,
    at?: number,
  ) {
    return this.mutation(id, () =>
      this.call<MeetingDocument>("finish", [
        id,
        sessionId,
        interrupted,
        days,
        at,
      ]),
    );
  }
  transcript(id: string, offset = 0, limit = 100) {
    return this.call<TranscriptPage>("transcript", [id, offset, limit]);
  }
  list(query: MeetingQuery) {
    return this.call<MeetingPage>("list", [query]);
  }
  contextSegments(id: string, refs: string[]) {
    return this.call<import("../../shared/meetings").MeetingSegment[]>(
      "contextSegments",
      [id, refs],
    );
  }
  findTranscript(id: string, query: string, offset: number) {
    return this.call<TranscriptPage & { scanned: number }>("findTranscript", [
      id,
      query,
      offset,
    ]);
  }
  delete(id: string) {
    return this.mutation(id, () => this.call<void>("delete", [id]), false);
  }
  deleteAll() {
    return this.globalMutation(() => this.call<void>("deleteAll", []));
  }
  retention(days: number | null) {
    return this.globalMutation(() => this.call<number>("retention", [days]));
  }
  clearTranscript(id: string, days: number | null) {
    return this.mutation(id, () =>
      this.call<MeetingDocument>("clearTranscript", [id, days]),
    );
  }
  recover(days: number | null) {
    return this.globalMutation(() => this.call<number>("recover", [days]));
  }
  async close(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = undefined;
    this.fail();
    if (worker) await worker.terminate();
  }
  speakerLabels(
    id: string,
    revision: number,
    labels: { ref: string; label: string }[],
    days: number | null,
  ) {
    return this.mutation(id, () =>
      this.call<MeetingDocument>("speakerLabels", [id, revision, labels, days]),
    );
  }
}
