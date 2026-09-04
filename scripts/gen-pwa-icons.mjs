// Generates the PWA launcher icons in public/pwa/ from the existing brand mark
// (the flat light plate in public/favicon.svg / public/icon.png) placed on the
// dark theme background. Pure Node — no image libraries. Re-run with
// `node scripts/gen-pwa-icons.mjs` if the mark or palette changes.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pwa");
const BACKGROUND = [0x14, 0x14, 0x14]; // dark theme background (#141414)
const PLATE = [0xe4, 0xe4, 0xe4]; // favicon.svg plate

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Opaque RGB PNG (no alpha channel) so maskable renders have no holes. */
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Coverage of a rounded square centred in the canvas, 4×4 supersampled. */
function roundedPlate(size, plateFraction, radiusFraction) {
  const half = (size * plateFraction) / 2;
  const radius = half * 2 * radiusFraction;
  const centre = size / 2;
  const inside = (px, py) => {
    const dx = Math.abs(px - centre) - (half - radius);
    const dy = Math.abs(py - centre) - (half - radius);
    if (dx <= 0 && dy <= 0) return true;
    if (dx > radius || dy > radius) return false;
    if (dx <= 0 || dy <= 0) return true;
    return dx * dx + dy * dy <= radius * radius;
  };
  return (x, y) => {
    let hits = 0;
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++)
        if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
    const t = hits / 16;
    return BACKGROUND.map((bg, i) => Math.round(bg + (PLATE[i] - bg) * t));
  };
}

// `any`: plate fills ~56% of the tile (reads as the favicon on a dark tile).
// `maskable`: plate stays inside Android's 80% safe circle (diagonal of a
// 44% square ≈ 62% of the tile), so any mask shape keeps the whole mark.
const VARIANTS = [
  { file: "icon-192.png", size: 192, plate: 0.56, radius: 0.16 },
  { file: "icon-512.png", size: 512, plate: 0.56, radius: 0.16 },
  { file: "maskable-192.png", size: 192, plate: 0.44, radius: 0.16 },
  { file: "maskable-512.png", size: 512, plate: 0.44, radius: 0.16 },
];

mkdirSync(OUT, { recursive: true });
for (const v of VARIANTS) {
  writeFileSync(join(OUT, v.file), png(v.size, roundedPlate(v.size, v.plate, v.radius)));
  console.log(`wrote public/pwa/${v.file}`);
}
