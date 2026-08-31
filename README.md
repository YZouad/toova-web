# Toova Web

Web frontend for Toova, a 3D room planner where users design spaces, place furniture, and import AI-generated 3D models.

Built with React, Three.js (`@react-three/fiber`), Vite, Cloudflare, and Supabase.

**Live site:** [https://toova.net](https://toova.net)

## Local development

```bash
npm install
cp .env.example .env.local   # then edit TRELLIS_BFF_ORIGIN if your BFF host differs
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Trellis (3D model import)

Trellis runs on EC2 and is reached through the Render BFF (`POST /api/trellis/wake`, `GET /api/trellis/status`, then `POST /api/trellis/generate`). Do not call the EC2 IP from the browser or the Vite proxy — the instance is idle-stopped and port 8000 is not open to laptops.


| Environment                               | How it works                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local dev**                             | Vite proxies `/api/trellis/`* → `TRELLIS_BFF_ORIGIN` (defaults to `https://toova-bff.onrender.com`). The client wakes Trellis and polls status before generate. |
| **Local dev (alt)**                       | Set `VITE_TRELLIS_GENERATE_URL` to a direct HTTPS BFF URL instead of using the Vite proxy (BFF must allow localhost CORS).                                      |
| **Production (GitHub Pages / toova.net)** | Set repo variable `VITE_TRELLIS_GENERATE_URL` to `https://toova-bff.onrender.com/api/trellis/generate`.                                                         |


**Mixed content:** Production (`https://toova.net`) cannot call `http://EC2_IP:8000` directly. Always use the Render BFF.

## Scripts


| Command                    | Description                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Start the Vite dev server                                                                             |
| `npm run build`            | Typecheck and build for production                                                                    |
| `npm run preview`          | Preview the production build locally                                                                  |
| `npm run typecheck`        | Run TypeScript without emitting files                                                                 |
| `npm run generate:unfurls` | Optional: write static OG HTML into `dist/` (unused in production; Cloudflare Worker serves previews) |




## Environment variables

See `[.env.example](.env.example)`. Copy it to `.env.local` for local dev (gitignored).


| Variable                    | Description                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `TRELLIS_BFF_ORIGIN`        | Render BFF origin for the Vite dev proxy (local only, not committed). Defaults to `https://toova-bff.onrender.com`. |
| `VITE_TRELLIS_GENERATE_URL` | HTTPS endpoint baked into production builds; optional override in dev.                                              |
| `VITE_BASE_PATH`            | Base URL path for assets. Use `/` for the custom domain (`toova.net`).                                              |




## Deployment

The site deploys to GitHub Pages on every push to `main` via `[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)`.

1. In the repo, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Optionally set `VITE_TRELLIS_GENERATE_URL` under **Settings → Secrets and variables → Actions → Variables** so model import works in production.



### Custom domain (DNS)

Point `toova.net` at **GitHub Pages** (apex A records / `www` CNAME). Cloudflare proxy can stay on; the OG Worker only intercepts `/r/`*, `/u/*`, and `/og/*`.

- Apex: A records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `www`: CNAME to `<user>.github.io`
- In **Settings → Pages**, add the custom domain and enable HTTPS

Until DNS serves Pages directly, the site is only on the `*.github.io` origin.

### Link previews (Cloudflare Worker)

Deep links (`/r/…`, `/u/…`, `/u/…/r/…`) are intercepted by the **toova-og-gateway** Worker (`worker/`). It fetches `index.html` from GitHub Pages, injects Open Graph tags, and returns HTTP 200 so chat apps unfurl immediately.

- Public room images: `https://assets.toova.net/…`
- Private share / profile images: `https://toova.net/og/r/:token` and `https://toova.net/og/u/:handle` (Worker streams from Storage)

Deploy: `cd worker && npx wrangler deploy` (secret `SUPABASE_SERVICE_ROLE_KEY`).

The former static unfurl generator (`scripts/generate-static-unfurls.mjs`) is unused in CI.

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

New projects should use `[supabase/sql/room_layout_schema.sql](supabase/sql/room_layout_schema.sql)`, which already includes these columns.

## Project layout

```
src/          React app and 3D scene
public/       Static assets (logo, demo videos)
scripts/      Build utilities (including static unfurl generation)
worker/       Deprecated Cloudflare OG gateway (reference only)
supabase/     SQL migrations and Supabase config
```

