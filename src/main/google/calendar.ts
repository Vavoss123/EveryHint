import { createHash } from "node:crypto";
import type { CalendarEvent, CalendarInfo } from "../../shared/workspace";
import { record } from "../../shared/validation";
import { GoogleError } from "./http";

export interface GoogleReader {
  subject: string | null;
  read(url: string, signal: AbortSignal): Promise<unknown>;
}
export const opaqueId = (prefix: string, ...parts: string[]) =>
  `${prefix}_${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 48)}`;
export function safeText(value: unknown, limit: number): string {
  return typeof value === "string"
    ? value.replaceAll("\0", "").slice(0, limit)
    : "";
}
export function validTimeZone(value: unknown, fallback = "UTC"): string {
  const zone =
    typeof value === "string" && value.length <= 100 ? value : fallback;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone }).format();
    return zone;
  } catch {
    throw new Error("Google returned an invalid time zone.");
  }
}
export function dateInZone(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}
export function meetingURL(
  value: unknown,
): { url: string; platform: string } | null {
  if (typeof value !== "string" || value.length > 1800) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase();
    const platform =
      host === "meet.google.com"
        ? "Google Meet"
        : host === "zoom.us" || host.endsWith(".zoom.us")
          ? "Zoom"
          : ["teams.microsoft.com", "teams.live.com"].includes(host)
            ? "Microsoft Teams"
            : host.endsWith(".webex.com")
              ? "Webex"
              : host === "whereby.com"
                ? "Whereby"
                : null;
    return platform ? { url: url.href, platform } : null;
  } catch {
    return null;
  }
}
function calendarDate(
  value: unknown,
  zone: string,
): { at: number; date: string | null; timeZone: string } {
  const input = record(value),
    timeZone = validTimeZone(input.timeZone, zone);
  if (
    typeof input.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.date)
  ) {
    const at = Date.parse(`${input.date}T00:00:00Z`);
    if (
      !Number.isFinite(at) ||
      new Date(at).toISOString().slice(0, 10) !== input.date
    )
      throw new Error("Invalid all-day calendar date.");
    return { at, date: input.date, timeZone };
  }
  if (
    typeof input.dateTime !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(
      input.dateTime,
    )
  )
    throw new Error(
      "Calendar dateTime requires an explicit offset; ambiguous local times are not guessed.",
    );
  const at = Date.parse(input.dateTime);
  if (!Number.isFinite(at)) throw new Error("Invalid calendar dateTime.");
  return { at, date: null, timeZone };
}
export function parseCalendarEvent(
  value: unknown,
  calendar: CalendarInfo,
  subject: string,
  now: number,
): CalendarEvent | null {
  const event = record(value);
  if (typeof event.id !== "string" || !event.id || event.id.length > 1024)
    throw new Error("Invalid Google event identifier.");
  if (event.status === "cancelled") return null;
  const start = calendarDate(event.start, calendar.timeZone),
    end = calendarDate(event.end, calendar.timeZone);
  if (end.at <= start.at || Boolean(start.date) !== Boolean(end.date))
    throw new Error("Invalid calendar event interval.");
  const conference =
    event.conferenceData && typeof event.conferenceData === "object"
      ? record(event.conferenceData)
      : {};
  const links = [
    event.hangoutLink,
    ...(Array.isArray(conference.entryPoints)
      ? conference.entryPoints
          .filter(
            (p) => p && typeof p === "object" && p.entryPointType === "video",
          )
          .map((p) => p.uri)
      : []),
  ];
  const link = links.map(meetingURL).find(Boolean);
  const attendees = Array.isArray(event.attendees)
    ? event.attendees.slice(0, 50).map((value) => {
        const person = record(value);
        return {
          email: safeText(person.email, 254),
          name: safeText(person.displayName, 160),
          response: safeText(person.responseStatus, 30),
        };
      })
    : [];
  return {
    id: opaqueId("event", subject, calendar.id, event.id),
    googleId: event.id,
    calendarId: calendar.id,
    subject,
    title: safeText(event.summary, 200) || "Untitled calendar event",
    description: safeText(event.description, 4000),
    startAt: start.at,
    endAt: end.at,
    startDate: start.date,
    endDate: end.date,
    timeZone: start.timeZone,
    allDay: start.date !== null,
    location: safeText(event.location, 500),
    url: link?.url ?? null,
    platform: link?.platform ?? null,
    attendees,
    recurringId:
      typeof event.recurringEventId === "string"
        ? safeText(event.recurringEventId, 1024)
        : null,
    originalStart:
      event.originalStartTime && typeof event.originalStartTime === "object"
        ? safeText(
            record(event.originalStartTime).dateTime ??
              record(event.originalStartTime).date,
            100,
          )
        : null,
    updated: safeText(event.updated, 100),
    fetchedAt: now,
    status: event.status === "tentative" ? "tentative" : "confirmed",
  };
}
export class CalendarAPI {
  requests = 0;
  constructor(
    private account: GoogleReader,
    private now: () => number = Date.now,
  ) {}
  private async read(url: URL, signal: AbortSignal) {
    this.requests++;
    return record(await this.account.read(url.href, signal));
  }
  async calendars(signal: AbortSignal): Promise<CalendarInfo[]> {
    const all: CalendarInfo[] = [],
      seen = new Set<string>();
    let page: string | undefined;
    for (let index = 0; index < 5; index++) {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      );
      url.search = new URLSearchParams({
        maxResults: "100",
        showDeleted: "false",
        minAccessRole: "reader",
        ...(page ? { pageToken: page } : {}),
      }).toString();
      const data = await this.read(url, signal);
      if (!Array.isArray(data.items) || data.items.length > 100)
        throw new Error("Invalid calendar-list page.");
      for (const raw of data.items) {
        const item = record(raw);
        if (
          typeof item.id !== "string" ||
          !item.id ||
          item.id.length > 256 ||
          seen.has(item.id)
        )
          continue;
        seen.add(item.id);
        if (!item.deleted)
          all.push({
            id: item.id,
            name:
              safeText(item.summaryOverride ?? item.summary, 160) ||
              "Unnamed calendar",
            timeZone: validTimeZone(item.timeZone),
            primary: item.primary === true,
          });
      }
      page =
        typeof data.nextPageToken === "string" &&
        data.nextPageToken.length <= 2048
          ? data.nextPageToken
          : undefined;
      if (!page) return all;
    }
    throw new Error(
      "Calendar-list pagination exceeds 500 calendars; no partial list was committed.",
    );
  }
  async events(
    calendars: CalendarInfo[],
    signal: AbortSignal,
  ): Promise<CalendarEvent[]> {
    if (!this.account.subject)
      throw new Error("Connect Google Calendar first.");
    if (calendars.length > 5) throw new Error("Select at most five calendars.");
    const now = this.now(),
      output: CalendarEvent[] = [];
    for (const calendar of calendars) {
      let restarted = false;
      for (;;) {
        const result: CalendarEvent[] = [],
          tokens = new Set<string>();
        let page: string | undefined,
          reset = false;
        for (let index = 0; index < 8; index++) {
          const url = new URL(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
          );
          url.search = new URLSearchParams({
            singleEvents: "true",
            showDeleted: "true",
            maxResults: "250",
            orderBy: "startTime",
            timeMin: new Date(now - 7 * 86400000).toISOString(),
            timeMax: new Date(now + 90 * 86400000).toISOString(),
            ...(page ? { pageToken: page } : {}),
          }).toString();
          let data;
          try {
            data = await this.read(url, signal);
          } catch (error) {
            if (
              error instanceof GoogleError &&
              error.status === 410 &&
              !restarted
            ) {
              restarted = true;
              reset = true;
              break;
            }
            throw error;
          }
          if (!Array.isArray(data.items) || data.items.length > 250)
            throw new Error("Invalid calendar-event page.");
          for (const raw of data.items) {
            const event = parseCalendarEvent(
              raw,
              calendar,
              this.account.subject,
              now,
            );
            if (event) result.push(event);
          }
          if (output.length + result.length > 1000)
            throw new Error(
              "Event window exceeds 1,000 events. Select fewer calendars; no partial cache was committed.",
            );
          page =
            typeof data.nextPageToken === "string" &&
            data.nextPageToken.length <= 2048
              ? data.nextPageToken
              : undefined;
          if (!page) break;
          if (tokens.has(page))
            throw new Error("Google repeated a pagination token.");
          tokens.add(page);
          if (index === 7)
            throw new Error("Calendar event pagination limit exceeded.");
        }
        if (reset) continue;
        output.push(...result);
        break;
      }
    }
    return [...new Map(output.map((event) => [event.id, event])).values()].sort(
      (a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id),
    );
  }
}
