import { supabase } from './supabase';

export interface PlatformStats {
  profileCount: number;
  communityRoomCount: number;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  const { data, error } = await supabase.rpc('get_platform_stats');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  return {
    profileCount: n(record.profile_count),
    communityRoomCount: n(record.community_room_count),
  };
}
