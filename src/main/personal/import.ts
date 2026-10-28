import { Worker } from "node:worker_threads";
import type { Extraction, KnowledgeDocument } from "../../shared/knowledge";

export async function importLocalDocument(
  path: string,
  type: KnowledgeDocument["type"],
  signal: AbortSignal,
  url = new URL("./extraction-worker.js", import.meta.url),
): Promise<{
  extraction: Extraction;
  bytes: number;
  metrics?: { extractionMs: number; parserHeapBytes: number };
}> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, {
      workerData: { path, type },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });
    let settled = false;
    const finish = (
      error?: Error,
      value?: {
        extraction: Extraction;
        bytes: number;
        metrics?: { extractionMs: number; parserHeapBytes: number };
      },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const cancel = () =>
      finish(
        new Error("Document import cancelled. No remote request occurred."),
      );
    const timer = setTimeout(
      () =>
        finish(
          new Error("Document parsing exceeded 12 seconds and was terminated."),
        ),
      12000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    worker.on(
      "message",
      (value: { extraction: Extraction; bytes: number; error?: string }) =>
        finish(value.error ? new Error(value.error) : undefined, value),
    );
    worker.on("error", () =>
      finish(new Error("Document parser failed or exceeded its memory limit.")),
    );
    worker.on("exit", () => {
      if (!settled)
        finish(new Error("Document parser exited before completing."));
    });
  });
}
