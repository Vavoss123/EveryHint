import type {
  CaptureSource,
  SessionAction,
  SessionSnapshot,
} from "../shared/contracts";
import {
  errorMessage,
  exactKeys,
  parseConsent,
  parseSourceId,
  record,
} from "../shared/validation";
import { ScreenCaptureService, type ScreenCaptureBackend } from "./capture";

export class CaptureSessionController {
  private snapshot: SessionSnapshot = {
    state: "IDLE",
    consent: null,
    source: null,
    frame: null,
    frameCount: 0,
    error: null,
  };
  private sources = new Map<string, CaptureSource>();
  private generation = 0;
  private readonly capture: ScreenCaptureService;

  constructor(
    private readonly backend: ScreenCaptureBackend,
    private readonly interval: () => number,
    private readonly changed: () => void,
  ) {
    this.capture = new ScreenCaptureService(backend);
  }
  get value(): SessionSnapshot {
    return structuredClone(this.snapshot);
  }

  async listSources(input: unknown): Promise<CaptureSource[]> {
    parseConsent(input);
    if (["ACTIVE", "PAUSED"].includes(this.snapshot.state))
      throw new Error("Stop the current session before choosing a new source.");
    const generation = ++this.generation;
    this.sources.clear();
    try {
      const sources = await this.backend.listSources();
      if (generation !== this.generation)
        throw new Error("Source selection was cancelled. Choose again.");
      this.sources = new Map(sources.map((source) => [source.id, source]));
      return sources;
    } catch (error) {
      if (generation === this.generation) this.fail(errorMessage(error));
      throw error;
    }
  }

  prepare(input: unknown): void {
    if (!["IDLE", "READY", "STOPPED", "ERROR"].includes(this.snapshot.state))
      throw new Error("Stop the current session before preparing another.");
    const request = record(input);
    exactKeys(request, ["sourceId", "consent"]);
    const consent = parseConsent(request.consent);
    const source = this.sources.get(parseSourceId(request.sourceId));
    if (!source)
      throw new Error("Choose an available source before preparing capture.");
    this.capture.stop();
    this.snapshot = {
      state: "READY",
      consent,
      source: { ...source },
      frame: null,
      frameCount: 0,
      error: null,
    };
    this.changed();
  }

  action(action: SessionAction): void {
    if (action === "stop") {
      this.stop();
      return;
    }
    if (action === "start" && this.snapshot.state === "READY") {
      this.activate();
      return;
    }
    if (action === "resume" && this.snapshot.state === "PAUSED") {
      this.activate();
      return;
    }
    if (action === "pause" && this.snapshot.state === "ACTIVE") {
      this.capture.stop();
      this.snapshot.frame = null;
      this.snapshot.state = "PAUSED";
      this.changed();
      return;
    }
    throw new Error(`Cannot ${action} a session in ${this.snapshot.state}.`);
  }

  togglePause(): void {
    if (this.snapshot.state === "ACTIVE") this.action("pause");
    else if (this.snapshot.state === "PAUSED") this.action("resume");
  }

  stop(): void {
    ++this.generation;
    this.capture.stop();
    this.sources.clear();
    this.snapshot = {
      state: "STOPPED",
      consent: null,
      source: null,
      frame: null,
      frameCount: 0,
      error: null,
    };
    this.changed();
  }

  fail(message: string): void {
    ++this.generation;
    this.capture.stop();
    this.sources.clear();
    this.snapshot = {
      state: "ERROR",
      consent: null,
      source: null,
      frame: null,
      frameCount: 0,
      error: message,
    };
    this.changed();
  }

  private activate(): void {
    if (!this.snapshot.consent || !this.snapshot.source)
      throw new Error("Session consent and a source are required.");
    parseConsent(this.snapshot.consent);
    this.snapshot.state = "ACTIVE";
    this.snapshot.frame = null;
    this.changed();
    this.capture.start(
      this.snapshot.source,
      this.interval(),
      (frame) => {
        this.snapshot.frame = frame;
        this.snapshot.frameCount++;
        this.changed();
      },
      (message) => {
        this.fail(message);
      },
    );
  }
}
