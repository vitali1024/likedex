import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { crc32, deflateSync } from 'node:zlib';

// Original foundation icon: a white L on a dark square. No fonts or external assets.
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

await mkdir('public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const insideL = x >= size / 4 && x < size * 3 / 4 && y >= size / 4 && y < size * 3 / 4
        && (x < size * 3 / 8 || y >= size * 5 / 8);
      const offset = y * (1 + size * 3) + 1 + x * 3;
      pixels.set(insideL ? [255, 255, 255] : [32, 48, 72], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  await writeFile(`public/icon/${size}.png`, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
