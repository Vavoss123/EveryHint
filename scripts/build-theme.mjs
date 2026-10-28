import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const tokens = JSON.parse(
  await readFile(resolve(root, "resources/design-tokens.json"), "utf8"),
);
const declarations = (values, prefix) =>
  Object.entries(values)
    .map(([key, value]) => `  --${prefix}${key}: ${value};`)
    .join("\n");
const light = declarations(tokens.light, "color-");
const dark = declarations(tokens.dark, "color-");
const css = `/* Generated from resources/design-tokens.json by npm run theme:build. */\n:root {\n${light}\n${declarations(tokens.shared, "")}\n  color-scheme: light;\n}\n:root[data-theme="dark"] {\n${dark}\n  color-scheme: dark;\n}\n@media (prefers-color-scheme: dark) {\n  :root[data-theme="system"] {\n${dark}\n    color-scheme: dark;\n  }\n}\n`;
const target = resolve(root, "src/renderer/src/theme/tokens.css");
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== css)
    throw new Error(
      "Theme CSS differs from its token source. Run npm run theme:build.",
    );
} else await writeFile(target, css);
