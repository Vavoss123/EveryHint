import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class MeetingCipher {
  private key: Buffer;
  constructor(
    key: Uint8Array,
    private readonly profile: string,
  ) {
    if (key.byteLength !== 32 || !/^[a-f0-9]{64}$/.test(profile))
      throw new Error("Invalid history key or profile.");
    this.key = Buffer.from(key);
  }
  seal(value: unknown, binding: string): Uint8Array {
    const plain = Buffer.from(JSON.stringify(value), "utf8");
    if (plain.length > 1_000_000)
      throw new Error("Meeting record exceeds its encrypted size limit.");
    try {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", this.key, iv, {
          authTagLength: 16,
        });
      cipher.setAAD(
        Buffer.from(`EveryHint.Meetings.v1/${this.profile}/${binding}`),
      );
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([
        Buffer.from([1]),
        iv,
        cipher.getAuthTag(),
        encrypted,
      ]);
    } finally {
      plain.fill(0);
    }
  }
  open<T>(value: Uint8Array, binding: string): T {
    const bytes = Buffer.from(value);
    if (bytes.length < 30 || bytes.length > 1_000_029 || bytes[0] !== 1)
      throw new Error(
        "Meeting data could not be authenticated. History was preserved.",
      );
    let plain: Buffer | undefined;
    try {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        bytes.subarray(1, 13),
        { authTagLength: 16 },
      );
      cipher.setAAD(
        Buffer.from(`EveryHint.Meetings.v1/${this.profile}/${binding}`),
      );
      cipher.setAuthTag(bytes.subarray(13, 29));
      // Do not return/update consumers until authentication in final() succeeds.
      const first = cipher.update(bytes.subarray(29));
      try {
        plain = Buffer.concat([first, cipher.final()]);
      } finally {
        first.fill(0);
      }
      return JSON.parse(plain.toString("utf8")) as T;
    } catch {
      throw new Error(
        "Meeting data could not be authenticated. History was preserved.",
      );
    } finally {
      plain?.fill(0);
    }
  }
  close(): void {
    this.key.fill(0);
  }
}
