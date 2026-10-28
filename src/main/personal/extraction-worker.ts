import { parentPort, workerData } from "node:worker_threads";
import { open } from "node:fs/promises";
import { extractDocument } from "./extract";
import {
  MAX_IMPORT_BYTES,
  type KnowledgeDocument,
} from "../../shared/knowledge";

// No document-supplied URL is ever fetched. PDF processing uses bytes only;
// no rendering, action/JavaScript APIs, relationships or external conversion.
globalThis.fetch = () =>
  Promise.reject(new Error("Document network access is disabled."));
const input = workerData as { path: string; type: KnowledgeDocument["type"] };
try {
  const file = await open(input.path, "r");
  let bytes: Buffer;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMPORT_BYTES)
      throw new Error("Choose a regular document between 1 byte and 8 MiB.");
    bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await file.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size)
      throw new Error("Document changed while reading. Import it again.");
    bytes = bytes.subarray(0, stat.size);
  } finally {
    await file.close();
  }
  try {
    const started = performance.now(),
      extraction = await extractDocument(input.type, bytes);
    parentPort!.postMessage({
      extraction,
      bytes: bytes.length,
      metrics: {
        extractionMs: performance.now() - started,
        parserHeapBytes: process.memoryUsage().heapUsed,
      },
    });
  } finally {
    bytes.fill(0);
  }
} catch (error) {
  parentPort!.postMessage({
    error:
      error instanceof Error ? error.message : "Document extraction failed.",
  });
}
