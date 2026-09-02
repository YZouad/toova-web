import { isGuestWorkspaceId } from './guestDesignSnapshot';
import { supabase } from './supabase';
import { publicModelAssetUrl, publicModelsUrl } from './modelStorage';
import { mirrorRoomAssets } from './publicModelsMirror';
import { requestUnfurlDeploy } from './requestUnfurlDeploy';
import { signStoragePath } from './signedUrlCache';

export const PROFILE_AVATARS_BUCKET = 'profile-avatars';

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  is_public: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PublicAttribution {
  visible: boolean;
  room_id?: string;
  room_name?: string;
  owner_handle?: string;
  owner_display?: string;
}

export interface ProfileRoomCard {
  id: string;
  name: string;
  visibility: 'private' | 'unlisted' | 'public';
  updated_at: string;
  fork_count: number;
  likes_count?: number;
  views_count?: number;
  published_at?: string | null;
  thumbnail_path?: string | null;
  forked_from: string | null;
  attribution: PublicAttribution | null;
  room_geometry: unknown;
  items: Array<{
    id: string;
    kind: string;
    pos_x: number | string;
    pos_y: number | string;
    pos_z: number | string;
    rotation_y: number | string;
    size_w: number | string;
    size_h: number | string;
    size_d: number | string;
    model_url?: string | null;
  }>;
}

export interface ProfilePagePayload {
  profile: Profile;
  canonical_handle: string;
  is_owner: boolean;
  rooms: ProfileRoomCard[];
}

export interface ProfileCatalogModel {
  kind: string;
  label: string;
  description: string | null;
  categories: string[];
  tags: string[];
  width_in: number;
  height_in: number;
  depth_in: number;
  thumbnail_path: string | null;
  model_url: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  likes_count: number;
  downloads_count: number;
  views_count: number;
  created_at: string;
}

export async function fetchProfileCatalogModels(
  handle: string,
): Promise<{ is_owner: boolean; models: ProfileCatalogModel[] } | null> {
  const { data, error } = await supabase.rpc('get_profile_catalog_models', {
    p_handle: handle,
  });
  if (error) {
    // Migration may not be applied yet.
    console.warn(error.message);
    return { is_owner: false, models: [] };
  }
  if (!data || typeof data !== 'object') return null;
  const payload = data as {
    is_owner?: boolean;
    models?: ProfileCatalogModel[];
  };
  return {
    is_owner: Boolean(payload.is_owner),
    models: Array.isArray(payload.models) ? payload.models : [],
  };
}

export interface PublicRoomPayload {
  room: {
    id: string;
    name: string;
    environment: unknown;
    room_geometry: unknown;
    fork_count: number;
    forked_from: string | null;
    thumbnail_path?: string | null;
    likes_count?: number;
    views_count?: number;
    published_at?: string | null;
    liked_by_me?: boolean;
  };
  items: unknown[];
  catalog_dims: Record<string, [number, number, number] | number[]>;
  asset_paths: string[];
  owner: {
    handle: string;
    display_name: string;
    avatar_path: string | null;
    id?: string | null;
  };
  attribution: PublicAttribution | null;
  allow_copy: boolean;
}

export interface RoomAttributionPayload {
  forked_from: string | null;
  fork_count: number;
  visibility: string;
  attribution: PublicAttribution | null;
}

export interface CollaboratorProfileRow {
  user_id: string;
  role: 'viewer' | 'editor';
  added_via: string | null;
  created_at: string;
  display_name: string;
  handle: string | null;
  avatar_path: string | null;
  is_public: boolean;
}

function profileErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message);
    if (msg.toLowerCase().includes('handle already taken')) return 'That handle is already taken.';
    if (msg.toLowerCase().includes('invalid handle')) return 'Handles must be 3–30 characters: a–z, 0–9, underscore.';
    if (msg.toLowerCase().includes('invalid display name')) return 'Display name must be 1–60 characters.';
    if (msg.toLowerCase().includes('bio too long')) return 'Bio must be 280 characters or fewer.';
    if (msg.toLowerCase().includes('profile must be public')) {
      return 'Make your profile public before publishing a room.';
    }
    if (msg.toLowerCase().includes('room limit')) return msg;
    if (msg.toLowerCase().includes('room not found')) return 'This room is unavailable.';
    if (msg.toLowerCase().includes('not room owner')) return 'Only the room owner can do that.';
    return msg || fallback;
  }
  return fallback;
}

export async function fetchOwnProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, bio, avatar_path, is_public, created_at, updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function fetchProfilePage(handle: string): Promise<ProfilePagePayload | null> {
  const { data, error } = await supabase.rpc('get_profile_page', { p_handle: handle });
  if (error) throw new Error(profileErrorMessage(error, 'Could not load profile.'));
  if (!data || typeof data !== 'object') return null;
  return data as ProfilePagePayload;
}

export async function updateOwnProfile(input: {
  handle?: string;
  displayName?: string;
  bio?: string;
  isPublic?: boolean;
  avatarPath?: string | null;
}): Promise<Profile> {
  const { data, error } = await supabase.rpc('update_own_profile', {
    p_handle: input.handle ?? null,
    p_display_name: input.displayName ?? null,
    p_bio: input.bio ?? null,
    p_is_public: input.isPublic ?? null,
    p_avatar_path: input.avatarPath === null ? null : input.avatarPath ?? null,
    p_clear_avatar: input.avatarPath === null,
  });
  if (error) throw new Error(profileErrorMessage(error, 'Could not update profile.'));
  if (input.isPublic !== undefined) {
    void requestUnfurlDeploy();
  }
  return data as Profile;
}

export async function setRoomVisibility(
  roomId: string,
  visibility: 'private' | 'public',
): Promise<void> {
  const { error } = await supabase.rpc('set_room_visibility', {
    p_room_id: roomId,
    p_visibility: visibility,
  });
  if (error) throw new Error(profileErrorMessage(error, 'Could not update room visibility.'));
  await mirrorRoomAssets(roomId, visibility);
  void requestUnfurlDeploy();
}

export async function fetchPublicRoom(
  handle: string,
  roomId: string,
): Promise<PublicRoomPayload> {
  const { data, error } = await supabase.rpc('get_public_room', {
    p_handle: handle,
    p_room_id: roomId,
  });
  if (error) throw new Error(profileErrorMessage(error, 'Could not open this room.'));
  if (!data || typeof data !== 'object') {
    throw new Error('This room is unavailable.');
  }
  return data as PublicRoomPayload;
}

export async function forkPublicRoom(
  handle: string,
  roomId: string,
  name?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('fork_public_room', {
    p_handle: handle,
    p_room_id: roomId,
    p_name: name != null && name.trim() ? name.trim() : null,
  });
  if (error) throw new Error(profileErrorMessage(error, 'Could not make a copy of this room.'));
  if (!data || typeof data !== 'string') {
    throw new Error('Could not make a copy of this room.');
  }
  return data;
}

export async function fetchRoomAttribution(roomId: string): Promise<RoomAttributionPayload | null> {
  if (isGuestWorkspaceId(roomId)) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data, error } = await supabase.rpc('get_room_attribution', { p_room_id: roomId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') return null;
  return data as RoomAttributionPayload;
}

export async function listRoomCollaboratorProfiles(
  roomId: string,
): Promise<CollaboratorProfileRow[]> {
  const { data, error } = await supabase.rpc('list_room_collaborator_profiles', {
    p_room_id: roomId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data as CollaboratorProfileRow[];
}

export async function signAvatarPath(
  path: string | null | undefined,
  expiresSec = 60 * 60,
): Promise<string | null> {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  return signStoragePath(PROFILE_AVATARS_BUCKET, trimmed, expiresSec);
}

/** Stable public-models / R2 CDN URLs for a published room (no per-view signed tokens). */
export async function signPublicRoomAssetPaths(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  for (const path of unique) {
    const url = publicModelAssetUrl(path) ?? publicModelsUrl(path);
    if (url) out[path] = url;
  }
  return out;
}

export function profilePath(handle: string): string {
  return `/u/${handle}`;
}

export function publicRoomPath(handle: string, roomId: string): string {
  return `/u/${handle}/r/${roomId}`;
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle);
}
