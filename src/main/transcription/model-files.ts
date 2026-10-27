import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { once } from "node:events";
import manifest from "../../../resources/speech-models.json" with { type: "json" };
import type { SpeechModel } from "../../shared/transcription";
export { manifest as SPEECH_MODELS };
export async function verifyModel(
  directory: string,
  model: SpeechModel,
): Promise<boolean> {
  const definition = manifest[model];
  try {
    const path = join(directory, definition.filename);
    if ((await stat(path)).size !== definition.bytes) return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path))
      hash.update(chunk as Buffer);
    return hash.digest("hex") === definition.sha256;
  } catch {
    return false;
  }
}
export async function downloadModel(
  directory: string,
  model: SpeechModel,
  progress: (fraction: number) => void = () => {},
  signal?: AbortSignal,
): Promise<void> {
  const definition = manifest[model];
  if (!definition) throw new Error("Unknown Whisper model.");
  await mkdir(directory, { recursive: true });
  const destination = join(directory, definition.filename),
    temporary = `${destination}.part`;
  const output = createWriteStream(temporary, { flags: "w", mode: 0o600 });
  const hash = createHash("sha256");
  let bytes = 0;
  let writeError: Error | undefined;
  output.on("error", (error) => {
    writeError = error;
  });
  try {
    const response = await fetch(definition.url, { signal });
    if (!response.ok || !response.body)
      throw new Error(`Model download failed (${response.status}).`);
    for await (const data of response.body) {
      signal?.throwIfAborted();
      if (writeError) throw writeError;
      bytes += data.byteLength;
      if (bytes > definition.bytes)
        throw new Error("Model download exceeded its expected size.");
      hash.update(data);
      if (!output.write(data)) await once(output, "drain");
      progress(bytes / definition.bytes);
    }
    output.end();
    await once(output, "finish");
    if (bytes !== definition.bytes || hash.digest("hex") !== definition.sha256)
      throw new Error("Whisper model checksum mismatch.");
    await rename(temporary, destination);
    progress(1);
  } catch (error) {
    output.destroy();
    if (!output.closed)
      await new Promise<void>((resolve) => output.once("close", resolve));
    await rm(temporary, { force: true });
    throw error;
  }
}
