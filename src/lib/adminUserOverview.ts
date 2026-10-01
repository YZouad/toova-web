import type { CatalogVisibility } from './catalogEngagement';
import { supabase } from './supabase';

export type AdminUserPlan = 'free' | 'lite' | 'pro';
export type AdminUserRoomVisibility = 'private' | 'unlisted' | 'public';

export interface AdminUserProfile {
  user_id: string;
  email: string | null;
  handle: string | null;
  display_name: string | null;
  bio: string;
  avatar_path: string | null;
  is_public: boolean;
  created_at: string | null;
  last_active_at: string | null;
  last_sign_in_at: string | null;
  plan: AdminUserPlan;
  is_admin: boolean;
}

export interface AdminUserBillingSubscription {
  tier: string;
  status: string;
  source: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_stripe: boolean;
}

export interface AdminUserBilling {
  effective_tier: AdminUserPlan;
  monthly_balance: number;
  purchased_balance: number;
  monthly_period_end: string | null;
  subscription: AdminUserBillingSubscription | null;
}

export interface AdminUserRoomRow {
  room_id: string;
  name: string;
  visibility: AdminUserRoomVisibility;
  item_count: number;
  likes_count: number;
  views_count: number;
  fork_count: number;
  created_at: string | null;
  updated_at: string | null;
  quarantined_at: string | null;
  thumbnail_path: string | null;
}

export interface AdminUserModelRow {
  kind: string;
  label: string;
  description: string | null;
  tags: string[];
  categories: string[];
  visibility: CatalogVisibility;
  width_in: number;
  height_in: number;
  depth_in: number;
  clearance_in: number | null;
  likes_count: number;
  downloads_count: number;
  views_count: number;
  created_at: string;
  model_url: string | null;
  thumbnail_path: string | null;
  quarantined_at: string | null;
}

/** One named metric over time. Custom analytics should append series rather than invent a new shape. */
export interface AdminUserAnalyticsSeries {
  key: string;
  label: string;
  unit?: string;
  points: Array<{ t: string; v: number }>;
}

export interface AdminUserAnalyticsTotals {
  rooms: number;
  models: number;
  placements: number;
  generations: number;
  generations_completed: number;
  generations_failed: number;
  public_rooms: number;
  public_models: number;
}

export interface AdminUserAnalytics {
  generated_at: string;
  totals: AdminUserAnalyticsTotals;
  series: AdminUserAnalyticsSeries[];
  /** Reserved for custom analytics payloads (funnels, events, etc.). */
  extras: Record<string, unknown>;
}

export interface AdminUserOverview {
  user: AdminUserProfile;
  billing: AdminUserBilling | null;
  rooms: AdminUserRoomRow[];
  models: AdminUserModelRow[];
  analytics: AdminUserAnalytics;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? value : null;
}

function asNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function asVisibility(value: unknown, fallback: CatalogVisibility = 'private'): CatalogVisibility {
  const raw = String(value ?? fallback);
  if (raw === 'public' || raw === 'unlisted' || raw === 'private') return raw;
  return fallback;
}

function asRoomVisibility(value: unknown): AdminUserRoomVisibility {
  const raw = String(value ?? 'private');
  if (raw === 'public' || raw === 'unlisted' || raw === 'private') return raw;
  return 'private';
}

function asPlan(value: unknown): AdminUserPlan {
  if (value === 'pro' || value === 'lite') return value;
  return 'free';
}

export function lastActiveSortValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function parseUser(raw: unknown): AdminUserProfile | null {
  const row = asRecord(raw);
  if (!row) return null;
  const userId = asString(row.user_id);
  if (!userId) return null;
  return {
    user_id: userId,
    email: asString(row.email),
    handle: asString(row.handle),
    display_name: asString(row.display_name),
    bio: typeof row.bio === 'string' ? row.bio : '',
    avatar_path: asString(row.avatar_path),
    is_public: asBool(row.is_public),
    created_at: asIso(row.created_at),
    last_active_at: asIso(row.last_active_at),
    last_sign_in_at: asIso(row.last_sign_in_at),
    plan: asPlan(row.plan),
    is_admin: asBool(row.is_admin),
  };
}

function parseBilling(raw: unknown): AdminUserBilling | null {
  const row = asRecord(raw);
  if (!row) return null;
  const subRow = asRecord(row.subscription);
  return {
    effective_tier: asPlan(row.effective_tier),
    monthly_balance: asNum(row.monthly_balance),
    purchased_balance: asNum(row.purchased_balance),
    monthly_period_end: asIso(row.monthly_period_end),
    subscription: subRow
      ? {
          tier: asString(subRow.tier) ?? 'free',
          status: asString(subRow.status) ?? 'canceled',
          source: asString(subRow.source) ?? 'admin',
          current_period_end: asIso(subRow.current_period_end),
          cancel_at_period_end: asBool(subRow.cancel_at_period_end),
          has_stripe: asBool(subRow.has_stripe),
        }
      : null,
  };
}

function parseRoom(raw: unknown): AdminUserRoomRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const roomId = asString(row.room_id);
  if (!roomId) return null;
  return {
    room_id: roomId,
    name: asString(row.name) ?? 'Untitled room',
    visibility: asRoomVisibility(row.visibility),
    item_count: asNum(row.item_count),
    likes_count: asNum(row.likes_count),
    views_count: asNum(row.views_count),
    fork_count: asNum(row.fork_count),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    quarantined_at: asIso(row.quarantined_at),
    thumbnail_path: asString(row.thumbnail_path),
  };
}

function parseModel(raw: unknown): AdminUserModelRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const kind = asString(row.kind);
  if (!kind) return null;
  return {
    kind,
    label: asString(row.label) ?? kind,
    description: asString(row.description),
    tags: asStringArray(row.tags),
    categories: asStringArray(row.categories),
    visibility: asVisibility(row.visibility),
    width_in: asNum(row.width_in),
    height_in: asNum(row.height_in),
    depth_in: asNum(row.depth_in),
    clearance_in: row.clearance_in == null || row.clearance_in === '' ? null : asNum(row.clearance_in),
    likes_count: asNum(row.likes_count),
    downloads_count: asNum(row.downloads_count),
    views_count: asNum(row.views_count),
    created_at: asIso(row.created_at) ?? new Date(0).toISOString(),
    model_url: asString(row.model_url),
    thumbnail_path: asString(row.thumbnail_path),
    quarantined_at: asIso(row.quarantined_at),
  };
}

function parseSeries(raw: unknown): AdminUserAnalyticsSeries[] {
  if (!Array.isArray(raw)) return [];
  const out: AdminUserAnalyticsSeries[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const key = asString(row.key);
    const label = asString(row.label);
    if (!key || !label) continue;
    const pointsRaw = Array.isArray(row.points) ? row.points : [];
    const points: Array<{ t: string; v: number }> = [];
    for (const pt of pointsRaw) {
      const p = asRecord(pt);
      if (!p) continue;
      const t = asIso(p.t) ?? asString(p.t);
      if (!t) continue;
      points.push({ t, v: asNum(p.v) });
    }
    out.push({
      key,
      label,
      unit: asString(row.unit) ?? undefined,
      points,
    });
  }
  return out;
}

function parseAnalytics(raw: unknown): AdminUserAnalytics {
  const row = asRecord(raw) ?? {};
  const totalsRow = asRecord(row.totals) ?? {};
  const extrasRow = asRecord(row.extras);
  return {
    generated_at: asIso(row.generated_at) ?? new Date().toISOString(),
    totals: {
      rooms: asNum(totalsRow.rooms),
      models: asNum(totalsRow.models),
      placements: asNum(totalsRow.placements),
      generations: asNum(totalsRow.generations),
      generations_completed: asNum(totalsRow.generations_completed),
      generations_failed: asNum(totalsRow.generations_failed),
      public_rooms: asNum(totalsRow.public_rooms),
      public_models: asNum(totalsRow.public_models),
    },
    series: parseSeries(row.series),
    extras: extrasRow ?? {},
  };
}

export function parseAdminUserOverview(raw: unknown): AdminUserOverview | null {
  const row = asRecord(raw);
  if (!row) return null;
  const user = parseUser(row.user);
  if (!user) return null;
  const rooms = Array.isArray(row.rooms)
    ? row.rooms.map(parseRoom).filter((r): r is AdminUserRoomRow => r != null)
    : [];
  const models = Array.isArray(row.models)
    ? row.models.map(parseModel).filter((m): m is AdminUserModelRow => m != null)
    : [];
  return {
    user,
    billing: parseBilling(row.billing),
    rooms,
    models,
    analytics: parseAnalytics(row.analytics),
  };
}

export async function fetchAdminUserOverview(userId: string): Promise<AdminUserOverview> {
  const { data, error } = await supabase.rpc('get_admin_user_overview', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const parsed = parseAdminUserOverview(data);
  if (!parsed) throw new Error('User not found');
  return parsed;
}

export async function adminGrantPlan(
  userId: string,
  tier: 'lite' | 'pro',
  months: number | null,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.rpc('admin_grant_plan', {
    p_user_id: userId,
    p_tier: tier,
    p_months: months,
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false }) as { ok: boolean; error?: string; message?: string };
}

export async function adminRevokePlan(
  userId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.rpc('admin_revoke_plan', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false }) as { ok: boolean; error?: string; message?: string };
}

export async function adminGrantCredits(
  userId: string,
  credits: number,
  note?: string,
): Promise<{ ok: boolean; purchased_balance?: number; message?: string }> {
  const { data, error } = await supabase.rpc('admin_grant_credits', {
    p_user_id: userId,
    p_credits: credits,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false }) as {
    ok: boolean;
    purchased_balance?: number;
    message?: string;
  };
}
