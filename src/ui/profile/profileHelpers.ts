import { parseFloorPlan, planBounds } from '../../lib/roomGeometry';
import type { ProfileRoomCard } from '../../lib/profiles';
import type { RoomPreviewItem } from '../RoomPreview';

export function toPreviewItems(room: ProfileRoomCard): RoomPreviewItem[] {
  return (room.items ?? [])
    .filter((row) => row.kind !== 'hanging')
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      position: [Number(row.pos_x), Number(row.pos_y), Number(row.pos_z)],
      rotationY: Number(row.rotation_y),
      size: [Number(row.size_w), Number(row.size_h), Number(row.size_d)],
      modelUrl: row.model_url?.trim() || null,
    }));
}

export function formatSqft(geometry: ReturnType<typeof parseFloorPlan>): string {
  if (!geometry) return '—';
  const b = planBounds(geometry);
  const sqft = Math.round((b.width * b.depth) / 144);
  return sqft > 0 ? `${sqft} sq ft` : '—';
}

export function visibilityLabel(v: string): string {
  if (v === 'public') return 'Public';
  if (v === 'unlisted') return 'Unlisted';
  return 'Private';
}

export function attributionLabel(room: ProfileRoomCard): string | null {
  const a = room.attribution;
  if (!a?.visible) {
    return room.forked_from ? 'Copied room' : null;
  }
  return `Forked from ${a.room_name} by ${a.owner_display}`;
}

export type ProfileTabId = 'rooms' | 'models' | 'settings';
export type SettingsSectionId = 'profile' | 'notifications' | 'integrations' | 'privacy';

export function parseProfileTab(raw: string | null, isOwner: boolean): ProfileTabId {
  if (raw === 'models') return 'models';
  if (raw === 'settings' && isOwner) return 'settings';
  return 'rooms';
}

export function parseSettingsSection(raw: string | null): SettingsSectionId {
  if (raw === 'notifications' || raw === 'integrations' || raw === 'privacy') return raw;
  return 'profile';
}

export function writeProfileQuery(tab: ProfileTabId, section?: SettingsSectionId) {
  const url = new URL(window.location.href);
  if (tab === 'rooms') {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tab);
  }
  if (tab === 'settings' && section && section !== 'profile') {
    url.searchParams.set('section', section);
  } else {
    url.searchParams.delete('section');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
