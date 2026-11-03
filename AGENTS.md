# toova-web — agent guide

React + Vite + `@react-three/fiber` room designer. Auth/data via Supabase; mesh generation via Render BFF (`/api/trellis/*`); link previews via Cloudflare Worker.

Parent map: [`../AGENTS.md`](../AGENTS.md). Human setup/deploy: [`README.md`](README.md).

## Layout

```
src/
  App.tsx, store.ts     # shell + zustand room/item state (large hubs)
  ui/                   # pages, designer chrome, kit/ design system
  scene/                # R3F room mesh, lighting, weather, post
  furniture/            # builtin kinds + ImportedModel + registry
  interaction/          # drag, collision, hanging placement, shortcuts
  lib/                  # APIs, geometry, gallery, billing helpers, Trellis client
  hooks/, context/      # auth, gallery, room layout, shopping catalog
  embed/, legal/, visual/
supabase/               # migrations, SQL, edge functions (shared with iOS)
worker/                 # OG / deep-link gateway (wrangler)
worker-storage/         # R2 ingest helper worker
docs/                   # product/spec (agentic room, OAuth, child safety)
packages/room-engine/   # shared room-engine package
```

Hot dirs with their own guides: [`src/scene/AGENTS.md`](src/scene/AGENTS.md), [`src/lib/AGENTS.md`](src/lib/AGENTS.md), [`src/furniture/AGENTS.md`](src/furniture/AGENTS.md), [`src/ui/AGENTS.md`](src/ui/AGENTS.md).

## Gotchas

- **Routing** is a tiny custom pathname router (`hooks/useRoute.ts`), not react-router.
- **SEO:** marketing copy/meta live in `src/lib/seo/` + `src/content/`. `npm run build` runs Playwright prerender (`scripts/prerender.mjs`) so each SEO path gets real HTML in `dist/`. Do not revive the old `cp index.html` deploy loop. Off-site checklist: `docs/seo-offsite-checklist.md`.
- **Trellis:** wake → poll → generate through BFF only. Client helpers in `src/lib/trellisApi.ts` / related; never call EC2 from the browser.
- **Env:** copy `.env.example` → `.env.local`. `TRELLIS_BFF_ORIGIN` is Vite-proxy only (not `VITE_*`). Production bake uses `VITE_TRELLIS_GENERATE_URL`.
- **Schema changes:** prefer `supabase/migrations/`; one-off SQL samples also under `supabase/sql/`.
- **Edge functions** under `supabase/functions/` hold billing, App Store JWS, push, USDZ export — secrets via `supabase secrets`, not Vite.
- **OG Worker** intercepts `/r/*`, `/u/*`, `/og/*`. Deploy from `worker/` with wrangler; needs `SUPABASE_SERVICE_ROLE_KEY`.
- Ignore stale `graphify-out/` if present.

## Commands

```bash
npm install
cp .env.example .env.local   # edit as needed
npm run dev                  # http://localhost:5173
npm run typecheck
npm test
npm run test:e2e
npm run build                # vite + prerender (needs Playwright chromium)
npm run build:web            # vite only (skip prerender)
```

## Specs worth opening on demand

- `docs/agentic-room-generation-spec.md`
- `docs/oauth-setup.md`
- `docs/seo-offsite-checklist.md`
- `../toova-bff/docs/trellis-frontend-contract.md`
