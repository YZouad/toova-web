# Product: Toova

**Last updated:** 2026-09-03
**Method:** codebase scan + conversation

## Product Identity
- **One-liner:** A user drags furniture into a 3D model of their room — including AI-generated 3D models built from a photo or product link — arranges it until the layout feels right, then buys the real pieces through affiliate links to actual retailers.
- **Category:** consumer 3D design tool + affiliate commerce
- **Product type:** B2C
- **Collaboration:** single-player room design, with a public/social layer on top (rooms can be shared and browsed in a public gallery with likes)

## Business Model
- **Monetization today:** affiliate commissions on purchases made through curated/catalog products (`click_affiliate` is already an explicit GA4 event — this is a primary revenue signal, not incidental)
- **Monetization on the roadmap:** a paid subscription tier (Pro rendering, more AI model generations per period) — not yet built; no billing integration exists in the codebase
- **Pricing tiers:** none implemented yet (Free only, implicitly)
- **Billing integration:** none detected (no Stripe/Paddle in `package.json`)

## Tech Stack
- **Primary language:** TypeScript
- **Framework:** React 18 + Vite, 3D scene via Three.js / `@react-three/fiber` / `@react-three/drei`
- **Database:** Supabase (Postgres) — auth, data, storage
- **Background jobs:** none in this repo; AI 3D generation ("Trellis") runs on a separate EC2 instance, reached through a Render BFF (`toova-bff.onrender.com`) that wakes the instance, polls status, then generates
- **Edge/CDN:** Cloudflare Worker (`worker/`, `toova-og-gateway`) injects Open Graph tags for link previews on `/r/*`, `/u/*`, `/og/*`; static assets served from `assets.toova.net` (R2)
- **Deployment:** GitHub Pages (`toova.net`), deployed on push to `main`
- **Module organization:** `src/ui` (pages/components), `src/lib` (business logic, one file per concern), `src/hooks`, `src/context`, `src/scene`/`src/furniture`/`src/interaction`/`src/visual` (3D rendering), `src/store.ts` (Zustand global state)

## Value Mapping

### Primary Value Action
**Room created** — a user builds a 3D room layout (floor plan + placed furniture/decor). If this drops to zero, the product has failed. Confirmed by the user as the core metric.

### Core Features (directly deliver value)
1. **Room design (floor plan + furniture placement)** — the primary loop; `FloorPlanEditor`, `Designer`, `store.ts` room state, `roomGeometry`/`floorPlanGeometry`
2. **AI 3D model import (Trellis pipeline)** — turns a photo/description into a placeable 3D model (`ImportModelModal`, `trellisApi`, `conversion_jobs` table); differentiates Toova from a plain catalog-only planner
3. **Shopping checklist + curated catalog + affiliate purchase** — the monetization loop; users build a room checklist, browse curated products, and click through to buy (`ChecklistPage`, `shoppingCatalog`, `purchaseCart`, `affiliateLinks`) — explicitly called out as very important alongside room creation

### Supporting Features (enable core actions)
1. **Public gallery + room sharing** (`GalleryPage`, `PublicRoomPage`, `SharedRoomPage`, `roomShares`, `/r/…` and `/u/…` links) — discovery and social proof that drives new room creation and catalog exposure
2. **Guest mode** (`guestDesignSnapshot`, `GuestImportAuthModal`) — lets a user design a room before creating an account, lowering the barrier to the primary value action
3. **Admin console** (`AdminConsole`, `AdminPortal`, `useAdminStats`, `AdminShoppingPanel`) — catalog and platform management, not user-facing value

## Entity Model

### Users
- **ID format:** Supabase auth UUID
- **Auth methods:** email + Google OAuth (per `docs/oauth-setup.md`), plus an anonymous/guest mode that can later convert to an account
- **Roles:** standard user, admin (`AdminConsole`/`AdminPortal` gated separately)
- **Multi-account:** no — one person, one account

### Accounts
- Not applicable. This is a pure B2C product with no organizations, workspaces, or team structure. All entities (rooms, checklists, purchases) belong directly to a user (or to an anonymous guest session before signup).

## Group Hierarchy

Not applicable — no B2B group/account hierarchy exists or is planned. All tracking is at the user level. If the roadmap subscription tier ever introduces family/shared plans, this section should be revisited.

## Current State
- **Existing tracking:** Google Analytics 4 only (`src/lib/analytics.ts`, gtag.js), firing: `page_view`, `login`, `sign_up`, `create_room`, `add_to_design`, `share_room`, `click_affiliate`. No user identify/traits calls, no CDP, nothing wired for server-side/edge events (Worker, BFF).
- **Documentation:** none beyond the code itself — no tracking plan exists prior to this file
- **Known issues / gaps observed in code (not yet confirmed with user — flagged for the audit phase):**
  - No tracking on the shopping checklist or purchase-cart flow (checklist creation, item add/remove, checkout) despite it being called out as very important to the business
  - No tracking on the AI 3D-generation pipeline (Trellis wake → status → generate → import), including failures/timeouts on the EC2-backed BFF
  - No tracking on catalog/gallery browsing (search, filter, view, like) — `designerSearch`, `galleryCatalog`, `catalogEngagement` exist as code but nothing confirms they're instrumented
  - No user identify call — GA4 events are anonymous/session-based only, which will make user-level funnels and the future subscription-tier analysis hard

## Integration Targets
| Destination | Purpose | Priority |
|-------------|---------|----------|
| Google Analytics 4 | Sole product-analytics destination — existing install, kept in place rather than adding a new tool to the stack. | High |

**Destination decision:** PostHog was evaluated and briefly implemented (2026-09-03) but reverted the same day — the founder's call was to stay on GA4 rather than add another vendor on top of the existing stack (Cloudflare, Supabase, AWS). The tracking plan, event catalog, and property design from that phase carry forward unchanged; only the transport (gtag.js instead of posthog-js) and two GA4-specific constraints changed:
- **Event names cannot contain periods.** GA4 event names are letters/digits/underscores only. The `object.action` naming convention (`room.created`) is flattened to `object_action` (`room_created`) for this destination.
- **No PII in event params or user properties.** Google's gtag/Measurement Protocol terms prohibit sending email, name, or other identifying values to GA4 — this is stricter than the `pii_policy: traits_only` decision made for PostHog. `identifyUser()` sends only Supabase's opaque `user_id` plus non-identifying traits (`auth_method`, `is_guest`, `subscription_tier`, `created_at`); email and display name are not sent anywhere.

Mixpanel (1M events/mo free) and Amplitude (2M events/mo free) remain viable alternatives if GA4's weaker event-property support and lack of a real identify/cohort model become a blocker later.

## Codebase Observations
- **Feature areas inferred (from `src/ui`):** room design/editor, AI model import, shopping checklist + catalog + checkout, public gallery + sharing, profile, admin console, marketing/landing pages, contact/feedback
- **Entity model inferred (from `supabase/migrations`):** `rooms`, `room_items`, `profiles`, `room_shares`, gallery catalog + engagement (likes), shopping catalog + checklist categories + curated products, `conversion_jobs` (AI generation), catalog reports (moderation)
