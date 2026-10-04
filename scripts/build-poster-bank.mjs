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

      const glb = buildPosterGlb(imageBytes, Number(row.width_in), Number(row.height_in));
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
      : join(ROOT, 'supabase', 'migrations', '20261004120000_agentic_poster_bank.sql'));
  if (!SQL_OUT && !ONLY_KINDS?.length && !existsSync(dirname(sqlPath))) {
    console.log('\n--- SQL fragment ---\n');
    console.log(sql);
  } else {
    writeFileSync(sqlPath, sql);
    console.log(`\nWrote ${sqlPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
