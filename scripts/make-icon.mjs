import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Keep native pixel sizes in the ICO so Windows does not have to shrink one
// 256 px image for every taskbar and title bar scale.
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const samples = 4;
const ivory = [245, 243, 238];
const sage = [99, 117, 87];

function chunk(name, data) {
  const type = Buffer.from(name);
  const body = Buffer.concat([type, data]);
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 64;
  const insideRoundedSquare = (x, y) => {
    const dx = Math.max(0, Math.abs(x - 32) - 18);
    const dy = Math.max(0, Math.abs(y - 32) - 18);
    return Math.hypot(dx, dy) <= 14;
  };
  const onDisc = (x, y) => Math.hypot(x - 32, y - 32) <= 17.5;

  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let bg = 0, mark = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const x = (px + (sx + 0.5) / samples) / scale;
      const y = (py + (sy + 0.5) / samples) / scale;
      if (insideRoundedSquare(x, y)) {
        bg++;
        if (onDisc(x, y)) mark++;
      }
    }
    const total = samples * samples;
    const backgroundAlpha = bg / total;
    const markAlpha = mark / total;
    const alpha = Math.round(backgroundAlpha * 255);
    const out = (py * size + px) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const base = backgroundAlpha ? ivory[channel] : 0;
      pixels[out + channel] = Math.round(base * (1 - markAlpha) + sage[channel] * markAlpha);
    }
    pixels[out + 3] = alpha;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const images = sizes.map(size => ({ size, png: render(size) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = 6 + images.length * 16;
const entries = [];
for (const { size, png } of images) {
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += png.length;
}
await writeFile('assets/icons/md0.ico', Buffer.concat([header, ...entries, ...images.map(image => image.png)]));
