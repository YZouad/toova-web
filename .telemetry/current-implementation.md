# Current Implementation: Toova (toova-web)

**Scanned:** 2026-09-03

## SDK and Version
No analytics SDK package is installed (`package.json` has no `@segment/*`, `@amplitude/*`, `mixpanel-browser`, `posthog-js`, etc.). Tracking is a hand-rolled wrapper around Google Analytics 4's `gtag.js`, loaded at runtime via a dynamically-inserted `<script>` tag rather than an npm dependency.

## Initialization
`initAnalytics()` in `src/lib/analytics.ts` is called exactly once, from `src/main.tsx` at app boot, before React renders. It:
- No-ops (with a dev-only console message) if `VITE_GA_MEASUREMENT_ID` is unset
- Sets up `window.dataLayer` and a `window.gtag` shim
- Inserts the `gtag.js` script tag pointed at the configured measurement ID
- Calls `gtag('config', GA_ID, { send_page_view: false, ... })` — page views are sent explicitly rather than automatically, so the SPA controls exactly when they fire
- Enables `debug_mode` automatically in dev builds (surfaces events in GA Admin → DebugView)

## Client vs Server
Client-only. All 9 files that report events run in the browser (React components, hooks, and the Zustand store). No tracking calls exist in `worker/` (the Cloudflare OG-gateway Worker) or in `supabase/functions/` (glb-to-usdz, request-unfurl-deploy, sign-share-assets) — nothing server-side is instrumented.

## Call Routing
Centralized through a single internal `trackEvent(name, params)` function in `src/lib/analytics.ts`. Nothing outside that file calls `window.gtag()` or touches `window.dataLayer` directly — every consumer imports one of 7 named, typed wrapper functions (`trackPageView`, `trackLogin`, `trackSignUp`, `trackCreateRoom`, `trackAddToDesign`, `trackShareRoom`, `trackAffiliateClick`). This is a clean single-choke-point pattern: adding a new destination later means changing one file, not hunting through the codebase.

## Identity Management
None. There is no `identify()`-equivalent call anywhere in the codebase. The one `gtag('config', ...)` call passes only the measurement ID — no user ID, no traits. Every event is anonymous/session-scoped; nothing ties an event to a specific Supabase auth user id.

## Environment Variables
- `VITE_GA_MEASUREMENT_ID` — the GA4 measurement ID. Public (safe to expose client-side). Set locally via `.env.local` and in the GitHub Actions deploy environment for production (per `.env.example` and the README's deployment section).

## Error Handling
Fully non-blocking, fails silent everywhere:
- `initAnalytics()` no-ops if the measurement ID is missing (dev-only console.info, no error)
- The script tag's `onerror` handler logs a `console.warn` suggesting ad blockers, but does not retry or throw
- `trackPageView()` and `trackEvent()` both no-op if `GA_ID` or `window.gtag` aren't set — no exceptions can propagate from a tracking call into the app

## Shutdown / Flush
Not applicable to this architecture. `gtag.js` queues calls into `window.dataLayer` and ships them on its own schedule; there's no explicit flush or shutdown logic in the codebase (nothing to add, since there's no buffered custom queue to drain).

## What Works
- The single-choke-point pattern (`trackEvent()` as the only thing that touches `window.gtag`) is worth preserving — a real SDK swap (e.g. to PostHog) only touches `src/lib/analytics.ts` and its 7 call sites, not the 9 files that currently import from it.
- Typed wrapper function signatures (e.g. `trackAffiliateClick(params: { retailer?: string; product_id?: string; ... })`) already give each event a defined property shape, which is a reasonable base to extend rather than replace.
- Fully non-blocking/fail-silent error handling means tracking can never break the app — a pattern the next implementation should keep.
