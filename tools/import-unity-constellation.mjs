#!/usr/bin/env node
// Convert a Unity Constellation prefab (+ its referenced sprite) into a
// public/assets/constellation_NN.{json,png} pair for this game.
//
// Usage:
//   node tools/import-unity-constellation.mjs <prefab-path> [--name "Display Name"] [--id NN] [--assets-root <dir>]
//
// What it does:
//   1. Reads the prefab YAML and finds the SpriteRenderer m_Sprite GUID + m_Size.
//   2. Looks up the sprite PNG by scanning *.png.meta files in the Unity Assets
//      tree (auto-detected by walking up from the prefab) for that GUID.
//   3. Pulls every Star PrefabInstance child of the `Stars` container, reading
//      m_LocalPosition.{x,y} and m_RootOrder. Trace order = RootOrder.
//   4. Normalizes (x, y) -> (u, v) using the sprite's m_Size:
//          u = (x + size.x / 2) / size.x
//          v = (y + size.y / 2) / size.y
//   5. Picks the next free NN (or honors --id), copies the PNG to
//      public/assets/constellation_NN.png and writes constellation_NN.json.
//
// The prefab format is intentionally regex-parsed: Unity prefab YAML uses
// non-standard `--- !u!T &id` document markers that off-the-shelf YAML parsers
// choke on, and we only need a handful of fields.

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const assetsDir = join(repoRoot, 'public', 'assets');

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
if (!args.positional[0]) {
  fail(
    'usage: node tools/import-unity-constellation.mjs <prefab-path> [--name N] [--id NN] [--assets-root DIR]',
  );
}
const prefabPath = resolve(args.positional[0]);
if (!existsSync(prefabPath)) fail(`prefab not found: ${prefabPath}`);

const overrideName = args.name ?? null;
const overrideId = args.id ? Number.parseInt(args.id, 10) : null;
if (overrideId !== null && (!Number.isInteger(overrideId) || overrideId < 1 || overrideId > 99)) {
  fail(`--id must be an integer 1..99 (got ${args.id})`);
}

const prefabText = readFileSync(prefabPath, 'utf8');

// ── 1. Sprite GUID + size ────────────────────────────────────────────────────
const spriteBlock = extractSpriteRenderer(prefabText);
if (!spriteBlock) fail('no SpriteRenderer with m_Sprite found in prefab');
const spriteGuid = spriteBlock.guid;
const spriteSize = spriteBlock.size; // { x, y }
console.log(`sprite guid: ${spriteGuid}  size: ${spriteSize.x} x ${spriteSize.y}`);

// ── 2. Locate sprite PNG by GUID ─────────────────────────────────────────────
const assetsRoot = args['assets-root']
  ? resolve(args['assets-root'])
  : findUnityAssetsRoot(prefabPath);
if (!assetsRoot) fail('could not locate Unity `Assets/` root — pass --assets-root explicitly');
console.log(`scanning Unity assets root: ${assetsRoot}`);

const pngPath = findPngByGuid(assetsRoot, spriteGuid);
if (!pngPath) fail(`no .png.meta with guid ${spriteGuid} under ${assetsRoot}`);
console.log(`found sprite: ${pngPath}`);

// ── 3. Star positions ────────────────────────────────────────────────────────
const stars = extractStars(prefabText);
if (stars.length < 2) fail(`need at least 2 stars in prefab (found ${stars.length})`);
stars.sort((a, b) => a.rootOrder - b.rootOrder);
console.log(`stars: ${stars.length} (trace order = m_RootOrder)`);

// ── 4. Normalize ─────────────────────────────────────────────────────────────
const halfX = spriteSize.x / 2;
const halfY = spriteSize.y / 2;
const points = stars.map((s) => [
  round4((s.x + halfX) / spriteSize.x),
  round4((s.y + halfY) / spriteSize.y),
]);

// ── 5. Pick NN, write files ──────────────────────────────────────────────────
const nn = overrideId ?? nextFreeId(assetsDir);
const id = pad2(nn);
const outPng = join(assetsDir, `constellation_${id}.png`);
const outJson = join(assetsDir, `constellation_${id}.json`);

const name = overrideName ?? deriveName(prefabPath);
copyFileSync(pngPath, outPng);
writeFileSync(outJson, formatJson(name, points), 'utf8');

console.log(`\nwrote ${outJson}`);
console.log(`wrote ${outPng}`);
console.log(`\n  name:   ${name}`);
console.log(`  points: ${points.length}`);
console.log(`  id:     ${id}`);
console.log(`\nnext: npm run validate-assets`);

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

function extractSpriteRenderer(text) {
  const docs = splitYamlDocs(text);
  for (const doc of docs) {
    if (!/^SpriteRenderer:/m.test(doc)) continue;
    const guidMatch = /m_Sprite:\s*\{[^}]*guid:\s*([0-9a-f]+)/.exec(doc);
    if (!guidMatch) continue;
    const sizeMatch = /m_Size:\s*\{\s*x:\s*([\-0-9.eE]+)\s*,\s*y:\s*([\-0-9.eE]+)/.exec(doc);
    if (!sizeMatch) continue;
    return {
      guid: guidMatch[1],
      size: { x: Number.parseFloat(sizeMatch[1]), y: Number.parseFloat(sizeMatch[2]) },
    };
  }
  return null;
}

function extractStars(text) {
  // Stars are PrefabInstance documents whose m_TransformParent points to the
  // `Stars` GameObject's Transform. Each one supplies LocalPosition.{x,y} and
  // m_RootOrder via m_Modifications entries.
  const starsTransformId = findStarsContainerTransformId(text);
  if (!starsTransformId) {
    throw new Error('could not find a `Stars` GameObject + its child Transform');
  }
  const out = [];
  const docs = splitYamlDocs(text);
  for (const doc of docs) {
    if (!/^PrefabInstance:/m.test(doc)) continue;
    const parentMatch = /m_TransformParent:\s*\{fileID:\s*(\d+)\}/.exec(doc);
    if (!parentMatch || parentMatch[1] !== starsTransformId) continue;
    const x = readModificationFloat(doc, 'm_LocalPosition.x');
    const y = readModificationFloat(doc, 'm_LocalPosition.y');
    const rootOrder = readModificationInt(doc, 'm_RootOrder');
    if (x === null || y === null || rootOrder === null) continue;
    out.push({ x, y, rootOrder });
  }
  return out;
}

function findStarsContainerTransformId(text) {
  // Match a GameObject doc named "Stars", capture its anchor id, then look at
  // its m_Component list and return the fileID of its Transform.
  const goRe = /---\s*!u!1\s*&(\d+)\s*\nGameObject:[\s\S]*?(?=\n---|\Z)/g;
  let m;
  while ((m = goRe.exec(text)) !== null) {
    const body = m[0];
    if (!/m_Name:\s*Stars\b/.test(body)) continue;
    const comp = /m_Component:\s*\n((?:\s*-\s*component:\s*\{fileID:\s*\d+\}\s*\n)+)/.exec(body);
    if (!comp) continue;
    const ids = [...comp[1].matchAll(/fileID:\s*(\d+)/g)].map((x) => x[1]);
    for (const id of ids) {
      const tRe = new RegExp(`---\\s*!u!4\\s*&${id}\\b`);
      if (tRe.test(text)) return id;
    }
  }
  return null;
}

function readModificationFloat(doc, propertyPath) {
  const re = new RegExp(
    `propertyPath:\\s*${escapeRe(propertyPath)}\\s*\\n\\s*value:\\s*([\\-0-9.eE]+)`,
  );
  const m = re.exec(doc);
  if (!m) return null;
  const v = Number.parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

function readModificationInt(doc, propertyPath) {
  const v = readModificationFloat(doc, propertyPath);
  return v === null ? null : Math.round(v);
}

function splitYamlDocs(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let buf = [];
  for (const line of lines) {
    if (line.startsWith('---')) {
      if (buf.length) out.push(buf.join('\n'));
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) out.push(buf.join('\n'));
  return out;
}

function findUnityAssetsRoot(startPath) {
  let dir = dirname(startPath);
  for (let i = 0; i < 20; i++) {
    if (basename(dir) === 'Assets' && existsSync(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function findPngByGuid(rootDir, guid) {
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.png.meta')) {
        try {
          const txt = readFileSync(full, 'utf8');
          if (txt.includes(`guid: ${guid}`)) {
            const png = full.replace(/\.meta$/, '');
            if (existsSync(png)) return png;
          }
        } catch {
          // unreadable meta — skip
        }
      }
    }
  }
  return null;
}

function nextFreeId(dir) {
  const taken = new Set();
  for (const f of readdirSync(dir)) {
    const m = /^constellation_(\d{2})\.json$/.exec(f);
    if (m) taken.add(Number.parseInt(m[1], 10));
  }
  for (let i = 1; i < 100; i++) if (!taken.has(i)) return i;
  fail('no free constellation slot under 100');
  return 0;
}

function deriveName(prefabPath) {
  return basename(prefabPath).replace(/\.prefab$/i, '');
}

function formatJson(name, points) {
  // Match the inline-pair style of the hand-written constellation_0N.json files.
  const lines = points.map((p, i) => {
    const pair = `[${trimNum(p[0])}, ${trimNum(p[1])}]`;
    return `    ${pair}${i === points.length - 1 ? '' : ','}`;
  });
  return `{\n  "name": ${JSON.stringify(name)},\n  "points": [\n${lines.join('\n')}\n  ]\n}\n`;
}

function trimNum(n) {
  // Drop trailing zeros so 0.5100 -> 0.51, keep at least one digit after the dot.
  return Number.parseFloat(n.toFixed(4)).toString();
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      out[key] = val;
      i++;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function fail(msg) {
  console.error(`import-unity-constellation: ${msg}`);
  process.exit(1);
}
