import { setTimeout as delay } from "node:timers/promises";
import { record } from "../../shared/validation";
import type { ImportedContact } from "../../shared/workspace";
import { safeText, type GoogleReader } from "./calendar";
import { GoogleError } from "./http";
const fields = "names,emailAddresses,organizations,metadata";
export interface ContactSync {
  token: string;
  fullSyncAt: number;
  subject: string;
}
export function contactResource(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^people\/[A-Za-z0-9_-]{1,180}$/.test(value) ||
    value === "people/me"
  )
    throw new Error(
      "Choose a contact returned by the authorised People API search.",
    );
  return value;
}
export function parseImportedContact(
  value: unknown,
  subject: string,
  now: number,
): ImportedContact | null {
  const raw = record(value),
    resourceName = contactResource(raw.resourceName),
    metadata =
      raw.metadata && typeof raw.metadata === "object"
        ? record(raw.metadata)
        : {};
  if (metadata.deleted === true) return null;
  const first = (value: unknown) => {
    if (!Array.isArray(value) || !value.length) return {};
    const rows = value
      .slice(0, 20)
      .filter((v) => v && typeof v === "object")
      .map(record);
    return (
      rows.find(
        (v) =>
          v.metadata &&
          typeof v.metadata === "object" &&
          record(v.metadata).primary === true,
      ) ??
      rows[0] ??
      {}
    );
  };
  const name = first(raw.names),
    email = first(raw.emailAddresses),
    organisation = first(raw.organizations),
    emailMeta =
      email.metadata && typeof email.metadata === "object"
        ? record(email.metadata)
        : {};
  const sources = Array.isArray(metadata.sources) ? metadata.sources : [];
  const address = safeText(email.value, 254),
    validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
  return {
    resourceName,
    subject,
    name: safeText(name.displayName, 160),
    email: validEmail ? address : "",
    emailVerified: validEmail && emailMeta.verified === true,
    organisation: safeText(organisation.name, 200),
    jobTitle: safeText(organisation.title, 160),
    updated: safeText(
      sources.find((s) => s && typeof s === "object" && s.updateTime)
        ?.updateTime,
      100,
    ),
    retrievedAt: now,
  };
}
export class ContactsAPI {
  private warmAt = 0;
  private backoffUntil = 0;
  requests = 0;
  constructor(
    private account: GoogleReader,
    private now: () => number = Date.now,
    private wait: (ms: number, signal: AbortSignal) => Promise<void> = async (
      ms,
      signal,
    ) => {
      await delay(ms, undefined, { signal });
    },
  ) {}
  private async read(url: URL, signal: AbortSignal) {
    if (this.now() < this.backoffUntil)
      throw new Error("Contacts requests are paused for Google backoff.");
    this.requests++;
    if (!this.account.subject)
      throw new Error(
        "Connect the separate Google Contacts read permission first.",
      );
    try {
      return record(await this.account.read(url.href, signal));
    } catch (error) {
      if (error instanceof GoogleError && error.retryAfterMs)
        this.backoffUntil = this.now() + error.retryAfterMs;
      throw error;
    }
  }
  async search(query: string, signal: AbortSignal): Promise<ImportedContact[]> {
    if (!query.trim() || query.length > 200)
      throw new Error("Enter a contact search of at most 200 characters.");
    const url = new URL(
      "https://people.googleapis.com/v1/people:searchContacts",
    );
    url.search = new URLSearchParams({
      query: "",
      readMask: fields,
      pageSize: "30",
      sources: "READ_SOURCE_TYPE_CONTACT",
    }).toString();
    if (this.now() - this.warmAt > 300000 || !this.warmAt) {
      await this.read(url, signal);
      await this.wait(5000, signal);
      this.warmAt = this.now();
    }
    url.searchParams.set("query", query);
    const data = await this.read(url, signal);
    if (!Array.isArray(data.results) || data.results.length > 30)
      throw new Error("Invalid Google contact-search response.");
    return data.results
      .map((raw) =>
        parseImportedContact(
          record(raw).person,
          this.account.subject!,
          this.now(),
        ),
      )
      .filter((person): person is ImportedContact => Boolean(person));
  }
  async selected(
    resources: string[],
    signal: AbortSignal,
  ): Promise<{ contacts: ImportedContact[]; deleted: string[] }> {
    if (!resources.length || resources.length > 50)
      throw new Error("Select one to fifty authorised contacts.");
    const url = new URL("https://people.googleapis.com/v1/people:batchGet");
    url.search = new URLSearchParams({
      personFields: fields,
      sources: "READ_SOURCE_TYPE_CONTACT",
    }).toString();
    for (const resource of resources)
      url.searchParams.append("resourceNames", contactResource(resource));
    const data = await this.read(url, signal);
    if (!Array.isArray(data.responses) || data.responses.length > 50)
      throw new Error("Invalid selected contact response.");
    const contacts: ImportedContact[] = [],
      deleted: string[] = [],
      seen = new Set<string>();
    for (const raw of data.responses) {
      const item = record(raw);
      const resource = contactResource(
        item.requestedResourceName ??
          (item.person && record(item.person).resourceName),
      );
      if (!resources.includes(resource) || seen.has(resource))
        throw new Error("Google returned an unselected or duplicate contact.");
      seen.add(resource);
      const status =
        item.status && typeof item.status === "object"
          ? record(item.status)
          : {};
      if (status.code === 5 || item.httpStatusCode === 404) {
        deleted.push(resource);
        continue;
      }
      if (status.code && status.code !== 0)
        throw new Error(
          "A selected contact could not be read; no partial import was committed.",
        );
      const person = parseImportedContact(
        item.person,
        this.account.subject!,
        this.now(),
      );
      if (person) contacts.push(person);
      else deleted.push(resource);
    }
    if (seen.size !== resources.length)
      throw new Error(
        "The selected-contact response was incomplete; no partial import was committed.",
      );
    return { contacts, deleted };
  }
  async all(
    previous: ContactSync | null,
    signal: AbortSignal,
  ): Promise<{
    contacts: ImportedContact[];
    deleted: string[];
    sync: ContactSync;
    full: boolean;
  }> {
    if (!this.account.subject) throw new Error("Connect Contacts separately.");
    let token =
        previous?.subject === this.account.subject &&
        this.now() - previous.fullSyncAt < 7 * 86400000
          ? previous.token
          : null,
      restarted = false;
    for (;;) {
      const contacts: ImportedContact[] = [],
        deleted: string[] = [],
        pages = new Set<string>();
      let page: string | undefined,
        reset = false,
        nextSync: string | undefined;
      for (let index = 0; index < 11; index++) {
        const url = new URL(
          "https://people.googleapis.com/v1/people/me/connections",
        );
        url.search = new URLSearchParams({
          personFields: fields,
          pageSize: "100",
          sources: "READ_SOURCE_TYPE_CONTACT",
          requestSyncToken: "true",
          ...(token ? { syncToken: token } : {}),
          ...(page ? { pageToken: page } : {}),
        }).toString();
        let data;
        try {
          data = await this.read(url, signal);
        } catch (error) {
          if (
            error instanceof GoogleError &&
            (error.status === 410 || error.reason === "EXPIRED_SYNC_TOKEN") &&
            !restarted
          ) {
            restarted = true;
            token = null;
            reset = true;
            break;
          }
          throw error;
        }
        if (data.connections !== undefined && !Array.isArray(data.connections))
          throw new Error("Invalid People sync response.");
        for (const raw of data.connections ?? []) {
          const person = parseImportedContact(
            raw,
            this.account.subject,
            this.now(),
          );
          if (person) contacts.push(person);
          else deleted.push(contactResource(record(raw).resourceName));
        }
        if (contacts.length + deleted.length > 1000)
          throw new Error(
            "Contact sync exceeds the 1,000-contact bound. Select contacts instead; no partial address book was committed.",
          );
        page =
          typeof data.nextPageToken === "string" &&
          data.nextPageToken.length <= 2048
            ? data.nextPageToken
            : undefined;
        nextSync =
          typeof data.nextSyncToken === "string" &&
          data.nextSyncToken.length <= 2048
            ? data.nextSyncToken
            : undefined;
        if (!page) break;
        if (pages.has(page) || index === 10)
          throw new Error("People API pagination limit or repeated token.");
        pages.add(page);
      }
      if (reset) continue;
      if (!nextSync)
        throw new Error(
          "People sync did not return a final sync token; previous state was preserved.",
        );
      return {
        contacts,
        deleted,
        sync: {
          token: nextSync,
          fullSyncAt: token ? previous!.fullSyncAt : this.now(),
          subject: this.account.subject,
        },
        full: !token,
      };
    }
  }
}
