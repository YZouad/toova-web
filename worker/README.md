# Toova OG gateway

Cloudflare Worker on `toova.net/r/*`, `/u/*`, and `/og/*`. Injects Open Graph
tags into the GitHub Pages SPA shell so link previews work without a rebuild.

```bash
cd worker
npm ci
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Origin HTML is fetched from `https://toova.net/index.html` (not bound to this Worker).
