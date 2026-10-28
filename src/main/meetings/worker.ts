import { parentPort, workerData } from "node:worker_threads";
import { MeetingDatabase } from "./database";

const data = workerData as { path: string; profile: string; key: Uint8Array };
let db: MeetingDatabase | undefined, initialError: string | undefined;
try {
  db = new MeetingDatabase(data.path, data.key, data.profile);
} catch {
  initialError =
    "History could not be unlocked. The encrypted database was preserved; check the OS credential, schema and file integrity.";
} finally {
  data.key.fill(0);
}
parentPort!.on(
  "message",
  (message: { id: number; method: string; args: unknown[] }) => {
    try {
      if (initialError) throw new Error(initialError);
      const methods = {
        ready: () => true,
        findTranscript: (
          ...args: Parameters<MeetingDatabase["findTranscript"]>
        ) => db!.findTranscript(...args),
        speakerLabels: (
          ...args: Parameters<MeetingDatabase["speakerLabels"]>
        ) => db!.speakerLabels(...args),
        create: (...args: Parameters<MeetingDatabase["create"]>) =>
          db!.create(...args),
        get: (...args: Parameters<MeetingDatabase["get"]>) => db!.get(...args),
        update: (...args: Parameters<MeetingDatabase["update"]>) =>
          db!.update(...args),
        begin: (...args: Parameters<MeetingDatabase["begin"]>) =>
          db!.begin(...args),
        append: (...args: Parameters<MeetingDatabase["append"]>) =>
          db!.append(...args),
        finish: (...args: Parameters<MeetingDatabase["finish"]>) =>
          db!.finish(...args),
        transcript: (...args: Parameters<MeetingDatabase["transcript"]>) =>
          db!.transcript(...args),
        contextSegments: (
          ...args: Parameters<MeetingDatabase["contextSegments"]>
        ) => db!.contextSegments(...args),
        list: (...args: Parameters<MeetingDatabase["list"]>) =>
          db!.list(...args),
        delete: (...args: Parameters<MeetingDatabase["delete"]>) =>
          db!.delete(...args),
        deleteAll: () => db!.deleteAll(),
        retention: (...args: Parameters<MeetingDatabase["retention"]>) =>
          db!.retention(...args),
        clearTranscript: (
          ...args: Parameters<MeetingDatabase["clearTranscript"]>
        ) => db!.clearTranscript(...args),
        recover: (...args: Parameters<MeetingDatabase["recover"]>) =>
          db!.recover(...args),
      };
      if (!Object.hasOwn(methods, message.method))
        throw new Error("Unknown history worker operation.");
      const run = methods[message.method as keyof typeof methods] as (
        ...args: unknown[]
      ) => unknown;
      parentPort!.postMessage({ id: message.id, value: run(...message.args) });
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error:
          error instanceof Error
            ? error.message
            : "History operation failed safely.",
      });
    }
  },
);
