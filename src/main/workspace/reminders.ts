import type { CalendarEvent } from "../../shared/workspace";
export function reminderKey(event: CalendarEvent, minutes: number): string {
  return `${event.id}_${event.startAt}_${minutes}`;
}
export class MeetingReminders {
  private active = new Map<string, () => void>();
  private running = false;
  private generation = 0;
  constructor(
    private delivered: (key: string) => Promise<boolean>,
    private remember: (key: string, expiresAt: number) => Promise<void>,
    private notify: (event: CalendarEvent) => () => void,
    private valid: () => boolean,
    private now: () => number = Date.now,
  ) {}
  async tick(events: CalendarEvent[], minutes: number): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = this.generation,
      valid = () => this.valid() && generation === this.generation;
    try {
      const ids = new Set(
        events
          .filter((e) => !e.allDay && e.startAt > this.now())
          .map((e) => reminderKey(e, minutes)),
      );
      for (const [key, close] of this.active)
        if (!minutes || !ids.has(key)) {
          close();
          this.active.delete(key);
        }
      if (!minutes || !valid()) return;
      for (const event of events) {
        const key = reminderKey(event, minutes),
          due = event.startAt - minutes * 60000;
        if (
          event.allDay ||
          this.now() < due ||
          this.now() - due > 120000 ||
          event.startAt <= this.now() ||
          this.active.has(key)
        )
          continue;
        if ((await this.delivered(key)) || !valid()) continue;
        // Persist first: after a crash we prefer a potentially missed toast to
        // duplicate delivery. Only click-to-view is wired; never capture/join.
        await this.remember(key, event.endAt + 86400000);
        if (!valid()) return;
        this.active.set(key, this.notify(event));
      }
    } finally {
      this.running = false;
    }
  }
  close(): void {
    this.generation++;
    for (const close of this.active.values()) close();
    this.active.clear();
  }
}
