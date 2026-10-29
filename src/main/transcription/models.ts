import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ModelStatus,
  SpeechModel,
  TranscriptionSettings,
} from "../../shared/transcription";
import {
  DEFAULT_TRANSCRIPTION_SETTINGS,
  parseTranscriptionSettings,
} from "../../shared/transcription";
import { downloadModel, SPEECH_MODELS, verifyModel } from "./model-files";
import { verifyRuntime, type BundledRuntime } from "./runtime-integrity";
export class SpeechInstallation {
  settings: TranscriptionSettings = { ...DEFAULT_TRANSCRIPTION_SETTINGS };
  settingsError: string | null = null;
  readonly models: ModelStatus[] = (["tiny.en", "base.en"] as const).map(
    (id) => ({
      id,
      bytes: SPEECH_MODELS[id].bytes,
      state: "missing",
      progress: 0,
      error: null,
    }),
  );
  private download: AbortController | undefined;
  constructor(
    readonly root: string,
    private readonly changed: () => void,
    private readonly bundled?: BundledRuntime,
  ) {
    mkdirSync(root, { recursive: true });
    if (existsSync(join(root, "settings.json"))) {
      try {
        this.settings = parseTranscriptionSettings(
          JSON.parse(
            readFileSync(join(root, "settings.json"), "utf8"),
          ) as unknown,
        );
      } catch {
        this.settingsError =
          "Speech settings were invalid; safe defaults have been restored.";
      }
    }
  }
  get executable(): string {
    return join(
      this.bundled?.directory ?? join(this.root, "runtime"),
      process.platform === "win32"
        ? "everyhint-transcriber.exe"
        : "everyhint-transcriber",
    );
  }
  get runtimeInstalled(): boolean {
    return this.bundled
      ? verifyRuntime(this.executable, this.bundled.manifestPath)
      : existsSync(this.executable);
  }
  modelPath(model: SpeechModel): string {
    return join(this.root, "models", SPEECH_MODELS[model].filename);
  }
  save(input: unknown): void {
    const settings = parseTranscriptionSettings(input),
      temporary = join(this.root, "settings.json.tmp");
    writeFileSync(temporary, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });
    renameSync(temporary, join(this.root, "settings.json"));
    this.settings = settings;
  }
  async inspect(): Promise<void> {
    for (const model of this.models) {
      if (model.state === "downloading") continue;
      model.state = "verifying";
      this.changed();
      const present = existsSync(this.modelPath(model.id)),
        valid =
          present && (await verifyModel(join(this.root, "models"), model.id));
      model.state = valid ? "installed" : present ? "invalid" : "missing";
      model.error =
        present && !valid ? "Checksum failed. Reinstall this model." : null;
      this.changed();
    }
  }
  async ensureReady(model: SpeechModel): Promise<string> {
    if (!this.runtimeInstalled)
      throw new Error(
        this.bundled
          ? "The packaged Whisper helper is missing or failed its integrity check. Reinstall EveryHint from a trusted build."
          : "Build the local Whisper helper first: npm run speech:build.",
      );
    if (!(await verifyModel(join(this.root, "models"), model)))
      throw new Error(
        "Whisper model is missing or invalid. Install it in settings.",
      );
    return this.modelPath(model);
  }
  async install(value: unknown): Promise<void> {
    if (value !== "tiny.en" && value !== "base.en")
      throw new Error("Unknown speech model.");
    if (this.download) throw new Error("A model download is already running.");
    const controller = new AbortController();
    this.download = controller;
    const status = this.models.find((model) => model.id === value)!;
    status.state = "downloading";
    status.error = null;
    status.progress = 0;
    this.changed();
    let reported = 0;
    try {
      await downloadModel(
        join(this.root, "models"),
        value,
        (fraction) => {
          status.progress = fraction;
          if (fraction - reported >= 0.02 || fraction === 1) {
            reported = fraction;
            this.changed();
          }
        },
        controller.signal,
      );
      status.state = "installed";
    } catch (error) {
      status.state = "invalid";
      status.error =
        error instanceof Error ? error.message : "Model installation failed.";
      throw error;
    } finally {
      this.download = undefined;
      this.changed();
    }
  }
  dispose(): void {
    this.download?.abort();
  }
}
