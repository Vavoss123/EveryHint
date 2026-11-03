import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync, crc32 } from "node:zlib";

export async function prepareIcons() {
  await mkdir("build", { recursive: true });
  const size = 1024,
    raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = x / 4,
        sy = y / 4;
      const e =
        (sx >= 68 && sx < 100 && sy >= 52 && sy < 204) ||
        (sx >= 68 &&
          sx < 190 &&
          ((sy >= 52 && sy < 82) ||
            (sy >= 113 && sy < 143) ||
            (sy >= 174 && sy < 204)));
      const p = y * (size * 4 + 1) + 1 + x * 4;
      const c = e ? [255, 255, 255] : [224, 26, 52];
      for (let i = 0; i < 3; i++) raw[p + i] = c[i];
      raw[p + 3] = 255;
    }
  const chunk = (name, data) => {
    const type = Buffer.from(name),
      length = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    "build/icon.png",
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
