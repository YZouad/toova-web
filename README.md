# Toova Web

Web frontend for **Toova** — a 3D room planner where users design spaces, place furniture, and import AI-generated 3D models.

Built with React, Three.js (`@react-three/fiber`), Vite, and Supabase.

**Live site:** https://yzouad.github.io/toova-web/

## Local development

```bash
npm install
cp .env.example .env.local   # then edit with your Trellis host
npm run dev
```

Open http://localhost:5173

### Trellis (3D model import)

Trellis is **not** hardcoded in the repo. Configure it per environment:

| Environment | How it works |
|-------------|--------------|
| **Local dev** | Copy `.env.example` → `.env.local` and set `TRELLIS_UPSTREAM_ORIGIN=http://YOUR_HOST:8000`. Vite proxies `/api/trellis/generate` to that server. |
| **Local dev (alt)** | Set `VITE_TRELLIS_GENERATE_URL` to a direct HTTPS Trellis or BFF URL instead of using the proxy. |
| **Production (GitHub Pages)** | Set repo variable `VITE_TRELLIS_GENERATE_URL` under **Settings → Secrets and variables → Actions → Variables** (used at build time). |

If neither `TRELLIS_UPSTREAM_ORIGIN` nor `VITE_TRELLIS_GENERATE_URL` is set, the app runs but model import will fail until you configure one of the above.

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
| `VITE_BASE_PATH` | Base URL path for assets. Set to `/toova-web/` for GitHub Pages. |

## Deployment

The site deploys to GitHub Pages on every push to `main` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

1. In the repo, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Optionally set `VITE_TRELLIS_GENERATE_URL` under **Settings → Secrets and variables → Actions → Variables** so model import works in production.

## Project layout

```
src/          React app and 3D scene
public/       Static assets (logo, demo videos)
supabase/     SQL migrations and Supabase config
scripts/      Utility scripts
```
