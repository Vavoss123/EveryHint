import { describe, expect, it, vi } from "vitest";
import { ContactsAPI, parseImportedContact } from "../src/main/google/contacts";
import { GoogleError } from "../src/main/google/http";
import {
  EMPTY_FACTS,
  personName,
  verifiedPersonEmail,
  type Person,
} from "../src/shared/workspace";
import { workspaceHarness } from "./workspace-helpers";
import { deferred } from "./helpers";
const fixture = (id = "a", deleted = false) => ({
  resourceName: `people/${id}`,
  names: [{ displayName: "Alex Example" }],
  emailAddresses: [
    { value: "alex@example.test", metadata: { verified: true } },
  ],
  organizations: [{ name: "Example organisation", title: "Engineer" }],
  metadata: { deleted, sources: [{ updateTime: "2026-10-28T09:00:00Z" }] },
});
describe("P10 separately authorised People API", () => {
  it("requires a separate connected subject before reading contacts", async () => {
    const read = vi.fn(),
      api = new ContactsAPI({ subject: null, read });
    await expect(
      api.search("Alex", new AbortController().signal),
    ).rejects.toThrow("separate");
    expect(read).not.toHaveBeenCalled();
  });
  it("warms search once and returns only requested minimal contact fields", async () => {
    const urls: URL[] = [],
      wait = vi.fn(async () => {}),
      read = vi.fn(async (url: string) => {
        urls.push(new URL(url));
        return { results: [{ person: fixture() }] };
      });
    const api = new ContactsAPI(
      { subject: "subject", read },
      () => 1000000,
      wait,
    );
    const result = await api.search("Alex", new AbortController().signal);
    await api.search("Alex", new AbortController().signal);
    expect(urls).toHaveLength(3);
    expect(urls[0]?.searchParams.get("query")).toBe("");
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      emailVerified: true,
      jobTitle: "Engineer",
      subject: "subject",
    });
    expect(urls[1]?.searchParams.get("readMask")).toBe(
      "names,emailAddresses,organizations,metadata",
    );
    expect(result[0]).not.toHaveProperty("birthdays");
  });
  it("reads only selected resource names and handles provider-deleted contacts", async () => {
    const read = vi.fn(async (_url: string) => {
        void _url;
        return {
          responses: [
            { requestedResourceName: "people/a", person: fixture() },
            { requestedResourceName: "people/b", status: { code: 5 } },
          ],
        };
      }),
      api = new ContactsAPI({ subject: "s", read });
    const result = await api.selected(
      ["people/a", "people/b"],
      new AbortController().signal,
    );
    expect(result.contacts).toHaveLength(1);
    expect(result.deleted).toEqual(["people/b"]);
    expect(
      new URL(read.mock.calls[0]![0]).searchParams.getAll("resourceNames"),
    ).toEqual(["people/a", "people/b"]);
  });
  it("refuses incomplete selected import", async () => {
    const api = new ContactsAPI({
      subject: "s",
      read: async () => ({ responses: [] }),
    });
    await expect(
      api.selected(["people/a"], new AbortController().signal),
    ).rejects.toThrow("incomplete");
  });
  it("paginates a fully authorised address book and keeps delta parameters stable", async () => {
    const urls: URL[] = [],
      read = vi.fn(async (raw: string) => {
        const url = new URL(raw);
        urls.push(url);
        return url.searchParams.has("pageToken")
          ? { connections: [fixture("b")], nextSyncToken: "final-token" }
          : { connections: [fixture()], nextPageToken: "page2" };
      }),
      api = new ContactsAPI({ subject: "s", read }, () => 1000000);
    const result = await api.all(null, new AbortController().signal);
    expect(result.contacts).toHaveLength(2);
    expect(result.sync.token).toBe("final-token");
    expect(urls[0]?.searchParams.get("personFields")).toBe(
      urls[1]?.searchParams.get("personFields"),
    );
    expect(
      urls.every((u) => u.searchParams.get("requestSyncToken") === "true"),
    ).toBe(true);
  });
  it("resets an expired sync token once and handles deleted delta records", async () => {
    let attempts = 0;
    const urls: URL[] = [],
      api = new ContactsAPI(
        {
          subject: "s",
          read: async (raw) => {
            const url = new URL(raw);
            urls.push(url);
            if (!attempts++)
              throw new GoogleError(410, "EXPIRED_SYNC_TOKEN", "expired");
            return {
              connections: [fixture("gone", true)],
              nextSyncToken: "new-token",
            };
          },
        },
        () => 1000000,
      );
    const result = await api.all(
      { token: "old-token", fullSyncAt: 900000, subject: "s" },
      new AbortController().signal,
    );
    expect(urls[0]?.searchParams.get("syncToken")).toBe("old-token");
    expect(urls[1]?.searchParams.has("syncToken")).toBe(false);
    expect(result.full).toBe(true);
    expect(result.deleted).toEqual(["people/gone"]);
  });
  it("backs off rate limits without repeated network requests", async () => {
    const read = vi.fn(async () => {
        throw new GoogleError(429, "RESOURCE_EXHAUSTED", "rate", 30000);
      }),
      api = new ContactsAPI(
        { subject: "s", read },
        () => 1000000,
        async () => {},
      );
    await expect(
      api.search("Alex", new AbortController().signal),
    ).rejects.toThrow();
    await expect(
      api.search("Alex", new AbortController().signal),
    ).rejects.toThrow("backoff");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not invent verified email or personal fields", () => {
    const p = parseImportedContact(
      { resourceName: "people/a", names: [] },
      "s",
      1,
    )!;
    expect(p.email).toBe("");
    expect(p.emailVerified).toBe(false);
    expect(p.organisation).toBe("");
    expect(parseImportedContact(fixture("a", true), "s", 1)).toBeNull();
  });
});
describe("P10 local People records and provenance", () => {
  it("never publishes an old calendar response into the next workspace profile", async () => {
    const h = await workspaceHarness();
    try {
      await h.command("connect-calendar", { acknowledged: true });
      const result = deferred<unknown>();
      h.reads.mockReturnValueOnce(result.promise);
      const pending = h.command("list-calendars");
      h.controller.switchProfile("b".repeat(64));
      result.resolve({
        items: [
          {
            id: "old-private-calendar",
            summary: "Old private name",
            timeZone: "UTC",
            accessRole: "reader",
          },
        ],
      });
      await expect(pending).rejects.toThrow("changed");
      expect(h.controller.value.calendars).toEqual([]);
      expect(JSON.stringify(h.controller.value)).not.toContain(
        "Old private name",
      );
    } finally {
      await h.close();
    }
  });
  it("creates, searches, edits and deletes manual records without any Google or AI request", async () => {
    const h = await workspaceHarness();
    try {
      const person = (await h.command("save-person", {
        id: "new",
        manual: { ...EMPTY_FACTS, name: "Alex", email: "alex@example.test" },
        notes: "User-authored context",
        meetingIds: [],
        updatedAt: 0,
      })) as Person;
      expect(personName(person)).toBe("Alex");
      expect(verifiedPersonEmail(person)).toBeNull();
      const query = await h.controller.query({
        scopeId: h.controller.value.scopeId,
        query: { kind: "person", query: "Alex", offset: 0 },
      });
      expect(query.items).toHaveLength(1);
      const saved = (await h.command("save-person", {
        id: person.id,
        manual: { ...person.manual, emailVerified: true },
        notes: "Updated user notes",
        meetingIds: [],
        updatedAt: person.updatedAt,
      })) as Person;
      expect(verifiedPersonEmail(saved)).toBe("alex@example.test");
      await h.command("delete-person", { id: person.id, acknowledged: true });
      expect(h.controller.value.peopleCount).toBe(0);
      expect(h.reads).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("prevents forged imported/verified Google fields and unacknowledged whole-book import", async () => {
    const h = await workspaceHarness();
    try {
      await expect(
        h.command("save-person", {
          id: "new",
          manual: EMPTY_FACTS,
          notes: "",
          meetingIds: [],
          updatedAt: 0,
          imported: { name: "Invented Google profile" },
        }),
      ).rejects.toThrow();
      await expect(
        h.command("sync-all-contacts", {
          allContacts: true,
          acknowledged: false,
        }),
      ).rejects.toThrow("Separately");
      expect(h.reads).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("matches only exact verified addresses without plus/dot alias guessing", () => {
    const person: Person = {
      id: "p",
      manual: {
        ...EMPTY_FACTS,
        name: "Alex",
        email: "alex+tag@example.test",
        emailVerified: true,
      },
      imported: null,
      notes: "",
      meetingIds: [],
      updatedAt: 1,
    };
    expect(verifiedPersonEmail(person)).not.toBe("alex@example.test");
    person.manual.emailVerified = false;
    expect(verifiedPersonEmail(person)).toBeNull();
  });
  it("isolates local profile reads and rejects stale scopes", async () => {
    const h = await workspaceHarness();
    try {
      const old = h.controller.value.scopeId;
      h.controller.switchProfile("b".repeat(64));
      await expect(
        h.controller.query({
          scopeId: old,
          query: { kind: "person", query: "", offset: 0 },
        }),
      ).rejects.toThrow("changed");
      expect(h.controller.value.peopleCount).toBe(0);
    } finally {
      await h.close();
    }
  });
});
