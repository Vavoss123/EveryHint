import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export const FIXTURE_SHA256 =
  "59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e";
export async function loadSpeechFixture(root, install = false) {
  const path = join(root, "fixtures", "jfk.wav");
  let wav;
  try {
    wav = await readFile(path);
  } catch (error) {
    if (!install)
      throw new Error(
        "Speech fixture is missing. Run npm run speech:test -- --install-fixture first.",
        { cause: error },
      );
    if (error.code !== "ENOENT") throw error;
  }
  if (!wav) {
    const response = await fetch(
      "https://raw.githubusercontent.com/ggml-org/whisper.cpp/d1be6fde11ac6e0407606b4e42fe72d34add8037/samples/jfk.wav",
    );
    if (!response.ok)
      throw new Error(`Fixture download failed (${response.status}).`);
    wav = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(wav).digest("hex") !== FIXTURE_SHA256)
      throw new Error("Speech fixture checksum mismatch.");
    await mkdir(join(root, "fixtures"), { recursive: true });
    await writeFile(path, wav);
  }
  if (createHash("sha256").update(wav).digest("hex") !== FIXTURE_SHA256)
    throw new Error("Speech fixture checksum mismatch.");
  let offset = 12,
    pcm,
    sampleRate = 0,
    channels = 0;
  while (offset + 8 <= wav.length) {
    const kind = wav.toString("ascii", offset, offset + 4),
      length = wav.readUInt32LE(offset + 4);
    if (kind === "fmt ") {
      if (
        wav.readUInt16LE(offset + 8) !== 1 ||
        wav.readUInt16LE(offset + 22) !== 16
      )
        throw new Error("Fixture must be PCM16.");
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (kind === "data") pcm = wav.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  if (!pcm || sampleRate !== 16000 || channels !== 1)
    throw new Error("Unexpected fixture format.");
  const samples = new Float32Array(pcm.length / 2);
  for (let index = 0; index < samples.length; index++)
    samples[index] = pcm.readInt16LE(index * 2) / 32768;
  return { samples, sampleRate };
}
