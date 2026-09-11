/** Shared collect-analytics policy (Deno + Vitest). */

export const ALLOWED_EVENTS = new Set([
  'account_signed_up',
  'account_logged_in',
  'room_created',
  'design_item_added',
  'model_generation_started',
  'model_generation_succeeded',
  'model_generation_failed',
  'checklist_item_added',
  'product_affiliate_clicked',
  'room_shared',
  'room_liked',
  'catalog_searched',
  'plan_upgraded',
  'plan_cancelled',
  'limit_reached',
  'page_view',
  'session_started',
]);

export const ALLOWED_PROPERTIES = new Set([
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
]);

export const BLOCKED_PROPERTIES = new Set([
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

export const MAX_BATCH = 25;
export const MAX_PARAMS = 25;
export const MAX_PARAM_CHARS = 100;
export const RATE_LIMIT_PER_MINUTE = 120;

export type CollectEvent = {
  event_id?: unknown;
  name?: unknown;
  occurred_at?: unknown;
  session_id?: unknown;
  anonymous_id?: unknown;
  properties?: unknown;
  context?: unknown;
  route?: unknown;
  referrer?: unknown;
  device?: unknown;
  auth_method?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  user_id?: unknown;
};

export type PreparedEvent = {
  event_id: string;
  name: string;
  occurred_at: string;
  session_id: string | null;
  anonymous_id: string | null;
  user_id: string | null;
  properties: Record<string, string | number | boolean>;
  route: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: string | null;
  auth_method: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asTrimmed(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function sanitizeProperties(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PARAMS) break;
    if (!ALLOWED_PROPERTIES.has(key) || BLOCKED_PROPERTIES.has(key)) continue;
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
      out[key] = trimmed.slice(0, MAX_PARAM_CHARS);
    }
  }
  return out;
}

function contextString(event: CollectEvent, key: string, max: number): string | null {
  const ctx = event.context && typeof event.context === 'object' && !Array.isArray(event.context)
    ? (event.context as Record<string, unknown>)
    : {};
  return asTrimmed(event[key as keyof CollectEvent] ?? ctx[key], max);
}

export function prepareCollectEvent(
  raw: CollectEvent,
  derivedUserId: string | null,
): PreparedEvent | { error: string } {
  const eventId = typeof raw.event_id === 'string' ? raw.event_id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!UUID_RE.test(eventId)) return { error: 'invalid event_id' };
  if (!ALLOWED_EVENTS.has(name)) return { error: 'invalid name' };
  const occurred = typeof raw.occurred_at === 'string' ? Date.parse(raw.occurred_at) : NaN;
  if (!Number.isFinite(occurred)) return { error: 'invalid occurred_at' };
  const now = Date.now();
  if (occurred > now + 10 * 60 * 1000) return { error: 'future timestamp' };
  const occurredAt = occurred < now - 7 * 24 * 60 * 60 * 1000
    ? new Date(now).toISOString()
    : new Date(occurred).toISOString();

  const sessionId = asTrimmed(raw.session_id, 80);
  const anonymousId = asTrimmed(raw.anonymous_id, 80);
  if (sessionId && sessionId.length < 8) return { error: 'invalid session_id' };
  if (anonymousId && anonymousId.length < 8) return { error: 'invalid anonymous_id' };

  return {
    event_id: eventId,
    name,
    occurred_at: occurredAt,
    session_id: sessionId,
    anonymous_id: anonymousId,
    user_id: derivedUserId,
    properties: sanitizeProperties(raw.properties),
    route: contextString(raw, 'route', 200),
    referrer: contextString(raw, 'referrer', 200),
    utm_source: contextString(raw, 'utm_source', 80),
    utm_medium: contextString(raw, 'utm_medium', 80),
    utm_campaign: contextString(raw, 'utm_campaign', 80),
    device: contextString(raw, 'device', 16),
    auth_method: contextString(raw, 'auth_method', 16),
  };
}

export function prepareCollectBatch(
  body: unknown,
  derivedUserId: string | null,
): { events: PreparedEvent[]; rejected: number } | { error: string; status: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid body.', status: 400 };
  }
  const eventsRaw = (body as { events?: unknown }).events;
  if (!Array.isArray(eventsRaw)) {
    return { error: 'Invalid events.', status: 400 };
  }
  if (eventsRaw.length === 0) {
    return { events: [], rejected: 0 };
  }
  if (eventsRaw.length > MAX_BATCH) {
    return { error: 'Batch too large.', status: 400 };
  }
  const events: PreparedEvent[] = [];
  let rejected = 0;
  for (const item of eventsRaw) {
    if (!item || typeof item !== 'object') {
      rejected += 1;
      continue;
    }
    const prepared = prepareCollectEvent(item as CollectEvent, derivedUserId);
    if ('error' in prepared) {
      rejected += 1;
      continue;
    }
    events.push(prepared);
  }
  return { events, rejected };
}
