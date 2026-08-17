import { supabase } from './supabase';
import { MODEL_FILES_BUCKET } from './modelStorage';
import { requestUnfurlDeploy } from './requestUnfurlDeploy';
import { buildShareUrl } from './shareLinks';
import { signStoragePaths } from './signedUrlCache';

export type ShareRole = 'viewer' | 'editor';

export interface RoomShareRow {
  token: string;
  room_id: string;
  role: ShareRole;
  allow_copy: boolean;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
}

export interface RoomCollaboratorRow {
  room_id: string;
  user_id: string;
  role: ShareRole;
  added_via: string | null;
  created_at: string;
}

export interface PublicAttribution {
  visible: boolean;
  room_id?: string;
  room_name?: string;
  owner_handle?: string;
  owner_display?: string;
}

export interface SharedRoomRpcPayload {
  room: {
    id: string;
    name: string;
    environment: unknown;
    room_geometry: unknown;
    fork_count?: number;
    thumbnail_path?: string | null;
  };
  items: unknown[];
  catalog_dims: Record<string, [number, number, number] | number[]>;
  asset_paths: string[];
  role: ShareRole;
  allow_copy: boolean;
  owner_display: string;
  owner_handle?: string | null;
  attribution?: PublicAttribution | null;
}

function shareErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message);
    if (msg.toLowerCase().includes('invalid share link')) {
      return 'This share link is invalid or has been revoked.';
    }
    if (msg.toLowerCase().includes('copying is disabled')) {
      return 'The owner disabled copies for this link.';
    }
    if (msg.toLowerCase().includes('room limit')) {
      return msg;
    }
    return msg;
  }
  return 'Something went wrong with this share link.';
}

export async function fetchSharedRoom(token: string): Promise<SharedRoomRpcPayload> {
  const { data, error } = await supabase.rpc('get_shared_room', { p_token: token });
  if (error) throw new Error(shareErrorMessage(error));
  if (!data || typeof data !== 'object') {
    throw new Error('This share link is invalid or has been revoked.');
  }
  return data as SharedRoomRpcPayload;
}

/** After get_shared_room granted paths, reuse a cached signed URL when possible. */
export async function signGrantedAssetPaths(
  paths: string[],
  expiresSec = 60 * 60,
): Promise<Record<string, string>> {
  return signStoragePaths(MODEL_FILES_BUCKET, paths, expiresSec);
}

export async function redeemShareToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_share_token', { p_token: token });
  if (error) throw new Error(shareErrorMessage(error));
  if (!data || typeof data !== 'string') {
    throw new Error('Could not open this shared room.');
  }
  return data;
}

export async function forkSharedRoom(token: string, name?: string): Promise<string> {
  const { data, error } = await supabase.rpc('fork_shared_room', {
    p_token: token,
    p_name: name != null && name.trim() ? name.trim() : null,
  });
  if (error) throw new Error(shareErrorMessage(error));
  if (!data || typeof data !== 'string') {
    throw new Error('Could not make a copy of this room.');
  }
  return data;
}

export async function listRoomShares(roomId: string): Promise<RoomShareRow[]> {
  const { data, error } = await supabase
    .from('room_shares')
    .select('token, room_id, role, allow_copy, created_at, expires_at, revoked_at, view_count')
    .eq('room_id', roomId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomShareRow[];
}

export async function createRoomShare(
  roomId: string,
  userId: string,
  opts: { role?: ShareRole; allowCopy?: boolean } = {},
): Promise<{ token: string; url: string }> {
  const { data, error } = await supabase
    .from('room_shares')
    .insert({
      room_id: roomId,
      created_by: userId,
      role: opts.role ?? 'viewer',
      allow_copy: opts.allowCopy ?? true,
    })
    .select('token')
    .single();
  if (error) throw new Error(error.message);
  const token = data.token as string;
  void requestUnfurlDeploy();
  return { token, url: buildShareUrl(token) };
}

export async function revokeRoomShare(token: string): Promise<void> {
  const { error } = await supabase
    .from('room_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token);
  if (error) throw new Error(error.message);
  void requestUnfurlDeploy();
}

export async function updateRoomShareAllowCopy(
  token: string,
  allowCopy: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('room_shares')
    .update({ allow_copy: allowCopy })
    .eq('token', token);
  if (error) throw new Error(error.message);
}

export async function listRoomCollaborators(
  roomId: string,
): Promise<RoomCollaboratorRow[]> {
  const { data, error } = await supabase
    .from('room_collaborators')
    .select('room_id, user_id, role, added_via, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomCollaboratorRow[];
}

export async function removeRoomCollaborator(
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('room_collaborators')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listSharedWithMeRooms(userId: string): Promise<
  Array<{ id: string; name: string; updated_at: string; role: ShareRole }>
> {
  const { data: collabs, error: cErr } = await supabase
    .from('room_collaborators')
    .select('room_id, role')
    .eq('user_id', userId);
  if (cErr) throw new Error(cErr.message);
  const rows = collabs ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.room_id as string);
  const roleByRoom = new Map(rows.map((r) => [r.room_id as string, r.role as ShareRole]));

  const { data: rooms, error: rErr } = await supabase
    .from('rooms')
    .select('id, name, updated_at')
    .in('id', ids)
    .order('updated_at', { ascending: false });
  if (rErr) throw new Error(rErr.message);

  return (rooms ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    updated_at: r.updated_at as string,
    role: roleByRoom.get(r.id as string) ?? 'editor',
  }));
}
