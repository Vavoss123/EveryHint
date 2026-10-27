import { randomUUID } from "node:crypto";
import type { AudioSourceId, SessionSnapshot } from "../../shared/contracts";
import type {
  RecognitionJob,
  TranscriptionSnapshot,
} from "../../shared/transcription";
import { parseAudioFrame } from "../../shared/transcription";
import { SpeechInstallation } from "./models";
import { PCMConverter } from "./pcm";
import { SpeechSegmenter } from "./segmenter";
import { TranscriptStore, removeOverlap } from "./transcripts";
import { WhisperWorker, type InferenceWorker } from "./worker";

const sourceIds: AudioSourceId[] = ["microphone", "systemAudio"];
export class TranscriptionController {
  private state: TranscriptionSnapshot["state"] = "OFF";
  private error: string | null = null;
  private revision = 0;
  private generation = 0;
  private token: string | null = null;
  private session: SessionSnapshot | undefined;
  private transcriptSession: string | null = null;
  private worker: InferenceWorker | undefined;
  private busy = false;
  private nextSource: AudioSourceId = "microphone";
  private queues: Record<AudioSourceId, RecognitionJob[]> = {
    microphone: [],
    systemAudio: [],
  };
  private converters: Record<AudioSourceId, PCMConverter> = {
    microphone: new PCMConverter(),
    systemAudio: new PCMConverter(),
  };
  private segmenters: Partial<Record<AudioSourceId, SpeechSegmenter>> = {};
  private store: TranscriptStore;
  private diagnostics: TranscriptionSnapshot["diagnostics"] = {
    loadMs: 0,
    averageLatencyMs: 0,
    queueLength: 0,
    droppedJobs: 0,
    gaps: 0,
    completedJobs: 0,
    workerCpuPercent: null,
    workerMemoryBytes: null,
  };
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    readonly installation: SpeechInstallation,
    private readonly changed: (snapshot: TranscriptionSnapshot) => void,
    private readonly transport: (token: string | null) => void,
    private readonly createWorker: () => InferenceWorker = () =>
      new WhisperWorker(installation.executable),
  ) {
    this.store = new TranscriptStore(installation.settings);
    this.error = installation.settingsError;
  }
  get value(): TranscriptionSnapshot {
    return {
      revision: this.revision,
      state: this.state,
      error: this.error,
      settings: { ...this.installation.settings },
      runtimeInstalled: this.installation.runtimeInstalled,
      models: this.installation.models.map((model) => ({ ...model })),
      events: this.store.value,
      diagnostics: {
        ...this.diagnostics,
        queueLength:
          this.queues.microphone.length + this.queues.systemAudio.length,
      },
    };
  }
  publish(): void {
    this.revision++;
    const value = this.value;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    if (value.events.length)
      this.expiryTimer = setTimeout(
        () => this.publish(),
        Math.max(
          1,
          Math.min(...value.events.map((event) => event.endMs)) +
            this.installation.settings.retentionMinutes * 60000 -
            Date.now() +
            1,
        ),
      );
    this.changed(value);
  }
  captureChanged(session: SessionSnapshot): void {
    const previous = this.session;
    this.session = session;
    if (session.sessionId && session.sessionId !== this.transcriptSession) {
      this.cancel("OFF");
      this.store.clear();
      this.transcriptSession = session.sessionId;
      this.publish();
    }
    if (
      previous &&
      (session.epoch !== previous.epoch || session.state !== "ACTIVE") &&
      (this.state === "LOADING" || this.state === "LISTENING")
    ) {
      this.cancel("PAUSED");
      this.publish();
    }
  }
  async enable(): Promise<void> {
    const session = this.session;
    if (
      !session ||
      session.state !== "ACTIVE" ||
      !session.sessionId ||
      !session.consent?.acknowledged ||
      !sourceIds.some(
        (source) =>
          session.consent?.[source] &&
          session.sources[source].state === "CAPTURING",
      )
    )
      throw new Error(
        "Start an authorised microphone or system-audio capture before enabling transcription.",
      );
    if (this.state === "LISTENING" || this.state === "LOADING")
      throw new Error("Transcription is already enabled.");
    this.cancel("LOADING");
    this.error = null;
    const generation = this.generation,
      epoch = session.epoch;
    this.publish();
    try {
      const model = await this.installation.ensureReady(
        this.installation.settings.model,
      );
      if (generation !== this.generation || this.session?.epoch !== epoch)
        return;
      const worker = this.createWorker();
      this.worker = worker;
      const ready = await worker.start(model, (message) => {
        if (generation === this.generation) this.fail(message);
      });
      if (generation !== this.generation || this.session?.epoch !== epoch) {
        worker.stop();
        return;
      }
      this.diagnostics.loadMs = ready.loadMs;
      this.diagnostics.workerMemoryBytes = ready.memoryBytes || null;
      for (const source of sourceIds)
        if (session.consent[source])
          this.segmenters[source] = new SpeechSegmenter(
            source,
            { ...this.installation.settings },
            (job) => this.enqueue(job),
            (id) => this.store.removePartial(id),
          );
      this.token = randomUUID();
      this.state = "LISTENING";
      this.transport(this.token);
      this.publish();
    } catch (error) {
      if (generation === this.generation) {
        this.fail(
          error instanceof Error
            ? error.message
            : "Transcription startup failed.",
        );
        throw error;
      }
    }
  }
  accept(token: string, input: unknown): boolean {
    if (
      !this.token ||
      token !== this.token ||
      this.state !== "LISTENING" ||
      this.session?.state !== "ACTIVE"
    )
      return false;
    try {
      const frame = parseAudioFrame(input);
      if (!this.session.consent?.[frame.source])
        throw new Error("Audio source was not authorised for transcription.");
      const segmenter = this.segmenters[frame.source];
      if (!segmenter) throw new Error("Transcription source is unavailable.");
      if (frame.lifecycle !== "data") {
        this.converters[frame.source].reset();
        segmenter.gap();
        return true;
      }
      const converted = this.converters[frame.source].accept(frame);
      if (converted.discontinuity) {
        this.diagnostics.gaps++;
        segmenter.gap();
      }
      segmenter.accept(converted.samples, converted.timestamp);
      return true;
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : "Invalid transcription audio.",
      );
      return false;
    }
  }
  pause(): void {
    this.cancel("PAUSED");
    this.publish();
  }
  clear(): void {
    this.cancel(this.state === "OFF" ? "OFF" : "PAUSED");
    this.store.clear();
    this.publish();
  }
  configure(input: unknown): void {
    this.installation.save(input);
    this.cancel("PAUSED");
    this.store.configure(this.installation.settings);
    this.publish();
  }
  private cancel(state: TranscriptionSnapshot["state"]): void {
    ++this.generation;
    this.token = null;
    this.transport(null);
    this.worker?.stop();
    this.worker = undefined;
    this.busy = false;
    this.queues = { microphone: [], systemAudio: [] };
    for (const source of sourceIds) {
      this.converters[source].reset();
      this.segmenters[source]?.reset();
    }
    this.segmenters = {};
    this.store.removePartial();
    this.state = state;
  }
  private fail(message: string): void {
    this.cancel("ERROR");
    this.error = message;
    this.publish();
  }
  private enqueue(job: RecognitionJob): void {
    const queue = this.queues[job.source];
    for (let index = queue.length - 1; index >= 0; index--)
      if (queue[index]!.id === job.id && !queue[index]!.final)
        queue.splice(index, 1);
    if (
      !job.final &&
      queue.some((queued) => queued.id === job.id && queued.final)
    )
      return;
    queue.push(job);
    while (queue.length > 2) {
      const index = queue.findIndex((queued) => !queued.final);
      const dropped = queue.splice(index < 0 ? 0 : index, 1)[0]!;
      this.diagnostics.droppedJobs++;
      this.store.removePartial(dropped.id);
    }
    this.publish();
    void this.pump();
  }
  private async pump(): Promise<void> {
    if (this.busy || !this.worker || this.state !== "LISTENING") return;
    const source = this.queues[this.nextSource].length
      ? this.nextSource
      : this.nextSource === "microphone"
        ? "systemAudio"
        : "microphone";
    const job = this.queues[source].shift();
    if (!job) return;
    this.nextSource = source === "microphone" ? "systemAudio" : "microphone";
    this.busy = true;
    const generation = this.generation,
      worker = this.worker,
      sessionId = this.session!.sessionId!;
    try {
      const padded =
        job.samples.length < 16000 ? new Float32Array(16000) : job.samples;
      if (padded !== job.samples) padded.set(job.samples);
      const result = await worker.infer(padded);
      if (generation !== this.generation || worker !== this.worker) return;
      let text = result.text.trim();
      if (job.overlapMs) {
        const previous = this.store.previousFinal(source, job.startMs);
        if (previous) text = removeOverlap(previous.text, text);
      }
      this.store.upsert({
        id: job.id,
        sessionId,
        source,
        startMs: job.startMs,
        endMs: job.endMs,
        text,
        state: job.final ? "final" : "partial",
        model: this.installation.settings.model,
      });
      const count = ++this.diagnostics.completedJobs;
      this.diagnostics.averageLatencyMs +=
        (result.latencyMs - this.diagnostics.averageLatencyMs) / count;
      this.diagnostics.workerCpuPercent = result.cpuPercent;
      this.diagnostics.workerMemoryBytes = result.memoryBytes || null;
      this.publish();
    } catch (error) {
      if (generation === this.generation)
        this.fail(
          error instanceof Error
            ? error.message
            : "Whisper recognition failed.",
        );
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        void this.pump();
      }
    }
  }
  dispose(): void {
    this.cancel("OFF");
    this.store.clear();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.installation.dispose();
  }
}
