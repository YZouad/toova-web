# Toova Web

Web frontend for **Toova** — a 3D room planner where users design spaces, place furniture, and import AI-generated 3D models.

Built with React, Three.js (`@react-three/fiber`), Vite, and Supabase.

**Live site:** https://toova.net

## Local development

```bash
npm install
cp .env.example .env.local   # then edit TRELLIS_UPSTREAM_ORIGIN if your EC2 host differs
npm run dev
```

Open http://localhost:5173

### Trellis (3D model import)

Trellis runs on EC2 and is reached via the Vite dev proxy (`POST /generate`, multipart field `file`, GLB response). Configure per environment:

| Environment | How it works |
|-------------|--------------|
| **Local dev** | Set `TRELLIS_UPSTREAM_ORIGIN=http://YOUR_EC2_HOST:8000` in `.env.local`. Vite proxies `/api/trellis/generate` → `/generate`. |
| **Local dev (alt)** | Set `VITE_TRELLIS_GENERATE_URL` to a direct HTTPS BFF URL instead of using the Vite proxy. |
| **Production (GitHub Pages / toova.net)** | Set repo variable `VITE_TRELLIS_GENERATE_URL` to `https://<render-bff>/api/trellis/generate`. The HTTPS BFF proxies to Trellis on EC2. |

**Mixed content:** Production (`https://toova.net`) cannot call `http://EC2_IP:8000` directly. Always use the Render BFF in production.

If neither `TRELLIS_UPSTREAM_ORIGIN` nor `VITE_TRELLIS_GENERATE_URL` is set, the app runs but photo → 3D import will fail until configured.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript without emitting files |

## Environment variables

See [`.env.example`](.env.example). Copy it to `.env.local` for local dev (gitignored).

| Variable | Description |
|----------|-------------|
| `TRELLIS_UPSTREAM_ORIGIN` | Trellis server origin for the Vite dev proxy (local only, not committed). |
| `VITE_TRELLIS_GENERATE_URL` | HTTPS endpoint baked into production builds; optional override in dev. |
| `VITE_BASE_PATH` | Base URL path for assets. Use `/` for the custom domain (`toova.net`). |

## Deployment

The site deploys to GitHub Pages on every push to `main` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

1. In the repo, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Optionally set `VITE_TRELLIS_GENERATE_URL` under **Settings → Secrets and variables → Actions → Variables** so model import works in production.

### Link previews (Cloudflare Worker)

`toova.net` deep links (`/r/…`, `/u/…`) are served by a Cloudflare Worker that injects Open Graph tags and returns HTTP 200. See [`worker/README.md`](worker/README.md).

GitHub secrets for [`.github/workflows/deploy-worker.yml`](.github/workflows/deploy-worker.yml):

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Worker secrets (set once with Wrangler): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Worker vars: `ORIGIN_HOST` (GitHub Pages host, **not** `toova.net`), optional `ORIGIN_BASE_PATH`

Raw `*.github.io` URLs keep the SPA `404.html` fallback from Vite.

## Supabase database

If room creation fails with a missing `environment` or `room_geometry` column, run this once in **Supabase Dashboard → SQL Editor**:

```sql
-- supabase/sql/add_room_environment_geometry_emitter.sql
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS environment jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS room_geometry jsonb DEFAULT NULL;

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS emitter jsonb DEFAULT NULL;
```

New projects should use [`supabase/sql/room_layout_schema.sql`](supabase/sql/room_layout_schema.sql), which already includes these columns.

## Project layout

```
src/          React app and 3D scene
public/       Static assets (logo, demo videos)
worker/       Cloudflare OG gateway for toova.net deep links
supabase/     SQL migrations and Supabase config
scripts/      Utility scripts
```
