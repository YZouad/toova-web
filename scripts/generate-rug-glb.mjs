/** Writes a 4' × 5.9' rug GLB (0.5" thick) for checklist placement. */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoxGlb } from './lib/build-box-glb.mjs';

const WIDTH = 48;
const HEIGHT = 0.5;
const DEPTH = 70.8;

const dest = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'checklist-refs',
  'glb',
  'rug.glb',
);
writeFileSync(
  dest,
  buildBoxGlb(WIDTH, HEIGHT, DEPTH, {
    name: 'rug',
    color: [0.84, 0.8, 0.74, 1],
    roughness: 0.88,
  }),
);
console.log(`Wrote ${dest} (${WIDTH}x${HEIGHT}x${DEPTH} in)`);
