// Extract pixel-accurate white outlines from the reference video frames.
//
//   node tools/generate-outlines.mjs
//
// Reads source PNG frames from %TEMP%\constellation_frames (produced by
// tools/extract-frames.mjs) and writes transparent outline PNGs to
// public/assets/constellation_NN.png.
//
// Approach (per constellation):
//   1. Load the chosen reveal-phase frame at full 1920x1080.
//   2. Keep only "near-white, high-luminance" pixels — that isolates the
//      hand-drawn outline from the constellation overlay (faint lavender),
//      the magenta progress bar, and the deep-blue background.
//   3. Optionally mask out per-constellation circles/rects (overlay node
//      positions, "PERFECT" text bbox) by clamping to transparent.
//   4. Auto-crop to the alpha bbox with a small margin.
//   5. Slight box-blur on alpha to smooth pixel-edge stairsteps.

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const outDir = join(projectRoot, 'public', 'assets');
const framesDir = join(tmpdir(), 'constellation_frames');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Each constellation:
//   source: full-frame source PNG (1920x1080)
//   masks:  optional list of {x, y, r} circles in source coords to clamp transparent
//           (used to wipe out the overlay node-dots if they leak through)
//   rectMasks: optional list of {x, y, w, h} rectangles to clamp transparent
//           (used to remove the progress bar / "PERFECT" text / out-of-bounds)
const CONSTELLATIONS = [
  {
    id: 1,
    name: 'volcano',
    source: join(framesDir, 'v1_042.png'),
    rectMasks: [{ x: 0, y: 980, w: 1920, h: 100 }],
    masks: [],
  },
  {
    id: 2,
    name: 'slime',
    source: join(framesDir, 'v2_028.png'),
    rectMasks: [{ x: 0, y: 980, w: 1920, h: 100 }],
    masks: [],
  },
  {
    id: 3,
    name: 'rock',
    source: join(framesDir, 'v3_040.png'),
    rectMasks: [{ x: 0, y: 980, w: 1920, h: 100 }],
    masks: [],
  },
];

// Filter tuning — the outline is hand-drawn white, alpha-blended against
// the deep-blue background. Result: high min(R,G,B). The constellation
// overlay (faint lavender) has low B-relative-to-R, so it gets rejected
// by the saturation cap.
const MIN_RGB = 150; // each channel must exceed this for "near-white"
const MIN_RGB_SOFT = 90; // alpha falloff range above MIN_RGB
const SAT_MAX = 55; // max(R,G,B) - min(R,G,B) <= this  ->  near-neutral
const MARGIN = 24; // crop margin

async function processOne(cfg) {
  if (!existsSync(cfg.source)) {
    console.warn(`SKIP ${cfg.name}: missing source ${cfg.source}`);
    return;
  }

  const img = sharp(cfg.source).ensureAlpha();
  const meta = await img.metadata();
  const { width, height } = meta;
  const raw = await img.raw().toBuffer(); // RGBA row-major

  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = raw[i],
        g = raw[i + 1],
        b = raw[i + 2];
      const minRGB = Math.min(r, g, b);
      const maxRGB = Math.max(r, g, b);
      const sat = maxRGB - minRGB;

      let keep = minRGB > MIN_RGB && sat <= SAT_MAX;

      // rect masks force transparent
      if (keep && cfg.rectMasks?.length) {
        for (const m of cfg.rectMasks) {
          if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) {
            keep = false;
            break;
          }
        }
      }
      // circle masks force transparent
      if (keep && cfg.masks?.length) {
        for (const m of cfg.masks) {
          const dx = x - m.x;
          const dy = y - m.y;
          if (dx * dx + dy * dy < m.r * m.r) {
            keep = false;
            break;
          }
        }
      }

      if (!keep) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      } else {
        const a = Math.min(255, Math.max(0, Math.round(((minRGB - MIN_RGB) / MIN_RGB_SOFT) * 255)));
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = a;
      }
    }
  }

  // Compute alpha bbox
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = out[(y * width + x) * 4 + 3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    console.warn(`${cfg.name}: no opaque pixels survived threshold`);
    return;
  }

  const cx0 = Math.max(0, minX - MARGIN);
  const cy0 = Math.max(0, minY - MARGIN);
  const cx1 = Math.min(width, maxX + MARGIN + 1);
  const cy1 = Math.min(height, maxY + MARGIN + 1);
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;

  const outPath = join(outDir, `constellation_0${cfg.id}.png`);
  await sharp(out, { raw: { width, height, channels: 4 } })
    .extract({ left: cx0, top: cy0, width: cw, height: ch })
    .blur(0.6)
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`${cfg.name}: ${cw}x${ch} -> ${outPath} (bbox ${cx0},${cy0} ${cx1},${cy1})`);
}

for (const cfg of CONSTELLATIONS) {
  await processOne(cfg);
}

console.log('done.');
