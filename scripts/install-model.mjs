import { join } from "node:path";
import { downloadModel } from "../src/main/transcription/model-files.ts";
const model = process.argv[2] ?? "tiny.en";
if (!["tiny.en", "base.en"].includes(model))
  throw new Error("Choose tiny.en or base.en.");
const root =
  process.env.EVERYHINT_SPEECH_HOME ??
  join(process.env.LOCALAPPDATA, "EveryHint", "speech");
await downloadModel(join(root, "models"), model);
console.log(`Verified ${model} installed in ${root}`);
