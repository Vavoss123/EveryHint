import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import { verifyRuntime } from "../src/main/transcription/runtime-integrity";
it("accepts only the manifest-bound helper and rejects tampering, wrong arch and malformed metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "everyhint-integrity-"));
  try {
    const exe = join(root, "helper.exe"),
      manifest = join(root, "manifest.json"),
      bytes = Buffer.from("controlled native fixture");
    const value = {
      schema: 1,
      arch: process.arch,
      revision: "d1be6fde11ac6e0407606b4e42fe72d34add8037",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    writeFileSync(exe, bytes);
    writeFileSync(manifest, JSON.stringify(value));
    expect(verifyRuntime(exe, manifest)).toBe(true);
    expect(verifyRuntime(exe, manifest, "other")).toBe(false);
    writeFileSync(exe, Buffer.from("controlled native changed"));
    expect(verifyRuntime(exe, manifest)).toBe(false);
    writeFileSync(manifest, "{}");
    expect(verifyRuntime(exe, manifest)).toBe(false);
    expect(verifyRuntime(exe, join(root, "missing"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("binds a newly packaged helper to its operating system as well as architecture", () => {
  const root = mkdtempSync(join(tmpdir(), "everyhint-platform-integrity-"));
  try {
    const exe = join(root, "helper"),
      manifest = join(root, "manifest.json"),
      bytes = Buffer.from("controlled native fixture");
    writeFileSync(exe, bytes);
    writeFileSync(
      manifest,
      JSON.stringify({
        schema: 1,
        platform: "darwin",
        arch: "arm64",
        revision: "d1be6fde11ac6e0407606b4e42fe72d34add8037",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    );
    expect(verifyRuntime(exe, manifest, "arm64", "darwin")).toBe(true);
    expect(verifyRuntime(exe, manifest, "arm64", "linux")).toBe(false);
    expect(verifyRuntime(exe, manifest, "x64", "darwin")).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
