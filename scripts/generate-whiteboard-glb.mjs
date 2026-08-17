/** Writes a 24" × 18" × 0.5" white box GLB for checklist whiteboard placement. */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWhiteboardGlb } from './lib/build-box-glb.mjs';

const WIDTH = 24;
const HEIGHT = 18;
const DEPTH = 0.5;

const dest = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'checklist-refs',
  'glb',
  'whiteboard-v2.glb',
);
writeFileSync(dest, buildWhiteboardGlb(WIDTH, HEIGHT, DEPTH));
console.log(`Wrote ${dest} (${WIDTH}x${HEIGHT}x${DEPTH} in)`);
