# Toova Web

Web frontend for **Toova** — a 3D room planner where users design spaces, place furniture, and import AI-generated 3D models.

Built with React, Three.js (`@react-three/fiber`), Vite, and Supabase.

**Live site:** https://toova.net

## Local development

```bash
npm install
cp .env.example .env.local   # then edit TRELLIS_BFF_ORIGIN if your BFF host differs
npm run dev
```

Open http://localhost:5173

### Trellis (3D model import)

Trellis runs on EC2 and is reached through the Render BFF (`POST /api/trellis/wake`, `GET /api/trellis/status`, then `POST /api/trellis/generate`). Do not call the EC2 IP from the browser or the Vite proxy — the instance is idle-stopped and port 8000 is not open to laptops.

| Environment | How it works |
|-------------|--------------|
| **Local dev** | Vite proxies `/api/trellis/*` → `TRELLIS_BFF_ORIGIN` (defaults to `https://toova-bff.onrender.com`). The client wakes Trellis and polls status before generate. |
| **Local dev (alt)** | Set `VITE_TRELLIS_GENERATE_URL` to a direct HTTPS BFF URL instead of using the Vite proxy (BFF must allow localhost CORS). |
| **Production (GitHub Pages / toova.net)** | Set repo variable `VITE_TRELLIS_GENERATE_URL` to `https://toova-bff.onrender.com/api/trellis/generate`. |

**Mixed content:** Production (`https://toova.net`) cannot call `http://EC2_IP:8000` directly. Always use the Render BFF.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run generate:unfurls` | After `build`, write static OG HTML into `dist/` (needs Supabase service role) |

## Environment variables

See [`.env.example`](.env.example). Copy it to `.env.local` for local dev (gitignored).

| Variable | Description |
|----------|-------------|
| `TRELLIS_BFF_ORIGIN` | Render BFF origin for the Vite dev proxy (local only, not committed). Defaults to `https://toova-bff.onrender.com`. |
| `VITE_TRELLIS_GENERATE_URL` | HTTPS endpoint baked into production builds; optional override in dev. |
| `VITE_BASE_PATH` | Base URL path for assets. Use `/` for the custom domain (`toova.net`). |

## Deployment

The site deploys to GitHub Pages on every push to `main` (and on unfurl refresh) via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

1. In the repo, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Optionally set `VITE_TRELLIS_GENERATE_URL` under **Settings → Secrets and variables → Actions → Variables** so model import works in production.

### Custom domain (DNS)

Point `toova.net` at **GitHub Pages** (not Cloudflare Workers):

- Apex: A records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `www`: CNAME to `<user>.github.io`
- In **Settings → Pages**, add the custom domain and enable HTTPS

Until DNS serves Pages directly, static unfurl files only exist on the `*.github.io` origin.

### Link previews (static unfurls)

Deep links (`/r/…`, `/u/…`, `/u/…/r/…`) get **static HTML** with Open Graph tags generated into the Pages artifact after each build (`scripts/generate-static-unfurls.mjs`). OG images are baked as `og.jpg` next to each page (Storage buckets stay private).

Expect ~1–3 minutes after creating/revoking a share (or changing public visibility) before chat apps show the new card. Revoked links disappear from the next successful Pages deploy; third-party caches may linger.

**GitHub Actions secrets** for [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (CI-only; lists active shares/public pages and downloads thumbnails)

**Supabase Edge Function** `request-unfurl-deploy` (call after share create/revoke and public visibility changes):

- Secrets: `GITHUB_UNFURL_PAT` (PAT with `actions:write` on this repo), `GITHUB_REPO` (`owner/toova-web`)
- Deploy: `supabase functions deploy request-unfurl-deploy`
- Triggers `repository_dispatch` type `unfurl-refresh` → Pages rebuild

The former Cloudflare Worker path is deprecated; see [`worker/README.md`](worker/README.md).

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
scripts/      Build utilities (including static unfurl generation)
worker/       Deprecated Cloudflare OG gateway (reference only)
supabase/     SQL migrations and Supabase config
```
