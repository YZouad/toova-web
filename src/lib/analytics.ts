// src/lib/analytics.ts
// GA4 (gtag.js) implementation. v1 of this file (2026-09-03) targeted PostHog — that was
// implemented and reverted the same day per the founder's call to keep the stack smaller
// (already running Cloudflare, Supabase, AWS). The event catalog, properties, and every
// call site elsewhere in src/ are unchanged from that plan; only the transport here
// changed, from posthog-js back to a hand-rolled gtag.js loader (matching what this file
// looked like before the tracking-plan work started — see .telemetry/current-implementation.md).
//
// Generated from .telemetry/tracking-plan.yaml v2 (2026-09-03) by the
// product-tracking-implement-tracking skill. Regenerate/extend by re-running that skill
// after tracking-plan.yaml changes, or hand-edit following the same pattern below.
//
// GA4 constraints this file exists to respect (see .telemetry/instrument.md for detail):
//  - Event/param names: letters, digits, underscores only, must start with a letter,
//    ≤40 chars — no periods. The `object.action` names from the design phase are
//    flattened to `object_action` here (room.created -> room_created).
//  - No PII, ever, in event params OR user properties (Google's gtag/Measurement
//    Protocol terms). identifyUser() intentionally does not accept email or
//    display_name — GA4 gets a user_id (Supabase's opaque UUID) and a small set of
//    non-identifying user properties only.
//  - Up to 25 event params per call; string param values are truncated at 100 chars
//    by GA4's collection.
//  - Custom event params only show up in GA4's standard reports once registered as
//    Custom Dimensions/Metrics in GA4 Admin — DebugView shows them immediately either way.

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let isInternalUser = false;
let currentRoomId: string | null = null;

/** Every event name in the target tracking plan (.telemetry/tracking-plan.yaml). */
export const EVENTS = {
  ACCOUNT_SIGNED_UP: 'account_signed_up',
  ACCOUNT_LOGGED_IN: 'account_logged_in',
  ROOM_CREATED: 'room_created',
  DESIGN_ITEM_ADDED: 'design_item_added',
  MODEL_GENERATION_STARTED: 'model_generation_started',
  MODEL_GENERATION_SUCCEEDED: 'model_generation_succeeded',
  MODEL_GENERATION_FAILED: 'model_generation_failed',
  CHECKLIST_ITEM_ADDED: 'checklist_item_added',
  PRODUCT_AFFILIATE_CLICKED: 'product_affiliate_clicked',
  ROOM_SHARED: 'room_shared',
  ROOM_LIKED: 'room_liked',
  CATALOG_SEARCHED: 'catalog_searched',
  PLAN_UPGRADED: 'plan_upgraded',       // roadmap — no call site until billing exists
  PLAN_CANCELLED: 'plan_cancelled',     // roadmap — no call site until billing exists
  LIMIT_REACHED: 'limit_reached',       // roadmap — no call site until billing exists
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Supabase auth providers Toova actually offers (AuthPage.tsx: email, Google, Facebook). */
export type AuthMethod = 'email' | 'google' | 'facebook';

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
      // feature-engagement events. This app makes no manual page_view calls, and GA4's
      // own automatic page-view collection is untouched by this config.
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

/** Call once whenever the signed-in user's admin status is known (role trait, exclusion guard). */
export function setInternalUser(isInternal: boolean): void {
  isInternalUser = isInternal;
}

/**
 * Call whenever the "current room" changes (Toova has no GA4 group concept — this is
 * a lightweight equivalent used to attach room_id to room-scoped events without threading
 * it through every call site in src/store.ts and elsewhere).
 */
export function setCurrentRoom(roomId: string | null): void {
  currentRoomId = roomId;
}

/**
 * GA4's closest equivalent to identify(): a user_id plus a small set of non-identifying
 * user properties. No email, no display_name — see the file header and
 * .telemetry/instrument.md's "No-PII Rule" section for why those are never accepted here.
 */
export function identifyUser(
  userId: string,
  traits: {
    auth_method: AuthMethod;
    role: 'user' | 'admin';
    is_guest: boolean;
    subscription_tier: 'free' | 'pro';
    created_at: string; // ISO 8601
  },
): void {
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

/** Call on logout, so a shared device doesn't keep attributing events to the previous user. */
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

/** Single internal choke point — every event below goes through this. Not exported. */
function track(name: EventName, properties?: Record<string, unknown>): void {
  if (isInternalUser || !GA_ID || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, properties);
  } catch (e) {
    console.warn('[analytics] capture failed', e, name);
  }
}

// -- Lifecycle --

export function trackSignedUp(params: {
  user_id: string;
  method: AuthMethod;
  converted_from_guest: boolean;
}): void {
  track(EVENTS.ACCOUNT_SIGNED_UP, params);
}

export function trackLoggedIn(params: { user_id: string; method: AuthMethod }): void {
  track(EVENTS.ACCOUNT_LOGGED_IN, params);
}

// -- Core value --

export function trackRoomCreated(params: {
  room_id: string;
  template_id?: string;
  is_guest: boolean;
}): void {
  track(EVENTS.ROOM_CREATED, params);
}

export function trackDesignItemAdded(params: {
  kind: string;
  source: 'library' | 'ai_import' | 'curated_product' | 'hanging_decor';
  curated_product_id?: string;
}): void {
  track(EVENTS.DESIGN_ITEM_ADDED, { room_id: currentRoomId, ...params });
}

export function trackModelGenerationStarted(params: {
  job_id: string;
  source_type: 'photo' | 'text_prompt' | 'product_link';
}): void {
  track(EVENTS.MODEL_GENERATION_STARTED, { room_id: currentRoomId, ...params });
}

export function trackModelGenerationSucceeded(params: {
  job_id: string;
  duration_ms: number;
}): void {
  track(EVENTS.MODEL_GENERATION_SUCCEEDED, { room_id: currentRoomId, ...params });
}

export function trackModelGenerationFailed(params: {
  job_id: string;
  failure_reason: 'wake_timeout' | 'generation_error' | 'upload_error' | 'unknown';
}): void {
  track(EVENTS.MODEL_GENERATION_FAILED, { room_id: currentRoomId, ...params });
}

export function trackChecklistItemAdded(params: {
  // The checklist can be open without an active design workspace (e.g. a guest who
  // hasn't started designing yet), so useShoppingCatalog.ts's own room-scope value is
  // more reliable here than the module-level currentRoomId — pass it explicitly and it
  // overrides the auto-injected value below (object spread order).
  room_id?: string;
  product_id?: string;
  category: string;
  is_curated: boolean;
}): void {
  track(EVENTS.CHECKLIST_ITEM_ADDED, { room_id: currentRoomId, ...params });
}

export function trackAffiliateClicked(params: {
  retailer?: string;
  // Optional: SharedToBuyPanel's "approximate" offers resolve to a generic retailer
  // search link, not a specific catalog product, so there's no product_id to attach.
  product_id?: string;
  is_price_approximate: boolean;
  source:
    | 'checklist_checkout'
    | 'product_drawer'
    | 'purchase_review'
    | 'shared_tobuy'
    | 'designer_checklist_ticker'
    | 'designer_checklist_mobile';
}): void {
  track(EVENTS.PRODUCT_AFFILIATE_CLICKED, params);
}

// -- Collaboration --

export function trackRoomShared(params: { room_id: string; role: 'viewer' | 'editor' }): void {
  track(EVENTS.ROOM_SHARED, params);
}

export function trackRoomLiked(params: { room_id: string }): void {
  track(EVENTS.ROOM_LIKED, params);
}

// -- Navigation --

export function trackCatalogSearched(params: {
  query: string;
  results_count: number;
  context: 'designer_library' | 'gallery' | 'checklist';
}): void {
  track(EVENTS.CATALOG_SEARCHED, params);
}

// -- Billing (roadmap — no call sites yet; no billing system exists in the codebase.
//    Wire these in when the Pro tier ships, following the pattern above.) --

export function trackPlanUpgraded(params: { from_plan: 'free' | 'pro'; to_plan: 'free' | 'pro' }): void {
  track(EVENTS.PLAN_UPGRADED, params);
}

export function trackPlanCancelled(params: { from_plan: 'pro'; reason?: string }): void {
  track(EVENTS.PLAN_CANCELLED, params);
}

export function trackLimitReached(params: { limit_type: 'ai_generations' | 'render_quality' }): void {
  track(EVENTS.LIMIT_REACHED, params);
}
