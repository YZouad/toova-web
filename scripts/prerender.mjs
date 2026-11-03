#!/usr/bin/env node
/**
 * Post-vite: serve dist/, visit each SEO route with Playwright, write static HTML
 * (real body + head tags) into dist/<path>/index.html, then emit sitemap.xml.
 *
 * Requires: npx playwright install chromium (CI / local once).
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://toova.net').replace(/\/+$/, '');
const PORT = Number(process.env.PRERENDER_PORT || 4179);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.glb': 'model/gltf-binary',
};

function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** SPA-style static server: files from dist, else index.html / nested index. */
function startStaticServer() {
  const indexHtml = join(DIST, 'index.html');
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const candidates = [
      join(DIST, pathname),
      join(DIST, pathname, 'index.html'),
      join(DIST, '404.html'),
      indexHtml,
    ];
    const file = candidates.find((p) => existsSync(p) && statSync(p).isFile());
    if (!file) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(file) });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolveListen) => {
    server.listen(PORT, '127.0.0.1', () => resolveListen(server));
  });
}

function distPathForRoute(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  const rel = routePath.replace(/^\/+|\/+$/g, '');
  return join(DIST, rel, 'index.html');
}

function sitemapXml(routes) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map((r) => {
      const loc = r.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${r.path}`;
      const priority = typeof r.priority === 'number' ? r.priority.toFixed(1) : '0.5';
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[prerender] dist/index.html missing — run vite build first');
    process.exit(1);
  }

  const server = await startStaticServer();
  // Prefer bundled Chromium; fall back to system Chrome (local) when the
  // Playwright browser cache does not match the package version.
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.warn('[prerender] bundled Chromium unavailable, trying channel=chrome');
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  }
  const page = await browser.newPage();

  // Seed: load home to read the route registry from the app.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(
    () => Array.isArray(window.__TOOVA_SEO_ROUTES__) && window.__TOOVA_SEO_ROUTES__.length > 0,
    null,
    { timeout: 60_000 },
  );
  const routes = await page.evaluate(() => window.__TOOVA_SEO_ROUTES__);
  console.log(`[prerender] ${routes.length} SEO routes`);

  let written = 0;
  for (const route of routes) {
    const path = route.path === '/' ? '/' : route.path;
    const url = `http://127.0.0.1:${PORT}${path === '/' ? '/' : path}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.waitForSelector('[data-seo-ready="1"]', { timeout: 60_000 }).catch(() => null);
      // Give useDocumentHead a tick to write <head>.
      await page.waitForTimeout(400);
      const html = await page.content();
      const out = distPathForRoute(path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, html, 'utf8');
      written += 1;
      console.log(`[prerender] wrote ${path}`);
    } catch (err) {
      console.error(`[prerender] failed ${path}`, err instanceof Error ? err.message : err);
    }
  }

  // Keep SPA fallback for deep links GitHub Pages does not prerender.
  const shell = await readFile(join(DIST, 'index.html'), 'utf8');
  await writeFile(join(DIST, '404.html'), shell, 'utf8');

  await writeFile(join(DIST, 'sitemap.xml'), sitemapXml(routes), 'utf8');
  console.log(`[prerender] sitemap.xml (${routes.length} urls), ${written} pages written`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error('[prerender]', err);
  process.exit(1);
});
