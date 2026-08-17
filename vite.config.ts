import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Same-origin prefix the app calls; Vite forwards to the Render BFF. */
const trellisProxyPath = '/api/trellis';
const defaultTrellisBffOrigin = 'https://toova-bff.onrender.com';

/** GitHub Pages SPA fallback: unknown paths serve 404.html (= index.html). */
function spa404Fallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const indexHtml = path.resolve(rootDir, 'dist/index.html');
      const notFoundHtml = path.resolve(rootDir, 'dist/404.html');
      if (existsSync(indexHtml)) {
        copyFileSync(indexHtml, notFoundHtml);
      }
    },
  };
}

function buildTrellisProxy(trellisBffOrigin: string): Record<string, ProxyOptions> {
  return {
    [trellisProxyPath]: {
      target: trellisBffOrigin,
      changeOrigin: true,
      timeout: 600_000,
      proxyTimeout: 600_000,
      configure: (proxy) => {
        proxy.on('proxyReq', (_proxyReq, req) => {
          console.log(
            `[TRELLIS proxy] ${req.method} ${req.url} -> ${trellisBffOrigin}${req.url}`,
          );
        });

        proxy.on('proxyRes', (proxyRes, req) => {
          console.log(
            `[TRELLIS proxy] response ${proxyRes.statusCode} for ${req.url}`,
          );
        });

        proxy.on('error', (err, req) => {
          console.error(`[TRELLIS proxy] error for ${req.url}:`, err.message);
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const trellisBffOrigin = env.TRELLIS_BFF_ORIGIN?.trim() || defaultTrellisBffOrigin;
  const base = env.VITE_BASE_PATH || '/';

  if (mode === 'development' && env.VITE_TRELLIS_GENERATE_URL?.trim()) {
    console.warn(
      '[TRELLIS] VITE_TRELLIS_GENERATE_URL is set; the browser will call that URL directly. ' +
        'The Vite BFF proxy is still available for same-origin /api/trellis/*.',
    );
  }

  const trellisProxy = trellisBffOrigin ? buildTrellisProxy(trellisBffOrigin) : undefined;

  return {
    base,
    plugins: [react(), spa404Fallback()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
          visual: path.resolve(rootDir, 'visual.html'),
          hangingVisual: path.resolve(rootDir, 'hanging-visual.html'),
        },
      },
    },
    server: {
      port: 5173,
      ...(trellisProxy ? { proxy: trellisProxy } : {}),
    },
    preview: {
      ...(trellisProxy ? { proxy: trellisProxy } : {}),
    },
  };
});
