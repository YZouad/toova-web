// src/lib/analytics.ts
// GA4 (gtag.js) plus first-party collector fan-out. Every product event still
// goes through private track(). Consent, internal-user exclusion, and identity
// readiness are enforced here so admin traffic cannot leak before role resolution.

import {
  EVENTS,
  dimensionFromProperties,
  inferDevice,
  newEventId,
  parseUtm,
  sanitizeEventProperties,
  sanitizeRoute,
  type AnalyticsAuthMethod,
  type EventName,
  type NormalizedAnalyticsEvent,
} from './analyticsSchema';
import {
  enqueueAnalyticsEvent,
  flushAnalyticsQueue,
  resetAnalyticsQueueForTests,
} from './analyticsQueue';
import { hasAcceptedAnalytics } from './cookieConsent';
import { supabase } from './supabase';

export { EVENTS, type EventName } from './analyticsSchema';

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();
const SESSION_KEY = 'toova-analytics-session';
const ANON_KEY = 'toova-analytics-anon';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let analyticsInitialized = false;
let isInternalUser = false;
let identityReady = true;
let currentRoomId: string | null = null;
let currentAuthMethod: AnalyticsAuthMethod | null = null;
let sessionStartedForId: string | null = null;
const pending: Array<{ name: EventName; properties?: Record<string, unknown> }> = [];

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export type AuthMethod = AnalyticsAuthMethod;

type SessionRecord = { id: string; lastSeen: number };

function readStorage(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function getAnonymousId(): string {
  const existing = readStorage(typeof localStorage === 'undefined' ? undefined : localStorage, ANON_KEY);
  if (existing && existing.length >= 8) return existing;
  const id = newEventId();
  writeStorage(typeof localStorage === 'undefined' ? undefined : localStorage, ANON_KEY, id);
  return id;
}

function readSession(): SessionRecord | null {
  const raw = readStorage(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    if (parsed?.id && typeof parsed.lastSeen === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeSession(record: SessionRecord): void {
  writeStorage(
    typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
    SESSION_KEY,
    JSON.stringify(record),
  );
}

function getOrCreateSession(): { id: string; isNew: boolean } {
  const now = Date.now();
  const current = readSession();
  if (current && now - current.lastSeen < SESSION_TIMEOUT_MS) {
    const next = { id: current.id, lastSeen: now };
    writeSession(next);
    return { id: next.id, isNew: false };
  }
  const created = { id: newEventId(), lastSeen: now };
  writeSession(created);
  return { id: created.id, isNew: true };
}

function currentContext() {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const referrer = typeof document === 'undefined' ? '' : document.referrer;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return {
    route: sanitizeRoute(typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`),
    referrer: sanitizeRoute(referrer) ?? null,
    device: inferDevice(ua),
    auth_method: currentAuthMethod,
    ...parseUtm(search),
  };
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function emitFirstParty(name: EventName, properties?: Record<string, unknown>): void {
  const session = getOrCreateSession();
  if (session.isNew || sessionStartedForId !== session.id) {
    sessionStartedForId = session.id;
    if (name !== EVENTS.SESSION_STARTED) {
      queueNormalized(EVENTS.SESSION_STARTED, { page_path: currentContext().route ?? '/' });
    }
  }
  queueNormalized(name, properties);
  void flushSoon();
}

function queueNormalized(name: EventName, properties?: Record<string, unknown>): void {
  const sanitized = sanitizeEventProperties(properties);
  const context = currentContext();
  const event: NormalizedAnalyticsEvent = {
    event_id: newEventId(),
    name,
    occurred_at: new Date().toISOString(),
    session_id: getOrCreateSession().id,
    anonymous_id: getAnonymousId(),
    room_id: dimensionFromProperties(sanitized, 'room_id'),
    job_id: dimensionFromProperties(sanitized, 'job_id'),
    product_id: dimensionFromProperties(sanitized, 'product_id'),
    properties: sanitized,
    context,
  };
  enqueueAnalyticsEvent(event);
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function flushSoon(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void (async () => {
      const token = await accessToken();
      await flushAnalyticsQueue({ accessToken: token, keepalive: true });
    })();
  }, 20);
}

function emitGa4(name: EventName, properties?: Record<string, unknown>): void {
  if (!GA_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, properties);
  } catch (e) {
    console.warn('[analytics] capture failed', e, name);
  }
}

/** Single internal choke point — every event below goes through this. Not exported. */
function track(name: EventName, properties?: Record<string, unknown>): void {
  if (!identityReady) {
    pending.push({ name, properties });
    return;
  }
  if (isInternalUser) return;
  if (!hasAcceptedAnalytics()) return;
  emitGa4(name, properties);
  emitFirstParty(name, properties);
}

function flushPending(): void {
  if (!identityReady) return;
  const queued = pending.splice(0, pending.length);
  for (const item of queued) track(item.name, item.properties);
}

export function initAnalytics(): void {
  if (!hasAcceptedAnalytics()) return;
  if (!analyticsInitialized) {
    analyticsInitialized = true;
    if (GA_ID && typeof window !== 'undefined') {
      try {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag(...args: unknown[]) {
          window.dataLayer.push(args);
        };
        window.gtag('js', new Date());
        window.gtag('config', GA_ID, {
          send_page_view: false,
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
  }
  const session = getOrCreateSession();
  if (session.isNew || sessionStartedForId !== session.id) {
    sessionStartedForId = session.id;
    track(EVENTS.SESSION_STARTED, { page_path: currentContext().route ?? '/' });
  }
}

export function setInternalUser(isInternal: boolean): void {
  isInternalUser = isInternal;
}

/** While admin status is unknown, hold events so admin traffic cannot leak. */
export function setAnalyticsIdentityReady(ready: boolean): void {
  identityReady = ready;
  if (ready) flushPending();
}

export function setCurrentRoom(roomId: string | null): void {
  currentRoomId = roomId;
}

export function identifyUser(
  userId: string,
  traits: {
    auth_method: AuthMethod;
    role: 'user' | 'admin';
    is_guest: boolean;
    subscription_tier: 'free' | 'pro';
    created_at: string;
  },
): void {
  currentAuthMethod = traits.auth_method;
  setInternalUser(traits.role === 'admin');
  setAnalyticsIdentityReady(true);
  if (isInternalUser || !GA_ID || typeof window.gtag !== 'function') return;
  if (!hasAcceptedAnalytics()) return;
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

export function resetIdentity(): void {
  currentAuthMethod = null;
  isInternalUser = false;
  setAnalyticsIdentityReady(true);
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

export function trackPageView(params?: { path?: string; title?: string; referrer?: string }): void {
  const path = params?.path
    ?? (typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`);
  track(EVENTS.PAGE_VIEW, {
    page_path: path,
    page_title: params?.title ?? (typeof document === 'undefined' ? '' : document.title),
    page_referrer: params?.referrer ?? (typeof document === 'undefined' ? '' : document.referrer),
    page_location: typeof window === 'undefined' ? path : window.location.href,
  });
}

export function trackSignedUp(params: {
  user_id: string;
  method: AuthMethod;
  converted_from_guest: boolean;
}): void {
  currentAuthMethod = params.method;
  track(EVENTS.ACCOUNT_SIGNED_UP, params);
}

export function trackLoggedIn(params: { user_id: string; method: AuthMethod }): void {
  currentAuthMethod = params.method;
  track(EVENTS.ACCOUNT_LOGGED_IN, params);
}

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
  room_id?: string;
  product_id?: string;
  category: string;
  is_curated: boolean;
}): void {
  track(EVENTS.CHECKLIST_ITEM_ADDED, { room_id: currentRoomId, ...params });
}

export function trackAffiliateClicked(params: {
  retailer?: string;
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

export function trackRoomShared(params: { room_id: string; role: 'viewer' | 'editor' }): void {
  track(EVENTS.ROOM_SHARED, params);
}

export function trackRoomLiked(params: { room_id: string }): void {
  track(EVENTS.ROOM_LIKED, params);
}

export function trackCatalogSearched(params: {
  query: string;
  results_count: number;
  context: 'designer_library' | 'gallery' | 'checklist';
}): void {
  track(EVENTS.CATALOG_SEARCHED, params);
}

export function trackPlanUpgraded(params: { from_plan: 'free' | 'pro'; to_plan: 'free' | 'pro' }): void {
  track(EVENTS.PLAN_UPGRADED, params);
}

export function trackPlanCancelled(params: { from_plan: 'pro'; reason?: string }): void {
  track(EVENTS.PLAN_CANCELLED, params);
}

export function trackLimitReached(params: { limit_type: 'ai_generations' | 'render_quality' }): void {
  track(EVENTS.LIMIT_REACHED, params);
}

export function resetAnalyticsRuntimeForTests(): void {
  analyticsInitialized = false;
  isInternalUser = false;
  identityReady = true;
  currentRoomId = null;
  currentAuthMethod = null;
  sessionStartedForId = null;
  pending.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  resetAnalyticsQueueForTests();
}
