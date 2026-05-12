// Pixel-extract the finger/pointing-hand hint sprite from a clean video frame.
//
//   node tools/generate-finger.mjs   ->   public/assets/finger.png
//
// The finger appears during the hint animation as a blue hand with a thick
// white outline against the deep-blue background. We isolate it by keeping
// pixels whose green channel is bright enough to be either part of the
// finger's medium-blue body or its near-white outline (background is high-B
// but low-G).

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'assets');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const framesDir = join(tmpdir(), 'constellation_frames');
// v1_011 captures the finger sprite during the hint animation, with no
// drag-line crossing it. Earlier versions used v1_015 which had a diagonal
// drag-line through the index finger — extracting from it required a top
// trim that cropped the fingertip off.
const SOURCE = join(framesDir, 'v1_011.png');

// Crop box around the finger in the source frame (1920x1080).
const CROP = { x: 400, y: 600, w: 170, h: 200 };

// Filter tuning. The finger is alpha-blended over deep-blue background, so
// pixels comprising the sprite have a noticeably higher green channel than
// the surrounding background.
const G_MIN = 110;        // body+outline keep, background reject
const G_SOFT = 30;        // alpha falloff
const FINAL_W = 128;      // output texture size
const FINAL_H = 144;

async function run() {
  if (!existsSync(SOURCE)) {
    throw new Error(`source frame missing: ${SOURCE}`);
  }
  const meta = await sharp(SOURCE).metadata();
  const raw = await sharp(SOURCE)
    .ensureAlpha()
    .extract({ left: CROP.x, top: CROP.y, width: CROP.w, height: CROP.h })
    .raw()
    .toBuffer();

  const w = CROP.w;
  const h = CROP.h;
  const out = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];

      // Background is high-B / low-G. Keep pixels with enough green.
      if (g < G_MIN) {
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
        continue;
      }

      // Preserve color, soft alpha at the threshold edge.
      const a = Math.min(255, Math.round(((g - G_MIN) / G_SOFT) * 255 + 64));
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = Math.min(255, Math.max(0, a));
    }
  }

  // Auto-crop to alpha bbox + small margin, then resize to FINAL_W × FINAL_H.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('finger extraction produced empty mask');
  const margin = 6;
  const cx0 = Math.max(0, minX - margin);
  const cy0 = Math.max(0, minY - margin);
  const cx1 = Math.min(w, maxX + margin + 1);
  const cy1 = Math.min(h, maxY + margin + 1);
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;

  const outPath = join(outDir, 'finger.png');
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: cx0, top: cy0, width: cw, height: ch })
    .resize(FINAL_W, FINAL_H, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`wrote ${outPath}  (source ${w}x${h} -> ${cw}x${ch} -> ${FINAL_W}x${FINAL_H})`);
  console.log(`  meta from source: ${meta.width}x${meta.height}`);
}

await run();
