import { AsyncEntry } from "@napi-rs/keyring";
import { createHash, randomUUID } from "node:crypto";

export interface SecretEntry {
  getSecret(): Promise<number[] | null>;
  setSecret(value: Uint8Array): Promise<void>;
  deleteCredential(): Promise<boolean>;
}
export interface CredentialVault {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
interface Manifest {
  version: 1;
  generation: string;
  count: number;
  size: number;
  hash: string;
}
const chunkBytes = 2000; // Below Windows Credential Manager's 2,560-byte per-entry limit.
const maxBytes = 128 * 1024;
function manifest(value: number[] | null): Manifest | null {
  if (!value) return null;
  const data = JSON.parse(Buffer.from(value).toString("utf8")) as Manifest;
  if (
    data.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(data.generation) ||
    !Number.isInteger(data.count) ||
    data.count < 1 ||
    data.count > Math.ceil(maxBytes / chunkBytes) ||
    !Number.isInteger(data.size) ||
    data.size < 1 ||
    data.size > maxBytes ||
    !/^[a-f0-9]{64}$/.test(data.hash)
  )
    throw new Error("Invalid credential manifest.");
  return data;
}
export class KeyringVault implements CredentialVault {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly entry: (slot: string) => SecretEntry) {}
  static forInstallation(home: string): KeyringVault {
    const owner = createHash("sha256").update(home).digest("hex");
    return new KeyringVault(
      (slot) => new AsyncEntry("EveryHint.ChatGPTPlan.v1", `${owner}/${slot}`),
    );
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action, action);
    this.queue = next.catch(() => {});
    return next;
  }
  read(): Promise<string | null> {
    return this.serial(async () => {
      try {
        const info = manifest(await this.entry("manifest").getSecret());
        if (!info) return null;
        const chunks: Buffer[] = [];
        for (let index = 0; index < info.count; index++) {
          const bytes = await this.entry(
            `${info.generation}/${index}`,
          ).getSecret();
          if (!bytes || bytes.length > chunkBytes)
            throw new Error("Missing credential chunk.");
          chunks.push(Buffer.from(bytes));
        }
        const content = Buffer.concat(chunks);
        if (
          content.length !== info.size ||
          createHash("sha256").update(content).digest("hex") !== info.hash
        )
          throw new Error("Invalid credential record.");
        return content.toString("utf8");
      } catch {
        throw new Error(
          "Could not read the operating-system credential store. No plaintext fallback is used.",
        );
      }
    });
  }
  write(value: string): Promise<void> {
    return this.serial(async () => {
      const bytes = Buffer.from(value, "utf8");
      if (bytes.length < 1 || bytes.length > maxBytes)
        throw new Error("Credential record exceeds its size limit.");
      let previous: Manifest | null;
      const next: Manifest = {
        version: 1,
        generation: randomUUID(),
        count: Math.ceil(bytes.length / chunkBytes),
        size: bytes.length,
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
      try {
        previous = manifest(await this.entry("manifest").getSecret());
        for (let index = 0; index < next.count; index++)
          await this.entry(`${next.generation}/${index}`).setSecret(
            bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes),
          );
        // A single native entry update commits the entire rotating token set.
        await this.entry("manifest").setSecret(
          Buffer.from(JSON.stringify(next)),
        );
      } catch {
        await this.removeChunks(next);
        throw new Error(
          "Could not save the operating-system credential record. No plaintext fallback is used.",
        );
      }
      if (previous) await this.removeChunks(previous);
    });
  }
  private async removeChunks(info: Manifest): Promise<void> {
    for (let index = 0; index < info.count; index++)
      await this.entry(`${info.generation}/${index}`)
        .deleteCredential()
        .catch(() => false);
  }
  clear(): Promise<void> {
    return this.serial(async () => {
      try {
        const previous = manifest(await this.entry("manifest").getSecret());
        await this.entry("manifest").deleteCredential();
        if (previous) await this.removeChunks(previous);
      } catch {
        throw new Error(
          "Could not clear the operating-system credential store.",
        );
      }
    });
  }
}
