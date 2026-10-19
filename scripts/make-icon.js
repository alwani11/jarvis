// Draws the glowing-orb icon (assets/icon.png and icon.ico) with no image libraries.
const fs = require('fs'), zlib = require('zlib');
const N = 256, raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 128, y - 128) / 128, hx = Math.hypot(x - 100, y - 95) / 128;
    const core = Math.max(0, 1 - d / 0.62), glow = Math.max(0, 1 - d) ** 2.2, hi = Math.max(0, 1 - hx / 0.35) ** 2;
    const a = Math.min(1, glow * 1.1 + core), i = y * (N * 4 + 1) + 1 + x * 4;
    raw[i] = Math.min(255, 30 + 200 * hi + 80 * core); raw[i + 1] = Math.min(255, 120 + 120 * core + 100 * hi); raw[i + 2] = 255; raw[i + 3] = Math.round(a * 255);
  }
}
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 0; ico[7] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/icon.png', png); fs.writeFileSync('assets/icon.ico', Buffer.concat([ico, png]));
