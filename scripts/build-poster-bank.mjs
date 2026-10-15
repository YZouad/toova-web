/**
 * Download CC0/Wikimedia poster sources, build textured GLBs, write to public/checklist-refs/.
 * Reads docs/agentic-poster-bank.csv and prints SQL for supabase/migrations.
 *
 * Usage: node scripts/build-poster-bank.mjs [--sql-only]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPosterGlb } from './lib/build-poster-glb.mjs';
import { proceduralPosterBytes } from './lib/procedural-poster-png.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'docs', 'agentic-poster-bank.csv');
const GLB_DIR = join(ROOT, 'public', 'checklist-refs', 'glb', 'posters');
const IMG_DIR = join(ROOT, 'public', 'checklist-refs', 'images', 'posters');
const SQL_ONLY = process.argv.includes('--sql-only');
const ONLY_KINDS = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .filter(Boolean);
const SQL_OUT = process.argv.find((a) => a.startsWith('--sql-out='))?.slice('--sql-out='.length);
const TS_OUT = join(ROOT, 'src', 'lib', 'agenticPosterBankData.ts');
const SKIP_TS = process.argv.includes('--skip-ts');

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (ch === '"') {
        if (inQuotes && line[j + 1] === '"') {
          cur += '"';
          j += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    values.push(cur);
    const row = {};
    for (let k = 0; k < header.length; k += 1) {
      row[header[k]] = values[k] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function wikimediaUrl(imageFile) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}?width=1600`;
}

function extForBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return '.png';
  return '.jpg';
}

/** Read pixel dimensions from JPEG/PNG bytes (for poster aspect). */
function readImageSize(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const len = buf.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + len;
    }
  }
  return null;
}

/** Match plane width to image aspect at the CSV target height (inches). */
function posterInchesForImage(bytes, targetHeightIn) {
  const px = readImageSize(bytes);
  if (!px || !(px.width > 0 && px.height > 0) || !(targetHeightIn > 0)) return null;
  const widthIn = Math.round((px.width / px.height) * targetHeightIn * 100) / 100;
  return { widthIn, heightIn: targetHeightIn };
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function tagsArray(tagsPipe) {
  const base = tagsPipe
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!base.includes('poster')) base.push('poster');
  return `{${base.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;
}

async function loadImageBytes(imageFile) {
  if (imageFile.startsWith('procedural:')) {
    return proceduralPosterBytes(imageFile.slice('procedural:'.length));
  }
  const url = wikimediaUrl(imageFile);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ToovaPosterBank/1.0 (https://toova.app; build script)' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${imageFile}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 256) {
    throw new Error(`Download too small for ${imageFile}`);
  }
  return buf;
}

function thumbExtForRow(row, builtThumbs) {
  return builtThumbs?.get(row.kind) ?? (row.image_file?.startsWith('procedural:') ? 'png' : 'jpg');
}

function tsString(value) {
  return JSON.stringify(String(value));
}

function tagsFromPipe(tagsPipe) {
  return tagsPipe
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);
}

function themesFromPipe(themesPipe) {
  return themesPipe
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);
}

function descriptionForRow(row) {
  const label = String(row.label ?? '').trim();
  const themes = themesFromPipe(row.themes ?? '');
  if (themes.length > 0) {
    return `${label.replace(/ wall poster$/i, '')} for ${themes.join(' and ')} themed rooms`;
  }
  return `${label.replace(/ wall poster$/i, '')} for dorm wall decor`;
}

function buildAgenticPosterBankTs(rows, builtThumbs) {
  const entries = rows
    .map((row) => {
      const kind = row.kind;
      const thumbExt = thumbExtForRow(row, builtThumbs);
      const tags = tagsFromPipe(row.tags);
      const themes = themesFromPipe(row.themes);
      const widthIn = Number(row.width_in);
      const heightIn = Number(row.height_in);
      const depthIn = Number(row.depth_in);
      return `  {
    kind: ${tsString(kind)},
    label: ${tsString(row.label)},
    description: ${tsString(descriptionForRow(row))},
    tags: [${tags.map((t) => tsString(t)).join(', ')}],
    themes: [${themes.map((t) => tsString(t)).join(', ')}],
    license: ${tsString(row.license)},
    sourceUrl: ${tsString(row.source_url)},
    imageFile: ${tsString(row.image_file)},
    widthIn: ${widthIn},
    heightIn: ${heightIn},
    depthIn: ${depthIn},
    modelPath: ${tsString(`checklist-refs/glb/posters/${kind}.glb`)},
    thumbnailPath: ${tsString(`checklist-refs/images/posters/${kind}.${thumbExt}`)},
  }`;
    })
    .join(',\n');

  return `/** CC0 / public-domain poster bank for agentic room auto-place. See docs/agentic-poster-bank.md */
/** Generated by scripts/build-poster-bank.mjs — do not edit widthIn/heightIn by hand. */

export interface AgenticPosterBankEntry {
  kind: string;
  label: string;
  description: string;
  tags: string[];
  themes: string[];
  license: string;
  sourceUrl: string;
  /** Wikimedia Special:FilePath download (width capped). */
  imageFile: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  modelPath: string;
  thumbnailPath: string;
}

export const AGENTIC_POSTER_BANK: readonly AgenticPosterBankEntry[] = [
${entries},
];

export function posterBankByKind(kind: string): AgenticPosterBankEntry | undefined {
  return AGENTIC_POSTER_BANK.find((p) => p.kind === kind);
}
`;
}

function buildSql(rows, builtThumbs) {
  const values = rows
    .map((row) => {
      const kind = row.kind;
      const modelUrl = `checklist-refs/glb/posters/${kind}.glb`;
      const thumbUrl = `checklist-refs/images/posters/${kind}.${thumbExtForRow(row, builtThumbs)}`;
      return `(
  '${sqlEscape(kind)}',
  '${sqlEscape(row.label)}',
  '${sqlEscape(`${row.label} — CC0/public-domain Toova poster bank`)}',
  ${Number(row.width_in)}, ${Number(row.height_in)}, ${Number(row.depth_in)}, null,
  true,
  '${sqlEscape(modelUrl)}',
  '${sqlEscape(thumbUrl)}',
  '${tagsArray(row.tags)}'::text[],
  ARRAY['decor_art'],
  'public'
)`;
    })
    .join(',\n');

  return `-- CC0 / public-domain agentic poster bank (built via scripts/build-poster-bank.mjs)

INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, thumbnail_path, tags, categories, visibility
) VALUES
${values}
ON CONFLICT (kind) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    width_in = EXCLUDED.width_in,
    height_in = EXCLUDED.height_in,
    depth_in = EXCLUDED.depth_in,
    model_url = EXCLUDED.model_url,
    thumbnail_path = EXCLUDED.thumbnail_path,
    tags = EXCLUDED.tags,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public';
`;
}

async function main() {
  const csv = readFileSync(CSV_PATH, 'utf8');
  let rows = parseCsv(csv);
  if (ONLY_KINDS?.length) {
    rows = rows.filter((row) => ONLY_KINDS.includes(row.kind));
  }
  if (rows.length === 0) {
    console.error('No rows in CSV');
    process.exit(1);
  }

  const builtThumbs = new Map();

  if (!SQL_ONLY) {
    mkdirSync(GLB_DIR, { recursive: true });
    mkdirSync(IMG_DIR, { recursive: true });
  }

  for (const row of rows) {
    const kind = row.kind;
    const glbPath = join(GLB_DIR, `${kind}.glb`);
    const jpgPath = join(IMG_DIR, `${kind}.jpg`);

    if (SQL_ONLY) {
      console.log(`[skip] ${kind}`);
      continue;
    }

    process.stdout.write(`Building ${kind}… `);
    try {
      const imageBytes = await loadImageBytes(row.image_file);
      const ext = extForBytes(imageBytes);
      const thumbPath = ext === '.png' ? join(IMG_DIR, `${kind}.png`) : jpgPath;
      builtThumbs.set(kind, ext === '.png' ? 'png' : 'jpg');
      writeFileSync(thumbPath, imageBytes);

      const targetHeightIn = Number(row.height_in);
      const targetDepthIn = Number(row.depth_in);
      const derived = posterInchesForImage(imageBytes, targetHeightIn);
      const widthIn = derived?.widthIn ?? Number(row.width_in);
      const heightIn = derived?.heightIn ?? targetHeightIn;
      row.width_in = String(widthIn);
      row.height_in = String(heightIn);

      const glb = buildPosterGlb(imageBytes, widthIn, heightIn);
      writeFileSync(glbPath, glb);

      const metaPath = join(IMG_DIR, `${kind}.meta.json`);
      writeFileSync(
        metaPath,
        JSON.stringify(
          {
            kind,
            source_url: row.source_url,
            license: row.license,
            image_file: row.image_file,
            width_in: widthIn,
            height_in: heightIn,
            depth_in: targetDepthIn,
            built_at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(`  ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }

  const sql = buildSql(rows, builtThumbs);
  const sqlPath =
    SQL_OUT ??
    (ONLY_KINDS?.length
      ? join(ROOT, 'supabase', 'migrations', '20261004150000_agentic_gaming_posters.sql')
      : join(ROOT, 'supabase', 'migrations', '20261005120000_agentic_poster_bank_expanded.sql'));
  if (!SQL_OUT && !ONLY_KINDS?.length && !existsSync(dirname(sqlPath))) {
    console.log('\n--- SQL fragment ---\n');
    console.log(sql);
  } else {
    writeFileSync(sqlPath, sql);
    console.log(`\nWrote ${sqlPath}`);
  }

  if (!SKIP_TS && !SQL_ONLY) {
    const ts = buildAgenticPosterBankTs(rows, builtThumbs);
    writeFileSync(TS_OUT, ts);
    console.log(`Wrote ${TS_OUT}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
