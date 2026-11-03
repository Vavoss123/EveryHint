export function nativeBinaryMatches(
  bytes: Buffer,
  platform: string,
  arch: string,
): boolean {
  if (bytes.length < 64 || !["x64", "arm64"].includes(arch)) return false;
  if (platform === "win32") {
    const pe = bytes.readUInt32LE(0x3c);
    return (
      bytes.toString("ascii", 0, 2) === "MZ" &&
      pe <= bytes.length - 6 &&
      bytes.readUInt32LE(pe) === 0x4550 &&
      bytes.readUInt16LE(pe + 4) === (arch === "x64" ? 0x8664 : 0xaa64)
    );
  }
  if (platform === "linux")
    return (
      bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      bytes[4] === 2 &&
      bytes[5] === 1 &&
      bytes.readUInt16LE(18) === (arch === "x64" ? 62 : 183)
    );
  if (platform === "darwin")
    return (
      bytes.readUInt32LE(0) === 0xfeedfacf &&
      bytes.readUInt32LE(4) === (arch === "x64" ? 0x1000007 : 0x100000c)
    );
  return false;
}
