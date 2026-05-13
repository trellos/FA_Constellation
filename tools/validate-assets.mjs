// Validate that the constellation_NN.{png,json} pairs in public/assets/ are
// well-formed and indexable. Run as part of `prebuild` and standalone via
// `npm run validate-assets`. Exit code is non-zero if any pair is broken.
//
//   - Every JSON file has a sibling PNG.
//   - Every PNG file has a sibling JSON.
//   - JSON parses, has a non-empty string `name`, and a `points` array of >=2
//     [u, v] pairs where u and v are finite numbers.
//   - Indices form a contiguous run starting at 01 (we stop discovery at the
//     first gap, so 01, 02, 04 would silently hide 04).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'public', 'assets');

if (!existsSync(assetsDir)) {
  fail(`assets directory not found: ${assetsDir}`);
}

const files = readdirSync(assetsDir);
const jsons = new Map(); // id -> filename
const pngs = new Map();
for (const f of files) {
  const m = /^constellation_(\d{2})\.(json|png)$/.exec(f);
  if (!m) continue;
  const id = Number.parseInt(m[1], 10);
  if (m[2] === 'json') jsons.set(id, f);
  else pngs.set(id, f);
}

const errors = [];

// Pair check
for (const [id, f] of jsons) {
  if (!pngs.has(id)) errors.push(`${f} has no sibling PNG`);
}
for (const [id, f] of pngs) {
  if (!jsons.has(id)) errors.push(`${f} has no sibling JSON`);
}

// Contiguous index check
const ids = [...new Set([...jsons.keys(), ...pngs.keys()])].sort((a, b) => a - b);
if (ids.length === 0) {
  errors.push('no constellation pairs found in public/assets/');
} else if (ids[0] !== 1) {
  errors.push(`indices must start at 01, but smallest is ${pad2(ids[0])}`);
} else {
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== i + 1) {
      errors.push(
        `non-contiguous indices: expected ${pad2(i + 1)}, got ${pad2(ids[i])} — ` +
          `discovery stops at the first gap so any later pairs are silently hidden`,
      );
      break;
    }
  }
}

// JSON content check
for (const [id, f] of jsons) {
  const path = join(assetsDir, f);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${f}: invalid JSON — ${e.message}`);
    continue;
  }
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`${f}: top-level value must be an object`);
    continue;
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    errors.push(`${f}: "name" must be a non-empty string`);
  }
  if (!Array.isArray(raw.points)) {
    errors.push(`${f}: "points" must be an array`);
    continue;
  }
  if (raw.points.length < 2) {
    errors.push(`${f}: "points" must have at least 2 entries (got ${raw.points.length})`);
  }
  raw.points.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) {
      errors.push(`${f}: points[${i}] must be a [u, v] pair`);
      return;
    }
    const [u, v] = p;
    if (
      typeof u !== 'number' ||
      typeof v !== 'number' ||
      !Number.isFinite(u) ||
      !Number.isFinite(v)
    ) {
      errors.push(`${f}: points[${i}] must be two finite numbers (got ${JSON.stringify(p)})`);
    }
  });
  // Soft warning: out-of-range coords are allowed by spec but unusual.
  raw.points.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) return;
    const [u, v] = p;
    if (typeof u !== 'number' || typeof v !== 'number') return;
    if (u < -0.5 || u > 1.5 || v < -0.5 || v > 1.5) {
      console.warn(`  warning: ${f} points[${i}] = [${u}, ${v}] is far outside [0, 1]`);
    }
  });
  void id;
}

if (errors.length > 0) {
  for (const e of errors) console.error(`  error: ${e}`);
  fail(`${errors.length} asset validation error(s)`);
}

const count = ids.length;
console.log(
  `ok: ${count} constellation pair${count === 1 ? '' : 's'} valid (${ids.map(pad2).join(', ')})`,
);

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function fail(msg) {
  console.error(`validate-assets: ${msg}`);
  process.exit(1);
}
