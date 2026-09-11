/** Shared first-party / GA4 event catalog, allow-lists, and sanitization. */

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
  PLAN_UPGRADED: 'plan_upgraded',
  PLAN_CANCELLED: 'plan_cancelled',
  LIMIT_REACHED: 'limit_reached',
  PAGE_VIEW: 'page_view',
  SESSION_STARTED: 'session_started',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const ALLOWED_EVENT_NAMES: readonly EventName[] = Object.values(EVENTS);

const ALLOWED_EVENT_SET = new Set<string>(ALLOWED_EVENT_NAMES);

/** Bounded, non-PII properties accepted by the collector (mirrors GA4 params). */
export const ALLOWED_EVENT_PROPERTIES = [
  'method',
  'converted_from_guest',
  'room_id',
  'template_id',
  'is_guest',
  'kind',
  'source',
  'curated_product_id',
  'job_id',
  'source_type',
  'duration_ms',
  'failure_reason',
  'product_id',
  'category',
  'is_curated',
  'retailer',
  'is_price_approximate',
  'role',
  'query',
  'results_count',
  'context',
  'from_plan',
  'to_plan',
  'reason',
  'limit_type',
  'page_path',
  'page_title',
  'page_referrer',
  'page_location',
] as const;

const ALLOWED_PROPERTY_SET = new Set<string>(ALLOWED_EVENT_PROPERTIES);

const BLOCKED_PROPERTY_SET = new Set([
  'email',
  'display_name',
  'name',
  'full_name',
  'first_name',
  'last_name',
  'username',
  'user_name',
  'phone',
  'address',
  'ip',
  'user_agent',
  'user_id',
  'uid',
  'password',
]);

export const MAX_EVENT_PARAMS = 25;
export const MAX_PARAM_CHARS = 100;
export const MAX_BATCH_EVENTS = 25;
export const MAX_ROUTE_CHARS = 200;
export const MAX_ID_CHARS = 64;

export type AnalyticsDevice = 'desktop' | 'mobile' | 'tablet';
export type AnalyticsAuthMethod = 'email' | 'google' | 'facebook';
export type AnalyticsCollectionSource = 'client' | 'relational_backfill';
export type AnalyticsConsentScope = 'consented' | 'operational_backfill';

export interface AnalyticsEventContext {
  route?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device?: AnalyticsDevice | null;
  auth_method?: AnalyticsAuthMethod | null;
}

export interface NormalizedAnalyticsEvent {
  event_id: string;
  name: EventName;
  occurred_at: string;
  session_id: string;
  anonymous_id: string;
  room_id?: string | null;
  job_id?: string | null;
  product_id?: string | null;
  properties: Record<string, string | number | boolean>;
  context: AnalyticsEventContext;
}

export function isAllowedEventName(name: string): name is EventName {
  return ALLOWED_EVENT_SET.has(name);
}

export function truncateParam(value: string, max = MAX_PARAM_CHARS): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function sanitizeEventProperties(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_EVENT_PARAMS) break;
    if (!ALLOWED_PROPERTY_SET.has(key) || BLOCKED_PROPERTY_SET.has(key)) continue;
    if (typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || looksLikeEmail(trimmed)) continue;
      out[key] = truncateParam(trimmed);
    }
  }
  return out;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function sanitizeId(value: unknown, max = MAX_ID_CHARS): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function sanitizeRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return truncateParam(trimmed, MAX_ROUTE_CHARS);
}

export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function inferDevice(userAgent: string | null | undefined): AnalyticsDevice {
  const ua = (userAgent ?? '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobile|iphone|android(?!.*tablet)|blackberry|opera mini|iemobile/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function parseUtm(search: string | null | undefined): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
} {
  if (!search) return { utm_source: null, utm_medium: null, utm_campaign: null };
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return {
      utm_source: truncateNullable(params.get('utm_source')),
      utm_medium: truncateNullable(params.get('utm_medium')),
      utm_campaign: truncateNullable(params.get('utm_campaign')),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

function truncateNullable(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return truncateParam(trimmed, 80);
}

export function dimensionFromProperties(
  properties: Record<string, string | number | boolean>,
  key: 'room_id' | 'job_id' | 'product_id',
): string | null {
  const value = properties[key];
  return typeof value === 'string' ? sanitizeId(value) : null;
}
