# Toova OG gateway (Cloudflare Worker)

Proxies `toova.net` to the GitHub Pages origin and returns **HTTP 200** HTML with
escaped Open Graph / Twitter meta for deep links:

- `/r/:token` — share unfurl (`get_share_unfurl`)
- `/u/:handle` — public profile (`get_profile_page`)
- `/u/:handle/r/:roomId` — public room (`get_public_room_unfurl`)

Uses the **publishable** Supabase key only (never `service_role`).

## Required configuration

| Name | Where | Purpose |
|------|--------|---------|
| `SUPABASE_URL` | Worker secret | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Worker secret | Publishable / anon key |
| `ORIGIN_HOST` | Worker var | GitHub Pages host (e.g. `user.github.io`) — **not** `toova.net` |
| `ORIGIN_BASE_PATH` | Worker var | Pages path prefix (`/` if site root) |
| `FALLBACK_OG_IMAGE` | optional var | Absolute URL for default OG image |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | Deploy via Wrangler |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub secret/var | Account for Wrangler |
| `CLOUDFLARE_ZONE_ID` | optional | If attaching custom routes via API |

## Local

```bash
cd worker
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
# set ORIGIN_HOST in wrangler.toml [vars] or .dev.vars
npm run dev
```

## Deploy

```bash
cd worker && npm ci && npx wrangler deploy
```

Or push to `main` — see [`.github/workflows/deploy-worker.yml`](../.github/workflows/deploy-worker.yml).

Point `toova.net` (proxied) DNS at Cloudflare and route traffic through this Worker
to the Pages origin. Raw `*.github.io` URLs keep the SPA `404.html` fallback.

## Caching

- Share-token unfurls: `Cache-Control: private, no-store`
- Public profile / room: `public, max-age=60`
- Deep-link pages include `noindex,nofollow`

Revoking a share or unpublishing a room stops **new** signed thumbnail URLs;
third-party chat caches may keep old previews until they re-crawl.
