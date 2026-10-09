// Draws the Wayfarer compass icon at the sizes the web app needs and writes PNGs into web/icons/.
// Run `node scripts/make-web-icons.cjs` to regenerate them (the PNGs are committed).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), body = Buffer.concat([Buffer.from(type), data]);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The same evergreen compass and gold trail as icon.ico, described in a 256 x 256 space.
const FIELD = [22, 32, 23], GOLD = [218, 183, 112], PINE = [25, 43, 32], TRAIL = [227, 202, 145], EMBER = [198, 116, 73], PALE = [246, 228, 177];
function colorAt(u, v) {
  let c = FIELD;
  const d = Math.hypot(u - 128, v - 128);
  if (d <= 108) c = GOLD;
  if (d <= 91) c = PINE;
  if (v >= 46 && v < 210) { const half = (v < 128 ? v - 46 : 210 - v) * 0.33; if (Math.abs(u - 128) <= half) c = GOLD; }
  if ((u >= 120 && u <= 136 && v >= 63 && v <= 194) || (v >= 120 && v <= 136 && u >= 63 && u <= 194)) c = PINE;
  if (v >= 75 && v <= 188) { const cx = 123 + 27 * Math.sin((Math.min(180, Math.max(83, v)) - 83) / 96 * Math.PI); if (Math.hypot(u - cx, v - Math.min(180, Math.max(83, v))) <= 8) c = TRAIL; }
  if (d <= 16) c = EMBER;
  if (d <= 7) c = PALE;
  return c;
}
// scale < 1 shrinks the art inside the full-bleed field, for icons that phones crop to a circle or squircle.
function render(size, scale = 1) {
  const px = Buffer.alloc(size * size * 4), n = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
      const u = ((x + (sx + .5) / n) / size - .5) / scale * 256 + 128, v = ((y + (sy + .5) / n) / size - .5) / scale * 256 + 128, c = colorAt(u, v);
      sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
    }
    const i = (y * size + x) * 4; px[i] = Math.round(sum[0] / (n * n)); px[i + 1] = Math.round(sum[1] / (n * n)); px[i + 2] = Math.round(sum[2] / (n * n)); px[i + 3] = 255;
  }
  return px;
}
const out = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const [name, size, scale] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.78], ['apple-touch-icon.png', 180, 1]]) {
  fs.writeFileSync(path.join(out, name), encodePng(size, render(size, scale)));
  console.log('wrote web/icons/' + name);
}
