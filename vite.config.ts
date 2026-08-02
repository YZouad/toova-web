import { defineConfig, loadEnv } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** Same-origin path the app calls; Vite forwards to TRELLIS `/generate`. */
const trellisProxyPath = '/api/trellis/generate';

function buildTrellisProxy(trellisOrigin: string): Record<string, ProxyOptions> {
  return {
    [trellisProxyPath]: {
      target: trellisOrigin,
      changeOrigin: true,
      rewrite: () => '/generate',
      timeout: 600_000,
      proxyTimeout: 600_000,
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          console.log(
            `[TRELLIS proxy] ${req.method} ${req.url} -> ${trellisOrigin}/generate`,
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
  const trellisOrigin = env.TRELLIS_UPSTREAM_ORIGIN?.trim();
  const base = env.VITE_BASE_PATH || '/';

  if (mode === 'development' && !trellisOrigin && !env.VITE_TRELLIS_GENERATE_URL?.trim()) {
    console.warn(
      '[TRELLIS] Set TRELLIS_UPSTREAM_ORIGIN in .env.local (see .env.example) ' +
        'or VITE_TRELLIS_GENERATE_URL to enable 3D model import in dev.',
    );
  }

  const trellisProxy = trellisOrigin ? buildTrellisProxy(trellisOrigin) : undefined;

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      ...(trellisProxy ? { proxy: trellisProxy } : {}),
    },
    preview: {
      ...(trellisProxy ? { proxy: trellisProxy } : {}),
    },
  };
});
