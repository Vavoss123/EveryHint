import { join } from "node:path";
import { downloadModel } from "../src/main/transcription/model-files.ts";
import { speechHome } from "./speech-home.mjs";
const model = process.argv[2] ?? "tiny.en";
if (!["tiny.en", "base.en"].includes(model))
  throw new Error("Choose tiny.en or base.en.");
const root = speechHome();
await downloadModel(join(root, "models"), model);
console.log(`Verified ${model} installed in ${root}`);
