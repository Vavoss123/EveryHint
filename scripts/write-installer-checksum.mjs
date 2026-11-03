import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const file = `release/EveryHint-Setup-${version}.exe`;
const hash = createHash("sha256");
for await (const chunk of createReadStream(file)) hash.update(chunk);
const line = `${hash.digest("hex")}  ${basename(file)}\n`;
await writeFile(`${file}.sha256`, line);
console.log(line.trim());
