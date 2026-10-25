#!/usr/bin/env node
/**
 * Backfill public catalog thumbnails in Supabase Storage.
 *
 * Sources:
 * - checked-in checklist images
 * - generated procedural previews for Toova's built-in furniture
 * - generated artwork for the poster catalog
 * - Apple's published Quick Look gallery thumbnails for AR sample models
 *
 * Requires a linked Supabase CLI session and Playwright Chromium.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const PROJECT_REF = 'xfifgtedssabneqlxbhf';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MODEL_BUCKET = 'model-files';
const PUBLIC_BUCKET = 'public-models';
const STATIC_IMAGE_ROOT = join(process.cwd(), 'public/checklist-refs/images');

const BUILTIN_KINDS = new Set([
  'bed',
  'bookshelf',
  'chair',
  'desk',
  'dresser',
  'lamp',
  'nightstand',
  'shelf',
  'wardrobe',
  'checklist-rug',
]);

const APPLE_THUMBNAILS = {
  'arvis-baseball-glove':
    'https://developer.apple.com/quick-look-gallery/models/baseball-glove/baseball-glove-thumb_2x.png',
  'arvis-chameleon':
    'https://developer.apple.com/quick-look-gallery/models/chameleon/chameleon-thumb_2x.png',
  'arvis-guitar':
    'https://developer.apple.com/quick-look-gallery/models/stratocaster/stratocaster.jpg',
  'arvis-slide':
    'https://developer.apple.com/quick-look-gallery/models/kids-slide/kids-slide.png',
  'arvis-solar-panels':
    'https://developer.apple.com/quick-look-gallery/models/solar-panels/solar-panels.png',
  'arvis-teapot':
    'https://developer.apple.com/quick-look-gallery/models/teapot/teapot.jpg',
  'arvis-toy-car':
    'https://developer.apple.com/quick-look-gallery/models/toycar/toycar.jpg',
  'arvis-toy-robot':
    'https://developer.apple.com/quick-look-gallery/models/vintagerobot2k/vintagerobot2k.jpg',
};

function serviceRoleKey() {
  const raw = execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const payload = JSON.parse(raw);
  const keys = Array.isArray(payload) ? payload : payload.keys ?? payload.api_keys ?? [];
  const row = keys.find((entry) => entry.name === 'service_role' || entry.role === 'service_role');
  const key = row?.api_key ?? row?.key ?? row?.secret;
  if (!key) throw new Error('Could not read the service-role key from Supabase CLI');
  return key;
}

function encodedPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function mimeType(path) {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

async function api(key, path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body.slice(0, 300)}`);
  }
  return response;
}

async function catalogRows(key) {
  const select = [
    'kind',
    'label',
    'thumbnail_path',
    'visibility',
    'is_builtin',
    'usdz_path',
  ].join(',');
  const response = await api(
    key,
    `/rest/v1/furniture_catalog?select=${encodeURIComponent(select)}&visibility=eq.public`,
  );
  return response.json();
}

async function upload(key, bucket, path, bytes, contentType) {
  await api(key, `/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: 'POST',
    headers: {
      'cache-control': '31536000',
      'content-type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
}

async function uploadPublicThumbnail(key, path, bytes, contentType) {
  await upload(key, MODEL_BUCKET, path, bytes, contentType);
  await upload(key, PUBLIC_BUCKET, path, bytes, contentType);
}

async function updateThumbnailPath(key, kind, thumbnailPath) {
  await api(
    key,
    `/rest/v1/furniture_catalog?kind=eq.${encodeURIComponent(kind)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ thumbnail_path: thumbnailPath }),
    },
  );
}

function dataUrlBytes(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function renderBuiltin(page, kind) {
  return page.evaluate(async (requestedKind) => {
    const module = await import('/src/lib/generateBuiltinThumbnail.ts');
    const blob =
      requestedKind === 'checklist-rug'
        ? await module.generateRugThumbnail()
        : await module.generateBuiltinThumbnail(requestedKind);
    if (!blob) throw new Error(`Renderer returned no image for ${requestedKind}`);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }, kind);
}

async function renderPoster(page, kind, label, outputType) {
  return page.evaluate(
    ({ posterKind, posterLabel, type }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 768;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const seed = [...posterKind].reduce((sum, character) => sum + character.charCodeAt(0), 0);
      const palettes = [
        ['#17243a', '#755967', '#e2b685'],
        ['#19352d', '#719175', '#e8dcc1'],
        ['#34231d', '#bb6346', '#f0c98b'],
        ['#272438', '#6e75a8', '#e7d7b9'],
        ['#233743', '#4f8c9b', '#ead6af'],
        ['#40242e', '#a14f5e', '#efd2ae'],
      ];
      const [dark, mid, light] = palettes[seed % palettes.length];

      ctx.fillStyle = '#e9dfcc';
      ctx.fillRect(0, 0, 768, 768);
      ctx.shadowColor = 'rgba(31, 25, 19, 0.28)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 16;
      ctx.fillStyle = light;
      ctx.fillRect(174, 74, 420, 620);
      ctx.shadowColor = 'transparent';

      const gradient = ctx.createLinearGradient(174, 74, 594, 694);
      gradient.addColorStop(0, dark);
      gradient.addColorStop(1, mid);
      ctx.fillStyle = gradient;
      ctx.fillRect(188, 88, 392, 592);

      ctx.save();
      ctx.beginPath();
      ctx.rect(188, 88, 392, 592);
      ctx.clip();

      if (posterKind.includes('space') || posterKind.includes('gaming')) {
        for (let index = 0; index < 80; index += 1) {
          const x = 195 + ((index * 83 + seed) % 378);
          const y = 95 + ((index * 137 + seed * 3) % 570);
          const size = 1 + ((index + seed) % 4);
          ctx.fillStyle = index % 5 === 0 ? light : 'rgba(255,255,255,.72)';
          ctx.fillRect(x, y, size, size);
        }
      }

      if (posterKind.includes('botanical') || posterKind.includes('forest')) {
        ctx.strokeStyle = light;
        ctx.lineWidth = 8;
        for (let index = 0; index < 7; index += 1) {
          const x = 215 + index * 55;
          ctx.beginPath();
          ctx.moveTo(x, 640);
          ctx.quadraticCurveTo(x - 55, 390 - index * 12, x + 15, 170);
          ctx.stroke();
          for (let leaf = 0; leaf < 5; leaf += 1) {
            ctx.beginPath();
            ctx.ellipse(x - 13, 530 - leaf * 70, 25, 11, -0.65, 0, Math.PI * 2);
            ctx.fillStyle = index % 2 ? mid : light;
            ctx.fill();
          }
        }
      } else if (posterKind.includes('coastal') || posterKind.includes('sunset')) {
        ctx.fillStyle = '#e9b76d';
        ctx.beginPath();
        ctx.arc(384, 300, 74, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d7cab0';
        ctx.beginPath();
        ctx.moveTo(188, 470);
        ctx.quadraticCurveTo(300, 420, 400, 475);
        ctx.quadraticCurveTo(500, 525, 580, 455);
        ctx.lineTo(580, 680);
        ctx.lineTo(188, 680);
        ctx.closePath();
        ctx.fill();
      } else if (posterKind.includes('mountain') || posterKind.includes('gothic')) {
        ctx.fillStyle = '#d7cab0';
        ctx.beginPath();
        ctx.moveTo(188, 610);
        ctx.lineTo(315, 290);
        ctx.lineTo(390, 445);
        ctx.lineTo(470, 225);
        ctx.lineTo(580, 610);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = light;
        ctx.lineWidth = 18;
        for (let index = 0; index < 6; index += 1) {
          ctx.beginPath();
          ctx.arc(384, 370, 65 + index * 42, index * 0.55, Math.PI * 1.45 + index * 0.2);
          ctx.stroke();
        }
      }
      ctx.restore();

      const title = posterLabel
        .replace(/\s+(wall\s+)?poster$/i, '')
        .replace(/\bastronomy\b/i, '')
        .trim()
        .toUpperCase();
      const words = title.split(/\s+/);
      const lines = [];
      while (words.length) lines.push(words.splice(0, 3).join(' '));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbf7f0';
      ctx.font = '600 30px system-ui, sans-serif';
      lines.slice(0, 3).forEach((line, index) => {
        ctx.fillText(line, 384, 575 + index * 38, 330);
      });

      return canvas.toDataURL(type, type === 'image/png' ? undefined : 0.9);
    },
    { posterKind: kind, posterLabel: label, type: outputType },
  );
}

async function backfill() {
  const key = serviceRoleKey();
  const rows = await catalogRows(key);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let repaired = 0;
  let skipped = 0;
  try {
    await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle' });

    for (const row of rows) {
      const currentPath = String(row.thumbnail_path ?? '').trim();

      if (currentPath.startsWith('checklist-refs/images/')) {
        const relativePath = currentPath.slice('checklist-refs/images/'.length);
        const localPath = join(STATIC_IMAGE_ROOT, relativePath);
        let bytes;
        if (existsSync(localPath)) {
          bytes = readFileSync(localPath);
        } else if (row.kind.startsWith('poster-')) {
          const type = mimeType(currentPath);
          const dataUrl = await renderPoster(page, row.kind, row.label, type);
          bytes = dataUrlBytes(dataUrl);
          mkdirSync(dirname(localPath), { recursive: true });
          writeFileSync(localPath, bytes);
        } else {
          console.warn(`skip: source image unavailable for ${row.kind}`);
          skipped += 1;
          continue;
        }
        await uploadPublicThumbnail(key, currentPath, bytes, mimeType(currentPath));
        console.log(`repaired ${row.kind} -> ${currentPath}`);
        repaired += 1;
        continue;
      }

      if (!currentPath && BUILTIN_KINDS.has(row.kind)) {
        const path = `catalog-previews/builtin/${row.kind}.jpg`;
        const dataUrl = await renderBuiltin(page, row.kind);
        const bytes = dataUrlBytes(dataUrl);
        await uploadPublicThumbnail(key, path, bytes, 'image/jpeg');
        await updateThumbnailPath(key, row.kind, path);
        console.log(`generated ${row.kind} -> ${path}`);
        repaired += 1;
        continue;
      }

      const appleUrl = APPLE_THUMBNAILS[row.kind];
      if (!currentPath && appleUrl) {
        const response = await fetch(appleUrl);
        if (!response.ok) throw new Error(`${row.kind}: Apple thumbnail returned ${response.status}`);
        const extension = extname(new URL(appleUrl).pathname).toLowerCase() || '.jpg';
        const path = `catalog-previews/arvis/${row.kind}${extension}`;
        const bytes = Buffer.from(await response.arrayBuffer());
        await uploadPublicThumbnail(key, path, bytes, mimeType(path));
        await updateThumbnailPath(key, row.kind, path);
        console.log(`imported ${row.kind} -> ${path}`);
        repaired += 1;
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`Done. repaired=${repaired} skipped=${skipped}`);
}

await backfill();
