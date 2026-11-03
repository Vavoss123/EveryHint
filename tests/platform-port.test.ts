import { expect, it, vi } from "vitest";
import {
  systemAudioAvailable,
  screenCaptureAvailable,
} from "../src/main/platform";
import { nativeBinaryMatches } from "../src/main/transcription/runtime-binary";
const entry = vi.hoisted(() => vi.fn(class {}));
vi.mock("@napi-rs/keyring", () => ({ AsyncEntry: entry }));
import { credentialEntry } from "../src/main/credentials";

it.each([
  ["win32", "10.0", false, true],
  ["darwin", "23.1.0", false, false],
  ["darwin", "23.2.0", false, true],
  ["darwin", "24.0.0", false, true],
  ["linux", "6.8.0", false, false],
  ["linux", "6.8.0", true, true],
])(
  "gates system audio on %s/%s with native availability %s",
  (platform, kernel, pulse, expected) => {
    expect(
      systemAudioAvailable(String(platform), String(kernel), Boolean(pulse)),
    ).toBe(expected);
  },
);
it("keeps unsupported Wayland screen capture out of the source picker", () => {
  expect(screenCaptureAvailable("linux", { XDG_SESSION_TYPE: "wayland" })).toBe(
    false,
  );
  expect(
    screenCaptureAvailable("linux", { WAYLAND_DISPLAY: "wayland-0" }),
  ).toBe(false);
  expect(screenCaptureAvailable("linux", { XDG_SESSION_TYPE: "x11" })).toBe(
    true,
  );
  expect(screenCaptureAvailable("darwin", {})).toBe(true);
});
it("requires persistent Linux secrets rather than falling back to volatile encryption keys", () => {
  entry.mockClear();
  credentialEntry("service", "profile", "linux");
  expect(entry).toHaveBeenLastCalledWith("service", "profile", {
    linux: { store: "secret-service" },
  });
  credentialEntry("service", "profile", "darwin");
  expect(entry).toHaveBeenLastCalledWith("service", "profile", undefined);
  credentialEntry("service", "profile", "win32");
  expect(entry).toHaveBeenLastCalledWith("service", "profile", undefined);
});
it.each(["x64", "arm64"])(
  "recognises native PE, Mach-O and ELF architecture %s and rejects wrong targets",
  (arch) => {
    const bytes = Buffer.alloc(128);
    bytes.write("MZ");
    bytes.writeUInt32LE(64, 0x3c);
    bytes.writeUInt32LE(0x4550, 64);
    bytes.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 68);
    expect(nativeBinaryMatches(bytes, "win32", arch)).toBe(true);
    expect(nativeBinaryMatches(bytes, "darwin", arch)).toBe(false);
    expect(
      nativeBinaryMatches(bytes, "win32", arch === "x64" ? "arm64" : "x64"),
    ).toBe(false);
    bytes.fill(0);
    bytes.writeUInt32LE(0xfeedfacf);
    bytes.writeUInt32LE(arch === "x64" ? 0x1000007 : 0x100000c, 4);
    expect(nativeBinaryMatches(bytes, "darwin", arch)).toBe(true);
    expect(nativeBinaryMatches(bytes, "linux", arch)).toBe(false);
    bytes.fill(0);
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    bytes.writeUInt16LE(arch === "x64" ? 62 : 183, 18);
    expect(nativeBinaryMatches(bytes, "linux", arch)).toBe(true);
    expect(
      nativeBinaryMatches(bytes, "linux", arch === "x64" ? "arm64" : "x64"),
    ).toBe(false);
    expect(nativeBinaryMatches(Buffer.alloc(4), "linux", arch)).toBe(false);
  },
);
