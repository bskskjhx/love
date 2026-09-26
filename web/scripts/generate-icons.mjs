/**
 * Generates the PWA icons into `public/icons/`.
 *
 * Written as a script rather than committed as opaque binaries so the mark stays
 * reproducible: change the palette or the glyph geometry here and re-run
 * `npm run icons:generate`. It deliberately has no dependencies — a minimal PNG
 * encoder is cheaper to carry than an image toolchain.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlacing)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  // bytes 10-12 stay 0: deflate, adaptive filtering, no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None) for every scanline
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

/** theme-color's blue, lightened and deepened for a diagonal sweep. */
const GRADIENT_FROM = [0x60, 0xa5, 0xfa];
const GRADIENT_TO = [0x1d, 0x4e, 0xd8];
const GLYPH = [0xff, 0xff, 0xff];

/**
 * The mark's geometry, in its own normalised box. Kept as named constants so the
 * bounding box below cannot silently drift out of step with the drawing.
 */
const BODY = { cx: 0.5, cy: 0.44, halfW: 0.3, halfH: 0.21, radius: 0.105 };
const TAIL = [
  { cx: 0.325, cy: 0.63, r: 0.055 },
  { cx: 0.285, cy: 0.705, r: 0.037 },
  { cx: 0.255, cy: 0.775, r: 0.02 },
];

/** Bounding box of BODY ∪ TAIL, used to centre and scale the mark. */
const BBOX = {
  left: Math.min(BODY.cx - BODY.halfW, ...TAIL.map((c) => c.cx - c.r)),
  right: Math.max(BODY.cx + BODY.halfW, ...TAIL.map((c) => c.cx + c.r)),
  top: Math.min(BODY.cy - BODY.halfH, ...TAIL.map((c) => c.cy - c.r)),
  bottom: Math.max(BODY.cy + BODY.halfH, ...TAIL.map((c) => c.cy + c.r)),
};
BBOX.width = BBOX.right - BBOX.left;
BBOX.height = BBOX.bottom - BBOX.top;
const BBOX_CX = (BBOX.left + BBOX.right) / 2;
const BBOX_CY = (BBOX.top + BBOX.bottom) / 2;

/**
 * Signed distance to a rounded rectangle centred on (cx, cy), negative inside.
 */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * A speech balloon: a rounded rectangle plus a tapering tail. The tail is a union
 * of three circles rather than a triangle because a circle's distance field is
 * exact, which keeps the antialiasing honest at every size.
 */
function sdGlyph(px, py) {
  const body = sdRoundRect(px, py, BODY.cx, BODY.cy, BODY.halfW, BODY.halfH, BODY.radius);
  let tail = Infinity;
  for (const c of TAIL) tail = Math.min(tail, Math.hypot(px - c.cx, py - c.cy) - c.r);
  return Math.min(body, tail);
}

/**
 * @param {number} size      square edge in pixels
 * @param {number} markSpan  fraction of the icon width the mark's bounding box spans
 */
function render(size, markSpan) {
  const rgba = Buffer.alloc(size * size * 4);
  // Glyph units per icon pixel: `markSpan` spans BBOX.width glyph units, so one
  // icon pixel is this many glyph units. Used to hold the AA band at one pixel.
  const glyphPerPixel = BBOX.width / (markSpan * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // Background: a diagonal sweep. Full bleed, no alpha — the launcher and
      // iOS both apply their own mask, so a pre-rounded square would come out
      // doubly rounded or visibly inset.
      const t = Math.min(1, Math.max(0, (u + v) / 2));
      let r = GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t;
      let g = GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t;
      let b = GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t;

      // The mark, mapped so its own bounding box lands centred in the icon.
      const gu = (u - 0.5) / (markSpan / BBOX.width) + BBOX_CX;
      const gv = (v - 0.5) / (markSpan / BBOX.width) + BBOX_CY;
      const coverage = Math.min(1, Math.max(0, 0.5 - sdGlyph(gu, gv) / glyphPerPixel));

      if (coverage > 0) {
        r += (GLYPH[0] - r) * coverage;
        g += (GLYPH[1] - g) * coverage;
        b += (GLYPH[2] - b) * coverage;
      }

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, rgba);
}

/**
 * The maskable variant keeps the mark inside the 80% safe circle so a circular,
 * squircle or teardrop mask never clips it; the plain icons can run larger.
 */
const TARGETS = [
  { file: 'icon-180.png', size: 180, markSpan: 0.62 },
  { file: 'icon-192.png', size: 192, markSpan: 0.62 },
  { file: 'icon-512.png', size: 512, markSpan: 0.62 },
  { file: 'icon-512-maskable.png', size: 512, markSpan: 0.52 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, markSpan } of TARGETS) {
  const png = render(size, markSpan);
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
