import { open, unlink } from "node:fs/promises";
export async function exportBrief(
  choose: (name: string) => Promise<string | null>,
  name: string,
  text: string,
  valid: () => boolean,
): Promise<{ cancelled: boolean }> {
  if (!text.trim() || text.length > 64000)
    throw new Error("Choose a bounded reviewed brief to export.");
  const path = await choose(name);
  if (!path) return { cancelled: true };
  if (!valid()) throw new Error("Workspace changed during the export dialog.");
  const file = await open(path, "wx", 0o600);
  let complete = false;
  try {
    if (!valid()) throw new Error("Workspace changed before export.");
    await file.writeFile(text, "utf8");
    if (!valid()) throw new Error("Workspace changed during export.");
    complete = true;
    return { cancelled: false };
  } finally {
    await file.close();
    if (!complete)
      await unlink(path).catch(() => {
        throw new Error(
          "Export failed and its incomplete new plaintext file could not be removed.",
        );
      });
  }
}
