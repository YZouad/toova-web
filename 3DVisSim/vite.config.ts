import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Same-origin path the app calls; Vite forwards to TRELLIS `/generate`. */
const trellisProxyPath = '/api/trellis/generate';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const trellisOrigin =
    env.TRELLIS_UPSTREAM_ORIGIN ?? 'http://32.195.48.47:8000';

  const trellisProxy = {
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

  // GitHub Pages serves at https://<user>.github.io/Toova/ — set VITE_BASE_PATH=/Toova/ in CI.
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: trellisProxy,
    },
    preview: {
      proxy: trellisProxy,
    },
  };
});
