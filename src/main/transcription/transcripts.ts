import type {
  TranscriptEvent,
  TranscriptionSettings,
} from "../../shared/transcription";
export function removeOverlap(previous: string, next: string): string {
  const before = previous.trim().split(/\s+/),
    after = next.trim().split(/\s+/);
  const normal = (word: string) =>
    word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (
    let size = Math.min(20, before.length, after.length);
    size >= 2;
    size--
  ) {
    if (
      before.slice(-size).map(normal).join(" ") ===
      after.slice(0, size).map(normal).join(" ")
    )
      return after.slice(size).join(" ");
  }
  return next.trim();
}
export class TranscriptStore {
  private events: TranscriptEvent[] = [];
  constructor(
    private settings: TranscriptionSettings,
    private readonly now: () => number = Date.now,
  ) {}
  get value(): TranscriptEvent[] {
    this.trim();
    return this.events.map((event) => ({ ...event }));
  }
  configure(settings: TranscriptionSettings): void {
    this.settings = settings;
    this.trim();
  }
  upsert(event: TranscriptEvent): void {
    const previous = this.events.find((item) => item.id === event.id);
    if (previous?.state === "final" && event.state !== "final") return;
    this.events = this.events.filter((item) => item.id !== event.id);
    if (event.text.trim())
      this.events.push({ ...event, text: event.text.trim().slice(0, 8000) });
    this.events.sort(
      (a, b) =>
        a.startMs - b.startMs ||
        a.source.localeCompare(b.source) ||
        a.id.localeCompare(b.id),
    );
    this.trim();
  }
  previousFinal(
    source: TranscriptEvent["source"],
    startMs: number,
  ): TranscriptEvent | undefined {
    return this.events
      .filter(
        (event) =>
          event.source === source &&
          event.state === "final" &&
          event.startMs < startMs,
      )
      .at(-1);
  }
  removePartial(id?: string): void {
    this.events = this.events.filter(
      (event) =>
        event.state === "final" || (id !== undefined && event.id !== id),
    );
  }
  clear(): void {
    this.events = [];
  }
  private trim(): void {
    const cutoff = this.now() - this.settings.retentionMinutes * 60000;
    this.events = this.events
      .filter((event) => event.endMs >= cutoff)
      .slice(-this.settings.maxEvents);
    let characters = this.events.reduce(
      (sum, event) => sum + event.text.length,
      0,
    );
    while (characters > 50000) characters -= this.events.shift()!.text.length;
  }
}
