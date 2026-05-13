// One-shot helper: extracts frames from the three reference videos so
// generate-outlines.mjs can read them.
//
// Usage:  node tools/extract-frames.mjs
//
// Output: %TEMP%\constellation_frames\v{1,2,3}_NNN.png  (1 fps)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FFMPEG = 'C:\\dev\\ffmpeg\\bin\\ffmpeg.exe';

const SOURCES = [
  { id: 1, src: 'C:\\Users\\jdesu\\Downloads\\Constellation_01_landscape.mp4' },
  { id: 2, src: 'C:\\Users\\jdesu\\Downloads\\Constellation_02_landscape.mp4' },
  { id: 3, src: 'C:\\Users\\jdesu\\Downloads\\Constellation_03_landscape.mp4' },
];

const outDir = join(tmpdir(), 'constellation_frames');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const { id, src } of SOURCES) {
  if (!existsSync(src)) {
    console.warn(`skipping (missing): ${src}`);
    continue;
  }
  console.log(`extracting ${src} -> ${outDir}\\v${id}_NNN.png`);
  execFileSync(
    FFMPEG,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      src,
      '-vf',
      'fps=1',
      join(outDir, `v${id}_%03d.png`),
    ],
    { stdio: 'inherit' },
  );
}

console.log('done.');
