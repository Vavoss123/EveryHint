import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadModel,
  verifyModel,
} from "../src/main/transcription/model-files";
import { SpeechInstallation } from "../src/main/transcription/models";
vi.mock("../resources/speech-models.json", () => ({
  default: {
    "tiny.en": {
      filename: "tiny.bin",
      bytes: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      url: "https://example.invalid/model",
    },
    "base.en": {
      filename: "base.bin",
      bytes: 3,
      sha256: "same",
      url: "https://example.invalid/base",
    },
  },
}));
describe("explicit verified model installation", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "everyhint-model-"));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });
  it("never downloads at construction/inspection, reports missing runtime and models", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const installation = new SpeechInstallation(directory, vi.fn());
    await installation.inspect();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      installation.models.every((model) => model.state === "missing"),
    ).toBe(true);
    await expect(installation.ensureReady("tiny.en")).rejects.toThrow("helper");
  });
  it("streams a user-requested model and verifies its pinned checksum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("abc")),
    );
    await downloadModel(directory, "tiny.en");
    expect(await verifyModel(directory, "tiny.en")).toBe(true);
    await writeFile(join(directory, "tiny.bin"), "bad");
    expect(await verifyModel(directory, "tiny.en")).toBe(false);
  });
  it.each(["bad", "oversized"])(
    "rejects %s downloads and removes incomplete files",
    async (content) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(content)),
      );
      await expect(downloadModel(directory, "tiny.en")).rejects.toThrow();
      await expect(
        readFile(join(directory, "tiny.bin.part")),
      ).rejects.toThrow();
    },
  );
  it("handles aborted downloads and restores defaults for invalid persisted settings", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("abc")),
    );
    await expect(
      downloadModel(directory, "tiny.en", vi.fn(), controller.signal),
    ).rejects.toThrow();
    await writeFile(join(directory, "settings.json"), "{broken");
    const installation = new SpeechInstallation(directory, vi.fn());
    expect(installation.settings.model).toBe("tiny.en");
    expect(installation.settingsError).toBeTruthy();
  });
});
