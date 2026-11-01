#!/usr/bin/env node
// Generates the PWA icons (no image tooling needed). Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("../apps/web/public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const BG = [47, 111, 98]; // #2f6f62
const FG = [246, 247, 245];

// Soft ring with a centre dot, kept inside the central 60% so it survives "maskable" cropping.
function icon(size) {
  const cx = size / 2;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cover = (d) => Math.min(Math.max(0.5 - d, 0), 1); // 1px anti-aliased edge
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cx);
      const ring = cover(Math.abs(d - size * 0.245) - size * 0.045);
      const dot = cover(d - size * 0.085);
      const a = Math.max(ring, dot);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] + (FG[i] - BG[i]) * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(new URL(name, out), icon(size));
  console.log("wrote", name);
}
