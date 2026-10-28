import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportBrief } from "../src/main/workspace/export";
describe("P10 deliberate plaintext brief export", () => {
  it("writes only the reviewed text to a newly chosen file", async () => {
    const root = await mkdtemp(join(tmpdir(), "everyhint-p10-export-"));
    try {
      const path = join(root, "brief.txt");
      expect(
        await exportBrief(
          async () => path,
          "brief.txt",
          "Reviewed brief and exact references",
          () => true,
        ),
      ).toEqual({ cancelled: false });
      expect(await readFile(path, "utf8")).toBe(
        "Reviewed brief and exact references",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not overwrite an existing file", async () => {
    const root = await mkdtemp(join(tmpdir(), "everyhint-p10-export-"));
    try {
      const path = join(root, "existing.txt");
      await writeFile(path, "User content");
      await expect(
        exportBrief(
          async () => path,
          "brief.txt",
          "Brief",
          () => true,
        ),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("User content");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("cancels native selection and rejects source/profile changes during the dialog", async () => {
    expect(
      await exportBrief(
        async () => null,
        "brief.txt",
        "Brief",
        () => true,
      ),
    ).toEqual({ cancelled: true });
    await expect(
      exportBrief(
        async () => "never-created.txt",
        "brief.txt",
        "Brief",
        () => false,
      ),
    ).rejects.toThrow("changed");
  });
  it("removes its own new partial file if the profile changes during write", async () => {
    const root = await mkdtemp(join(tmpdir(), "everyhint-p10-export-"));
    try {
      let checks = 0;
      await expect(
        exportBrief(
          async () => join(root, "brief.txt"),
          "brief.txt",
          "Reviewed brief",
          () => ++checks < 3,
        ),
      ).rejects.toThrow("changed");
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
