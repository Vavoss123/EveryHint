import { parentPort, workerData } from "node:worker_threads";
import { PersonalDatabase } from "./database";
import type { PersonalConfig } from "../../shared/modes";
import type { Extraction, KnowledgeDocument } from "../../shared/knowledge";

const data = workerData as { path: string; key: Uint8Array; profile: string };
let db: PersonalDatabase;
try {
  db = new PersonalDatabase(data.path, data.key, data.profile);
} finally {
  data.key.fill(0);
}
parentPort!.on(
  "message",
  ({ id, method, value }: { id: number; method: string; value: unknown }) => {
    try {
      let result: unknown;
      if (method === "config") result = db.config();
      else if (method === "workspaceGet") {
        const input = value as {
          kind: import("../../shared/workspace").WorkspaceKind;
          id: string;
        };
        result = db.workspaceGet(input.kind, input.id);
      } else if (method === "workspaceBatch") {
        const input = value as {
          rows: import("../../shared/workspace").WorkspaceRow[];
          remove?: {
            kind: import("../../shared/workspace").WorkspaceKind;
            id: string;
          }[];
        };
        result = db.workspaceBatch(input.rows, input.remove);
      } else if (method === "workspaceList") {
        const input = value as {
          kind: import("../../shared/workspace").WorkspaceKind;
          offset?: number;
          limit?: number;
        };
        result = db.workspaceList(input.kind, input.offset, input.limit);
      } else if (method === "workspaceCounts") result = db.workspaceCounts();
      else if (method === "workspaceQuery")
        result = db.workspaceQuery(
          value as import("../../shared/workspace").WorkspaceQuery,
        );
      else if (method === "metrics")
        result = {
          memory: process.memoryUsage(),
          documents: db.documents().length,
        };
      else if (method === "save") result = db.save(value as PersonalConfig);
      else if (method === "documents") result = db.documents();
      else if (method === "sections") result = db.sections(value as string);
      else if (method === "import") {
        const input = value as {
          document: KnowledgeDocument;
          extraction: Extraction;
        };
        result = db.import(input.document, input.extraction);
      } else if (method === "documentChange") {
        const input = value as { id: string; name: string; enabled: boolean };
        result = db.documentChange(input.id, input.name, input.enabled);
      } else if (method === "deleteDocument")
        result = db.deleteDocument(value as string);
      else if (method === "retrieve") {
        const input = value as { query: string; ids: string[]; offset: number };
        result = db.retrieve(input.query, input.ids, input.offset);
      } else throw new Error("Unknown personal library operation.");
      parentPort!.postMessage({ id, value: result });
    } catch {
      parentPort!.postMessage({
        id,
        error:
          "Personal library operation failed (validation, capacity, key or storage). Existing committed data was preserved.",
      });
    }
  },
);
