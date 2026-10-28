import { describe, expect, it } from "vitest";
import { KeyringVault, type SecretEntry } from "../src/main/ai/plan/vault";
function setup() {
  const data = new Map<string, number[]>();
  let fail = false;
  const entry = (slot: string): SecretEntry => ({
    getSecret: async () => data.get(slot) ?? null,
    setSecret: async (value) => {
      if (slot === "manifest" && fail) {
        fail = false;
        throw new Error("fixture");
      }
      data.set(slot, [...value]);
    },
    deleteCredential: async () => data.delete(slot),
  });
  return {
    data,
    vault: new KeyringVault(entry),
    failCommit: () => (fail = true),
  };
}
describe("OS credential vault", () => {
  it("chunks UTF-8 secrets below Windows limits and round-trips without files", async () => {
    const s = setup(),
      secret = JSON.stringify({ fixture: "🦊".repeat(4000) });
    expect(await s.vault.read()).toBeNull();
    await s.vault.write(secret);
    expect(await s.vault.read()).toBe(secret);
    expect([...s.data.values()].every((bytes) => bytes.length <= 2000)).toBe(
      true,
    );
  });
  it("commits rotating token sets atomically and cleans up previous chunks", async () => {
    const s = setup();
    await s.vault.write("old synthetic credentials");
    const previous = [...s.data.keys()].filter((key) => key !== "manifest");
    await s.vault.write("new synthetic credentials");
    expect(await s.vault.read()).toBe("new synthetic credentials");
    expect(previous.every((key) => !s.data.has(key))).toBe(true);
    await s.vault.clear();
    expect(await s.vault.read()).toBeNull();
    expect(s.data.size).toBe(0);
  });
  it("retains the last committed credentials on write failure, with no plaintext fallback", async () => {
    const s = setup();
    await s.vault.write("old");
    s.failCommit();
    await expect(s.vault.write("new")).rejects.toThrow("No plaintext fallback");
    expect(await s.vault.read()).toBe("old");
    expect(s.data.size).toBe(2);
  });
  it("rejects corrupt, missing and oversized secret records", async () => {
    const s = setup();
    await expect(s.vault.write("x".repeat(128 * 1024 + 1))).rejects.toThrow(
      "size limit",
    );
    await s.vault.write("fixture");
    s.data.delete([...s.data.keys()].find((key) => key !== "manifest")!);
    await expect(s.vault.read()).rejects.toThrow("credential store");
  });
  it("serializes concurrent writes so refresh cannot mix secret generations", async () => {
    const s = setup();
    await Promise.all([
      s.vault.write("first"),
      s.vault.write("second"),
      s.vault.write("third"),
    ]);
    expect(await s.vault.read()).toBe("third");
    expect(s.data.size).toBe(2);
  });
});
