/** Writes a 15" × 56" × 0.5" framed mirror GLB (black rim, light-blue pane). */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFramedPanelGlb } from './lib/build-box-glb.mjs';

const WIDTH = 15;
const HEIGHT = 56;
const DEPTH = 0.5;

const dest = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'checklist-refs',
  'glb',
  'mirror.glb',
);
writeFileSync(dest, buildFramedPanelGlb(WIDTH, HEIGHT, DEPTH));
console.log(`Wrote ${dest} (${WIDTH}x${HEIGHT}x${DEPTH} in)`);
