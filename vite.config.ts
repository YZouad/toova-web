import { defineConfig, loadEnv } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** Same-origin path the app calls; Vite forwards to upstream `/generate` (Pixal3D). */
const trellisProxyPath = '/api/trellis/generate';

function meshUpstreamOrigin(env: Record<string, string>): string | undefined {
  const pixal3d = env.PIXAL3D_UPSTREAM_ORIGIN?.trim();
  if (pixal3d) return pixal3d;
  const trellis = env.TRELLIS_UPSTREAM_ORIGIN?.trim();
  if (trellis) return trellis;
  return undefined;
}

function buildTrellisProxy(upstreamOrigin: string): Record<string, ProxyOptions> {
  return {
    [trellisProxyPath]: {
      target: upstreamOrigin,
      changeOrigin: true,
      rewrite: () => '/generate',
      timeout: 600_000,
      proxyTimeout: 600_000,
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq, req) => {
          console.log(
            `[mesh proxy] ${req.method} ${req.url} -> ${upstreamOrigin}/generate`,
          );
        });

        proxy.on('proxyRes', (proxyRes, req) => {
          console.log(
            `[mesh proxy] response ${proxyRes.statusCode} for ${req.url}`,
          );
        });

        proxy.on('error', (err, req) => {
          console.error(`[mesh proxy] error for ${req.url}:`, err.message);
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const upstreamOrigin = meshUpstreamOrigin(env);
  const base = env.VITE_BASE_PATH || '/';

  if (mode === 'development' && !upstreamOrigin && !env.VITE_TRELLIS_GENERATE_URL?.trim()) {
    console.warn(
      '[mesh] Set PIXAL3D_UPSTREAM_ORIGIN or TRELLIS_UPSTREAM_ORIGIN in .env.local (see .env.example) ' +
        'or VITE_TRELLIS_GENERATE_URL to enable 3D model import in dev.',
    );
  }

  const trellisProxy = upstreamOrigin ? buildTrellisProxy(upstreamOrigin) : undefined;

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
