import { supabase } from './supabase';

const VIEWED_SESSION_KEY = 'toova-room-viewed';
const VIEWER_TOKEN_KEY = 'toova-room-viewer-token';

function readViewedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VIEWED_SESSION_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeViewedSet(set: Set<string>): void {
  try {
    sessionStorage.setItem(VIEWED_SESSION_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota */
  }
}

function getOrCreateViewerToken(): string {
  try {
    const existing = localStorage.getItem(VIEWER_TOKEN_KEY);
    if (existing && existing.length >= 8) return existing;
    const token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VIEWER_TOKEN_KEY, token);
    return token;
  } catch {
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function toggleRoomLike(
  roomId: string,
): Promise<{ liked: boolean; likes_count: number }> {
  const { data, error } = await supabase.rpc('toggle_room_like', {
    p_room_id: roomId,
  });
  if (error) throw new Error(error.message);
  const row = data as { liked?: boolean; likes_count?: number } | null;
  return {
    liked: Boolean(row?.liked),
    likes_count: Number(row?.likes_count ?? 0),
  };
}

/** Records at most one unique view per room per browser session (client), with server-side dedup. */
export async function recordRoomView(roomId: string): Promise<number | null> {
  const viewed = readViewedSet();
  if (viewed.has(roomId)) return null;
  viewed.add(roomId);
  writeViewedSet(viewed);

  const { data, error } = await supabase.rpc('record_room_view', {
    p_room_id: roomId,
    p_viewer_token: getOrCreateViewerToken(),
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
