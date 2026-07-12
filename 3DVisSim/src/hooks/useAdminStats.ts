import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminInventoryStatRow {
  kind: string;
  label: string;
  tags: string[];
  description: string | null;
  /** Total placement rows in room_items for this kind */
  in_room_count: number;
  /** Rooms where at least one row exists for this kind */
  distinct_room_count: number;
  likes_count: number;
  downloads_count: number;
  views_count: number;
}

export interface AdminRoomRollupRow {
  room_id: string;
  room_name: string;
  item_count: number;
  owner_user_id: string;
}

export interface AdminUserRollupRow {
  user_id: string;
  room_count: number;
  total_item_placements: number;
}

export interface AdminBundlePairRow {
  kind_a: string;
  kind_b: string;
  label_a: string;
  label_b: string;
  room_cooccurrence_count: number;
}

export interface UseAdminStatsResult {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  stats: AdminInventoryStatRow[];
  rooms: AdminRoomRollupRow[];
  users: AdminUserRollupRow[];
  bundles: AdminBundlePairRow[];
  refetch: () => Promise<void>;
}

const SUMMARY_LIMIT = 5;

export { SUMMARY_LIMIT };

/**
 * Loads admin flag (via `admins` self row) and, when authorized,
 * parallel admin RPCs: inventory, room counts, user totals, bundle pair hints.
 */
export function useAdminStats(userId: string | null | undefined): UseAdminStatsResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminInventoryStatRow[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRollupRow[]>([]);
  const [users, setUsers] = useState<AdminUserRollupRow[]>([]);
  const [bundles, setBundles] = useState<AdminBundlePairRow[]>([]);

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setStats([]);
      setRooms([]);
      setUsers([]);
      setBundles([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: adminRow, error: adminErr } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (adminErr) {
        setIsAdmin(false);
        setStats([]);
        setRooms([]);
        setUsers([]);
        setBundles([]);
        setError(adminErr.message);
        return;
      }

      if (!adminRow) {
        setIsAdmin(false);
        setStats([]);
        setRooms([]);
        setUsers([]);
        setBundles([]);
        return;
      }

      setIsAdmin(true);

      const [invRes, roomsRes, usersRes, bundleRes] = await Promise.all([
        supabase.rpc('get_admin_inventory_stats'),
        supabase.rpc('get_admin_room_item_counts'),
        supabase.rpc('get_admin_user_item_totals'),
        supabase.rpc('get_admin_bundle_suggestions', { p_min_room_cooccurrences: 2 }),
      ]);

      const errMsg =
        invRes.error?.message ??
        roomsRes.error?.message ??
        usersRes.error?.message ??
        bundleRes.error?.message ??
        null;

      if (errMsg) {
        setStats([]);
        setRooms([]);
        setUsers([]);
        setBundles([]);
        setError(errMsg);
        return;
      }

      setStats(((invRes.data ?? []) as Partial<AdminInventoryStatRow>[]).map((r) => ({
        kind: String(r.kind ?? ''),
        label: String(r.label ?? ''),
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        description: r.description != null ? String(r.description) : null,
        in_room_count: Number(r.in_room_count),
        distinct_room_count: Number(r.distinct_room_count ?? 0),
        likes_count: Number(r.likes_count),
        downloads_count: Number(r.downloads_count),
        views_count: Number(r.views_count),
      })));

      setRooms(((roomsRes.data ?? []) as Partial<AdminRoomRollupRow>[]).map((r) => ({
        room_id: String(r.room_id ?? ''),
        room_name: String(r.room_name ?? ''),
        item_count: Number(r.item_count),
        owner_user_id: String(r.owner_user_id ?? ''),
      })));

      setUsers(((usersRes.data ?? []) as Partial<AdminUserRollupRow>[]).map((r) => ({
        user_id: String(r.user_id ?? ''),
        room_count: Number(r.room_count),
        total_item_placements: Number(r.total_item_placements),
      })));

      setBundles(((bundleRes.data ?? []) as Partial<AdminBundlePairRow>[]).map((r) => ({
        kind_a: String(r.kind_a ?? ''),
        kind_b: String(r.kind_b ?? ''),
        label_a: String(r.label_a ?? ''),
        label_b: String(r.label_b ?? ''),
        room_cooccurrence_count: Number(r.room_cooccurrence_count),
      })));
    } catch (e) {
      setStats([]);
      setRooms([]);
      setUsers([]);
      setBundles([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return useMemo(
    () => ({
      isAdmin,
      loading,
      error,
      stats,
      rooms,
      users,
      bundles,
      refetch: fetchAll,
    }),
    [bundles, error, fetchAll, isAdmin, loading, rooms, stats, users],
  );
}
