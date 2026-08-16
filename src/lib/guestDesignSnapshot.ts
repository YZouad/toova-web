/**
 * Persist an anonymous room design until the user signs in and we can create
 * an owned Supabase room.
 */

import type { FloorPlan } from './floorPlanGeometry';
import { serializeFloorPlan, parseFloorPlan } from './floorPlanGeometry';
import type { Item, RoomEnvironment } from '../store';
import { parseEnvironment, serializeEnvironment } from './environmentPersist';
import type { RoomTemplateId } from './roomTemplates';

export const GUEST_DESIGN_SNAPSHOT_KEY = 'toova-guest-design-snapshot';
export const GUEST_AUTH_INTENT_KEY = 'toova-guest-auth-intent';

export type GuestAuthIntent = 'save-design' | 'save-checklist';

export interface GuestDesignSnapshot {
  version: 1;
  name: string;
  templateId?: RoomTemplateId;
  roomGeometry: FloorPlan;
  environment: RoomEnvironment;
  items: Item[];
  order: string[];
  savedAt: string;
}

function isItem(raw: unknown): raw is Item {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    Array.isArray(o.position) &&
    Array.isArray(o.size) &&
    typeof o.rotationY === 'number'
  );
}

export function isGuestWorkspaceId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('guest-');
}

export function saveGuestDesignSnapshot(snapshot: GuestDesignSnapshot): void {
  try {
    const payload = {
      ...snapshot,
      version: 1 as const,
      roomGeometry: serializeFloorPlan(snapshot.roomGeometry),
      environment: serializeEnvironment(snapshot.environment),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(GUEST_DESIGN_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadGuestDesignSnapshot(): GuestDesignSnapshot | null {
  try {
    const raw = localStorage.getItem(GUEST_DESIGN_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1 || typeof parsed.name !== 'string') return null;
    const roomGeometry = parseFloorPlan(parsed.roomGeometry);
    if (!roomGeometry) return null;
    const environment = parseEnvironment(parsed.environment);
    if (!environment) return null;
    const itemsRaw = parsed.items;
    const orderRaw = parsed.order;
    if (!Array.isArray(itemsRaw) || !Array.isArray(orderRaw)) return null;
    const items = itemsRaw.filter(isItem);
    const order = orderRaw.filter((id): id is string => typeof id === 'string');
    return {
      version: 1,
      name: parsed.name.trim() || 'Untitled room',
      templateId:
        typeof parsed.templateId === 'string'
          ? (parsed.templateId as RoomTemplateId)
          : undefined,
      roomGeometry,
      environment,
      items,
      order,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearGuestDesignSnapshot(): void {
  try {
    localStorage.removeItem(GUEST_DESIGN_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export function setGuestAuthIntent(intent: GuestAuthIntent): void {
  try {
    sessionStorage.setItem(GUEST_AUTH_INTENT_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function consumeGuestAuthIntent(): GuestAuthIntent | null {
  try {
    const v = sessionStorage.getItem(GUEST_AUTH_INTENT_KEY);
    sessionStorage.removeItem(GUEST_AUTH_INTENT_KEY);
    if (v === 'save-design' || v === 'save-checklist') return v;
    return null;
  } catch {
    return null;
  }
}

export function buildGuestSnapshot(input: {
  name: string;
  templateId?: RoomTemplateId;
  items: Record<string, Item>;
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: FloorPlan;
}): GuestDesignSnapshot {
  const itemList = input.order
    .map((id) => input.items[id])
    .filter((it): it is Item => Boolean(it));
  return {
    version: 1,
    name: input.name.trim() || 'Untitled room',
    templateId: input.templateId,
    roomGeometry: input.roomGeometry,
    environment: input.environment,
    items: itemList,
    order: itemList.map((it) => it.id),
    savedAt: new Date().toISOString(),
  };
}
