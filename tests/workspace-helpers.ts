import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import {
  WorkspaceController,
  type WorkspacePorts,
} from "../src/main/workspace/controller";
import { WorkspaceResume } from "../src/main/workspace/resume";
import { PersonalDatabase } from "../src/main/personal/database";
import type { PersonalStore } from "../src/main/personal/store";
import type { GoogleAccount } from "../src/main/google/accounts";
import type { GoogleService } from "../src/shared/workspace";
import { historyProfile } from "../src/main/meetings/keys";
export async function workspaceHarness(extra: Partial<WorkspacePorts> = {}) {
  const root = mkdtempSync(join(tmpdir(), "everyhint-p10-context-")),
    profile = historyProfile(root, "fixture-local-account"),
    key = randomBytes(32),
    databases = new Map<string, PersonalDatabase>();
  const connections = {
    calendar: { subject: null as string | null },
    contacts: { subject: null as string | null },
  };
  const reads = vi.fn(
    async (
      _service: GoogleService,
      _url: string,
      _signal: AbortSignal,
    ): Promise<unknown> => {
      void _service;
      void _url;
      void _signal;
      return { items: [] };
    },
  );
  const factory = (id: string) => {
    let db: PersonalDatabase | undefined;
    return {
      open: async () => {
        db = new PersonalDatabase(join(root, `${id}.sqlite`), key, id);
        databases.set(id, db);
      },
      close: async () => {
        if (db) {
          db.close();
          databases.delete(id);
          db = undefined;
        }
      },
      call: async (method: string, input?: unknown) => {
        if (!db) throw new Error("Fixture store closed.");
        const value = input as Record<string, unknown>;
        if (method === "workspaceGet")
          return db.workspaceGet(value.kind as never, value.id as string);
        if (method === "workspaceList")
          return db.workspaceList(
            value.kind as never,
            value.offset as number | undefined,
            value.limit as number | undefined,
          );
        if (method === "workspaceBatch")
          return db.workspaceBatch(value.rows as never, value.remove as never);
        if (method === "workspaceCounts") return db.workspaceCounts();
        if (method === "workspaceQuery")
          return db.workspaceQuery(value as never);
        throw new Error(`Unexpected fixture method ${method}`);
      },
    } as unknown as PersonalStore;
  };
  const google = (
    _profile: string,
    service: GoogleService,
    changed: () => void,
  ) =>
    ({
      get subject() {
        return connections[service].subject;
      },
      get value() {
        return {
          service,
          state: connections[service].subject ? "connected" : "disconnected",
          subject: connections[service].subject,
          email: null,
          message: "Deterministic fixture, no genuine Google auth",
          configured: true,
        };
      },
      restore: async () => {},
      connect: async () => {
        connections[service].subject = `google-${service}`;
        changed();
      },
      disconnect: async () => {
        connections[service].subject = null;
        changed();
      },
      cancel: () => {},
      close: async () => {},
      read: async (url: string, signal: AbortSignal) => {
        if (!connections[service].subject)
          throw new Error("Fixture permission is not connected.");
        return reads(service, url, signal);
      },
    }) as unknown as GoogleAccount;
  const invalidate = vi.fn(),
    notify = vi.fn(() => vi.fn()),
    openURL = vi.fn(async () => {});
  const controller = new WorkspaceController(
    {
      store: factory,
      google,
      changed: vi.fn(),
      invalidate,
      notify,
      openURL,
      assistant: {} as never,
      meetings: { value: { locked: true } } as never,
      personal: {} as never,
      captureIdle: () => true,
      exportText: vi.fn(async () => ({ cancelled: false })),
      ...extra,
    },
    new WorkspaceResume(join(root, "resume")),
  );
  controller.switchProfile(profile);
  const command = (command: string, value?: unknown) =>
    controller.command({
      scopeId: controller.value.scopeId,
      command,
      ...(value === undefined ? {} : { value }),
    });
  await command("unlock");
  return {
    controller,
    command,
    root,
    profile,
    connections,
    reads,
    invalidate,
    notify,
    openURL,
    db: () => databases.get(profile)!,
    close: async () => {
      await controller.dispose();
      for (const db of databases.values()) db.close();
      databases.clear();
      key.fill(0);
      rmSync(root, { recursive: true, force: true });
    },
  };
}
