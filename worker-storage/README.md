# Toova R2 storage worker

Copies currently-public catalog and room files from Supabase Storage into
`toova-public` (served at `https://assets.toova.net`).

```bash
cd worker-storage
npm ci
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
npx wrangler r2 bucket cors set toova-public --file cors-public.json -y
```

The app calls `https://storage.toova.net/v1/ingest` and `/v1/unmirror`
with the user's Supabase JWT. Object keys must live under `{auth.uid()}/`.
