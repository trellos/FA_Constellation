/**
 * Generates public/preview.png — the Open Graph preview image for the
 * Lavaling constellation (constellation_02).
 *
 * Composite layers (bottom → top):
 *   1. Dark starfield background (#0a0a3a) with scattered ambient stars
 *   2. Lavaling outline PNG (white silhouette)
 *   3. SVG: connecting lines between trace points
 *   4. SVG: glowing star dots at each trace point
 *
 * Output: 1200×630 px (standard OG image size)
 *
 * Run: node tools/generate-preview.mjs
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const W = 1200;
const H = 630;

// Lavaling trace points (normalised 0–1, from constellation_02.json)
const RAW_POINTS = [
  [0.22, 0.1],
  [0.08, 0.4],
  [0.2, 0.78],
  [0.5, 0.92],
  [0.78, 0.78],
  [0.92, 0.4],
  [0.78, 0.1],
];

// ── Layout ───────────────────────────────────────────────────────────────────
// Fit the constellation into a square region centred in the OG frame.
const FILL = 0.78;
const SIDE = Math.round(Math.min(W, H) * FILL); // 491 px
const OX = Math.round((W - SIDE) / 2);
const OY = Math.round((H - SIDE) / 2);

const px = ([nx, ny]) => ({
  x: Math.round(OX + nx * SIDE),
  y: Math.round(OY + ny * SIDE),
});
const POINTS = RAW_POINTS.map(px);

// ── Ambient starfield (deterministic) ────────────────────────────────────────
function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
const rand = lcg(42);
const AMBIENT = Array.from({ length: 90 }, () => ({
  x: Math.round(rand() * W),
  y: Math.round(rand() * H),
  r: rand() < 0.15 ? 1.5 : 1,
  a: (0.25 + rand() * 0.55).toFixed(2),
}));

// ── SVG overlay ──────────────────────────────────────────────────────────────
function buildSvg() {
  const stars = AMBIENT.map(
    (s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="white" opacity="${s.a}"/>`,
  ).join('\n    ');

  const lines = POINTS.slice(0, -1)
    .map(
      (p, i) =>
        `<line x1="${p.x}" y1="${p.y}" x2="${POINTS[i + 1].x}" y2="${POINTS[i + 1].y}" stroke="white" stroke-width="3" stroke-opacity="0.85"/>`,
    )
    .join('\n    ');

  const dots = POINTS.map(
    (p) =>
      `<circle cx="${p.x}" cy="${p.y}" r="14" fill="white" fill-opacity="0.12"/>` +
      `<circle cx="${p.x}" cy="${p.y}" r="8" fill="white" fill-opacity="0.9"/>`,
  ).join('\n    ');

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${stars}
  ${lines}
  ${dots}
</svg>`,
  );
}

// ── Assemble ─────────────────────────────────────────────────────────────────
const outlinePath = path.join(root, 'public/assets/constellation_02.png');
const outPath = path.join(root, 'public/preview.png');

const outlineBuf = await sharp(readFileSync(outlinePath))
  .resize(SIDE, SIDE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 10, g: 10, b: 58, alpha: 1 } },
})
  .composite([
    { input: outlineBuf, top: OY, left: OX, blend: 'screen' },
    { input: buildSvg(), top: 0, left: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outPath);

console.log(`✅  Generated ${outPath}  (${W}×${H})`);
