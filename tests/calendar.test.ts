import { describe, expect, it, vi } from "vitest";
import {
  CalendarAPI,
  parseCalendarEvent,
  dateInZone,
  meetingURL,
} from "../src/main/google/calendar";
import { GoogleError } from "../src/main/google/http";
import { MeetingReminders, reminderKey } from "../src/main/workspace/reminders";
const calendar = {
  id: "work@example.test",
  name: "Work",
  timeZone: "Europe/London",
  primary: true,
};
const fixture = (patch = {}) => ({
  id: "event-a",
  summary: "Approved test meeting",
  status: "confirmed",
  start: { dateTime: "2026-10-25T01:30:00+01:00", timeZone: "Europe/London" },
  end: { dateTime: "2026-10-25T01:30:00+00:00", timeZone: "Europe/London" },
  hangoutLink: "https://meet.google.com/abc-defg-hij",
  attendees: [
    {
      email: "alex@example.test",
      displayName: "Alex",
      responseStatus: "accepted",
    },
  ],
  ...patch,
});
describe("P10 bounded Google calendar reads", () => {
  it("retains real offsets across the DST fold and a one-hour duration", () => {
    const event = parseCalendarEvent(fixture(), calendar, "subject", 1)!;
    expect(event.endAt - event.startAt).toBe(3600000);
    expect(event.timeZone).toBe("Europe/London");
    expect(dateInZone(event.startAt, "Europe/London")).toBe("2026-10-25");
    expect(event.platform).toBe("Google Meet");
  });
  it("retains all-day dates without shifting through a time zone", () => {
    const event = parseCalendarEvent(
      fixture({ start: { date: "2026-10-25" }, end: { date: "2026-10-26" } }),
      calendar,
      "subject",
      1,
    )!;
    expect(event.allDay).toBe(true);
    expect(event.startDate).toBe("2026-10-25");
    expect(event.endDate).toBe("2026-10-26");
  });
  it("never guesses an ambiguous dateTime without an explicit offset", () =>
    expect(() =>
      parseCalendarEvent(
        fixture({
          start: { dateTime: "2026-10-25T01:30:00", timeZone: "Europe/London" },
        }),
        calendar,
        "subject",
        1,
      ),
    ).toThrow("explicit offset"));
  it("handles cancellations without fabricating dates", () =>
    expect(
      parseCalendarEvent(
        { id: "cancelled", status: "cancelled" },
        calendar,
        "subject",
        1,
      ),
    ).toBeNull());
  it("preserves recurrence provenance and attendee data without speaker inference", () => {
    const event = parseCalendarEvent(
      fixture({
        recurringEventId: "series-a",
        originalStartTime: { dateTime: "2026-10-25T01:30:00+01:00" },
      }),
      calendar,
      "subject",
      1,
    )!;
    expect(event.recurringId).toBe("series-a");
    expect(event.attendees[0]?.email).toBe("alex@example.test");
    expect(event).not.toHaveProperty("speaker");
  });
  it.each([
    "javascript:alert(1)",
    "https://meet.google.com.evil.test/abc",
    "https://user:password@meet.google.com/abc",
    "http://meet.google.com/abc",
  ])("blocks unsafe meeting URL %s", (url) =>
    expect(meetingURL(url)).toBeNull(),
  );
  it("paginates selected calendars and events with fixed finite-window parameters and no syncToken", async () => {
    const urls: URL[] = [];
    const read = vi.fn(async (raw: string) => {
      const url = new URL(raw);
      urls.push(url);
      if (url.pathname.endsWith("calendarList"))
        return {
          items: [calendar],
          nextPageToken: url.searchParams.has("pageToken")
            ? undefined
            : "calendar-page",
        };
      return url.searchParams.has("pageToken")
        ? { items: [fixture({ id: "b" }), { id: "gone", status: "cancelled" }] }
        : { items: [fixture()], nextPageToken: "next" };
    });
    const api = new CalendarAPI({ subject: "subject", read }, () =>
      Date.UTC(2026, 9, 28),
    );
    const calendars = await api.calendars(new AbortController().signal);
    expect(calendars).toHaveLength(1);
    const events = await api.events(calendars, new AbortController().signal);
    expect(events).toHaveLength(2);
    const eventURLs = urls.filter((u) => u.pathname.endsWith("/events"));
    expect(eventURLs[0]?.searchParams.get("singleEvents")).toBe("true");
    expect(
      eventURLs.every(
        (u) =>
          !u.searchParams.has("syncToken") &&
          u.searchParams.has("timeMin") &&
          u.searchParams.has("timeMax"),
      ),
    ).toBe(true);
  });
  it("restarts a complete bounded window once on 410 without calling it incremental sync", async () => {
    let count = 0;
    const read = vi.fn(async () => {
      if (!count++) throw new GoogleError(410, "fullSyncRequired", "fixture");
      return { items: [fixture()] };
    });
    expect(
      await new CalendarAPI({ subject: "subject", read }).events(
        [calendar],
        new AbortController().signal,
      ),
    ).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("supports multiple selected calendars and refuses an excessive selection", async () => {
    const read = vi.fn(async () => ({ items: [] })),
      api = new CalendarAPI({ subject: "subject", read });
    await api.events(
      [calendar, { ...calendar, id: "other" }],
      new AbortController().signal,
    );
    expect(read).toHaveBeenCalledTimes(2);
    await expect(
      api.events(
        Array.from({ length: 6 }, () => calendar),
        new AbortController().signal,
      ),
    ).rejects.toThrow("five");
  });
  it("propagates rate/permission failures without committing a partial event window", async () => {
    const read = vi.fn(async () => {
      throw new GoogleError(429, "rateLimitExceeded", "rate", 30000);
    });
    await expect(
      new CalendarAPI({ subject: "subject", read }).events(
        [calendar],
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(GoogleError);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
describe("P10 local reminders never join/capture", () => {
  it("cancels an in-flight toast when reminder settings or the event schedule changes", async () => {
    let release!: (value: boolean) => void;
    const event = parseCalendarEvent(fixture(), calendar, "subject", 1)!,
      pending = new Promise<boolean>((resolve) => {
        release = resolve;
      }),
      notify = vi.fn(() => vi.fn());
    const r = new MeetingReminders(
      () => pending,
      async () => {},
      notify,
      () => true,
      () => event.startAt - 5 * 60000,
    );
    const tick = r.tick([event], 5);
    r.close();
    release(false);
    await tick;
    expect(notify).not.toHaveBeenCalled();
  });
  it("persists receipts before notification and suppresses restart duplicates", async () => {
    const event = parseCalendarEvent(fixture(), calendar, "subject", 1)!,
      now = event.startAt - 5 * 60000,
      receipts = new Set<string>(),
      notify = vi.fn(() => vi.fn()),
      remember = vi.fn(async (key: string) => {
        receipts.add(key);
      });
    const build = () =>
      new MeetingReminders(
        async (key) => receipts.has(key),
        remember,
        notify,
        () => true,
        () => now,
      );
    let reminders = build();
    await reminders.tick([event], 5);
    expect(receipts.has(reminderKey(event, 5))).toBe(true);
    expect(remember.mock.invocationCallOrder[0]).toBeLessThan(
      notify.mock.invocationCallOrder[0]!,
    );
    await reminders.tick([event], 5);
    reminders.close();
    reminders = build();
    await reminders.tick([event], 5);
    expect(notify).toHaveBeenCalledTimes(1);
    reminders.close();
  });
  it("cancels notifications on deletion/reschedule and never fires all-day or disabled reminders", async () => {
    const event = parseCalendarEvent(fixture(), calendar, "subject", 1)!,
      now = event.startAt - 5 * 60000,
      close = vi.fn(),
      notify = vi.fn(() => close),
      reminders = new MeetingReminders(
        async () => false,
        async () => {},
        notify,
        () => true,
        () => now,
      );
    await reminders.tick([event], 0);
    expect(notify).not.toHaveBeenCalled();
    await reminders.tick([{ ...event, allDay: true }], 5);
    expect(notify).not.toHaveBeenCalled();
    await reminders.tick([event], 5);
    await reminders.tick([], 5);
    expect(close).toHaveBeenCalled();
    reminders.close();
  });
  it("does not revive missed or past notifications, nor deliver after scope cancellation", async () => {
    const event = parseCalendarEvent(fixture(), calendar, "subject", 1)!,
      notify = vi.fn(() => vi.fn()),
      r = new MeetingReminders(
        async () => false,
        async () => {},
        notify,
        () => false,
        () => event.startAt - 5 * 60000,
      );
    await r.tick([event], 5);
    expect(notify).not.toHaveBeenCalled();
    const missed = new MeetingReminders(
      async () => false,
      async () => {},
      notify,
      () => true,
      () => event.startAt - 60000,
    );
    await missed.tick([event], 30);
    expect(notify).not.toHaveBeenCalled();
  });
});
