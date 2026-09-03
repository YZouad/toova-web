# Instrumentation Guide — Toova

## Target: Google Analytics 4 (gtag.js, browser only)

Generated from `tracking-plan.yaml` v2 on 2026-09-03.

**v2 note:** v1 of this guide targeted PostHog. PostHog was implemented and reverted the same day — the founder's call was to stay on GA4 rather than add a second analytics vendor to an already-multi-tool stack (Cloudflare, Supabase, AWS). This version targets `gtag.js` directly, replacing the PostHog SDK wiring with the same architecture the codebase already had before that detour: a hand-rolled `gtag.js` loader, no npm dependency.

Toova is a client-only SPA (React + Vite) with no Node/Ruby/Python backend of its own — Supabase (Deno edge functions) and a Cloudflare Worker exist, but neither currently does anything analytics-related, and there's no natural home for server-side tracking calls today. This guide is scoped to **gtag.js in the browser**. The existing single-choke-point pattern (`trackEvent`/`track()` as the only thing that touches `window.gtag`), typed wrapper functions per event, and fully non-blocking/fail-silent error handling are all preserved from the prior implementation.

## SDK Setup

### Dependencies

None. `gtag.js` is loaded at runtime via a dynamically-inserted `<script>` tag, not an npm package — this matches how GA4 was already wired in this codebase before the tracking-plan work started (`current-implementation.md`).

### Initialization

```typescript
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function initAnalytics(): void {
  if (!GA_ID) {
    if (import.meta.env.DEV) console.info('[analytics] VITE_GA_MEASUREMENT_ID is not set — skipping');
    return;
  }
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      // The tracking plan removed blanket page_view tracking in favor of deliberate
      // feature-engagement events — GA4's own automatic page-view collection is
      // untouched by this (send_page_view only controls the app's *manual* calls,
      // and this app makes none), so this key is omitted rather than set to false.
      debug_mode: import.meta.env.DEV,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.onerror = () => console.warn('[analytics] gtag.js failed to load (ad blocker?)');
    document.head.appendChild(script);
  } catch (e) {
    console.warn('[analytics] GA4 failed to initialize', e);
  }
}
```

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_GA_MEASUREMENT_ID` | GA4 measurement ID (public, safe client-side). Set locally via `.env.local`, and in the GitHub Actions deploy environment for production. | Yes |

## The No-PII Rule (read this before writing any identify or track call)

Google's Analytics/gtag/Measurement Protocol terms prohibit sending **personally identifiable information** — email addresses, names, phone numbers, precise physical addresses, or anything else that identifies an individual — as an event parameter **or** a user property. This is a Google policy violation, not just a best practice, and can result in the property being disabled.

This is why `identifyUser()` below only ever sends GA4 a `user_id` (Supabase's opaque UUID — not identifying on its own) plus a small set of non-identifying traits (`auth_method`, `is_guest`, `subscription_tier`, `created_at`). `email` and `display_name` are in `tracking-plan.yaml`'s trait table only as a record that they were considered and explicitly excluded — they are never passed to `gtag()` anywhere in this codebase.

## Identity

GA4 has no `identify()` call in the CDP sense. The closest equivalent is GA4's **User-ID feature**: setting a `user_id` field ties subsequent events to that ID for cross-device/cross-session reporting, and `gtag('set', 'user_properties', {...})` attaches a small set of persistent, non-PII traits to the current user.

### Pattern

```typescript
export function identifyUser(
  userId: string,
  traits: {
    auth_method: 'email' | 'google' | 'facebook';
    role: 'user' | 'admin';
    is_guest: boolean;
    subscription_tier: 'free' | 'pro';
    created_at: string; // ISO 8601
  },
): void {
  // role drives the internal-user exclusion guard — set BEFORE the early return below,
  // and never sent to GA4 itself (see tracking-plan.yaml's note on the role trait).
  setInternalUser(traits.role === 'admin');
  if (isInternalUser || !GA_ID || typeof window.gtag !== 'function') return;
  try {
    window.gtag('set', { user_id: userId });
    window.gtag('set', 'user_properties', {
      auth_method: traits.auth_method,
      is_guest: traits.is_guest,
      subscription_tier: traits.subscription_tier,
      created_at: traits.created_at,
    });
  } catch (e) {
    console.warn('[analytics] identify failed', e);
  }
}
```

**Call this on login and signup**, once the Supabase user object is available — in Toova's case, from `App.tsx`, which is the one place `user`, `profile`, and the admin-role flag are all simultaneously in scope.

### group()

Not applicable. Toova is B2C with no account/organization hierarchy (`tracking-plan.yaml`'s `groups: []`), and GA4 has no native group-analytics concept regardless.

### Logout / reset

```typescript
export function resetIdentity(): void {
  if (!GA_ID || typeof window.gtag !== 'function') return;
  try {
    window.gtag('set', { user_id: undefined });
    window.gtag('set', 'user_properties', {
      auth_method: undefined,
      is_guest: undefined,
      subscription_tier: undefined,
      created_at: undefined,
    });
  } catch (e) {
    console.warn('[analytics] reset failed', e);
  }
}
```

Call on logout, so a shared device doesn't keep attributing events to the previous user.

## track()

### Syntax

```typescript
gtag('event', eventName: string, eventParams?: Record<string, unknown>)
```

### GA4 constraints (all enforced by convention in this codebase, not by the SDK)

- **Event names:** letters, digits, and underscores only — **no periods** — must start with a letter, ≤40 characters. This is why the tracking plan's `object.action` convention (`room.created`) is flattened to `object_action` (`room_created`) for every event. See `tracking-plan.yaml`'s `naming_convention` note.
- **Event parameter names:** same character rules as event names, ≤40 characters.
- **Parameter values:** strings are truncated at 100 characters by GA4's collection; numbers and booleans are unaffected.
- **Parameter count:** up to 25 parameters per event call.
- **No PII in params**, same rule as identify — see above.
- **Custom parameters need registration to appear in standard reports.** GA4 collects any custom event parameter you send, but it only becomes usable in the standard UI (Explore, funnels, audiences) once registered as a **Custom Dimension** (string/general) or **Custom Metric** (numeric) in GA4 Admin → Custom definitions. Until then, the raw values are visible in **DebugView** and in BigQuery exports (if linked) but not in most report UIs. After the first implementation pass, register: `room_id`, `template_id`, `kind`, `source`, `job_id`, `source_type`, `failure_reason`, `category`, `retailer`, `product_id`, `is_curated`, `context`, `query`, `role` (the share-role property, not the user trait).

### Representative examples

```typescript
function track(name: EventName, properties?: Record<string, unknown>): void {
  if (isInternalUser || !GA_ID || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, properties);
  } catch (e) {
    console.warn('[analytics] track failed', e, name);
  }
}

// CORRECTED 2026-09-03: trackCreateRoom is not orphaned — it fires live today
// (useRoomLayout.ts:363) but with zero properties. This call site needs to be
// enriched with room_id/template_id/is_guest, not added from scratch.
export function trackRoomCreated(params: {
  room_id: string;
  template_id?: string;
  is_guest: boolean;
}): void {
  track(EVENTS.ROOM_CREATED, params);
}

export function trackAffiliateClicked(params: {
  retailer?: string;
  product_id: string;
  is_price_approximate: boolean;
  source: 'checklist_checkout' | 'product_drawer' | 'purchase_review' | 'shared_tobuy';
}): void {
  track(EVENTS.PRODUCT_AFFILIATE_CLICKED, params);
}
```

One function per event, generated from the full `tracking-plan.yaml` — see `.telemetry/instrument.md`'s companion output, `src/lib/analytics.ts`, for the complete set.

## Architecture

- **Client vs server:** entirely client-side, matching the existing codebase (`current-implementation.md`). No server-side Measurement Protocol calls — none of Toova's Supabase edge functions or the Cloudflare Worker currently do anything analytics-related, and there's no case in this plan (yet) that needs server-side attribution.
- **Call routing:** single choke point. Every consumer imports a typed wrapper (`trackRoomCreated`, `trackDesignItemAdded`, etc.) from `src/lib/analytics.ts`; nothing outside that file touches `window.gtag` or `window.dataLayer` directly. A future destination swap only touches this one file.
- **Shutdown/flush:** not applicable — `gtag.js` queues into `window.dataLayer` and ships on its own schedule; there is no buffered custom queue to drain.
- **Error handling:** fully non-blocking, fail-silent everywhere. `initAnalytics()` no-ops if the measurement ID is missing; the script tag's `onerror` logs a warning without retrying or throwing; `track()`/`identifyUser()`/`resetIdentity()` all no-op if `GA_ID` or `window.gtag` aren't set, and wrap their body in try/catch so a tracking failure can never propagate into the app.
- **Internal-user exclusion:** `isInternalUser` is a module-level flag, set by `identifyUser()`/`setInternalUser()` from the caller's `role` trait. `track()` and `identifyUser()` both check it before doing anything — admins are excluded at the source, not filtered in GA4 afterward.

## Verification

- **DebugView.** In GA4 Admin → DebugView, events from a browser with `debug_mode: true` (automatic in dev builds per the init snippet above) appear in real time, including all custom parameters — this is the fastest way to confirm an event fires with the right shape before it's usable in standard reports.
- **Delivery latency.** `gtag.js` batches and sends on its own schedule (typically within a few seconds, sooner for the first event in a session) — there is no explicit flush to call.
- **Environment isolation.** Toova has one GA4 property (`VITE_GA_MEASUREMENT_ID`), not separate dev/prod properties. `debug_mode` in dev builds routes those events to DebugView without polluting standard reports, which is GA4's normal way of separating dev traffic when a second property isn't warranted at this stage. If dev traffic volume becomes a problem, the next step is a second GA4 property for non-production builds.
- **Custom dimension registration.** After the first deploy, go to GA4 Admin → Custom definitions and register the parameter list under "Custom parameters need registration" above — until then, those values exist in DebugView/BigQuery but won't show up in standard report UIs.
- **Failed delivery.** `gtag.js` calls are fire-and-forget from the app's perspective; a failed request (ad blocker, network) is invisible to the app by design (this is why every wrapper function is fail-silent) but visible as a blocked/failed request in DevTools → Network, filtered to `google-analytics.com` or `googletagmanager.com`.

## Rollout Strategy

Everything at once — this is a same-day revert-and-reimplement of an already-scoped plan, not a fresh rollout requiring a phased ramp. Deploy, confirm the event shape in DebugView for each of the 15 events, then register custom dimensions once real traffic confirms the parameter list is stable.
