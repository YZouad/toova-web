import type { AgenticReviewRow } from './agenticRoomResolveFromList';
import { normalizeSearchText } from './designerSearch';
import { isGuestWorkspaceId } from './guestDesignSnapshot';

export const AGENTIC_SHOPPING_MANIFEST_KEY = 'toova-agentic-shopping-manifest';

export interface AgenticShoppingManifestEntry {
  id: string;
  query: string;
  qty: number;
  estimatedCents?: number;
  placedInRoom?: boolean;
  bankPosterLabel?: string;
  catalogProductId?: string | null;
  dismissed?: boolean;
}

function manifestEntryId(query: string): string {
  return normalizeSearchText(query).replace(/\s+/g, '-').slice(0, 120);
}

export function manifestFromResolved(rows: AgenticReviewRow[]): AgenticShoppingManifestEntry[] {
  return rows.map((row) => ({
    id: manifestEntryId(row.query),
    query: row.query,
    qty: row.qty,
    estimatedCents: row.product?.priceCents ?? undefined,
    placedInRoom: row.placeInRoom,
    bankPosterLabel: row.bankPoster?.label ?? undefined,
    catalogProductId: row.product?.id ?? null,
    dismissed: false,
  }));
}

function scopedKey(roomId: string): string {
  return `${AGENTIC_SHOPPING_MANIFEST_KEY}:${roomId}`;
}

export function saveLocalAgenticShoppingManifest(
  roomId: string,
  entries: AgenticShoppingManifestEntry[],
): void {
  if (!roomId.trim()) return;
  try {
    localStorage.setItem(scopedKey(roomId), JSON.stringify(entries));
  } catch {
    /* ignore quota */
  }
}

export function loadLocalAgenticShoppingManifest(
  roomId: string,
): AgenticShoppingManifestEntry[] {
  if (!roomId.trim()) return [];
  try {
    const raw = localStorage.getItem(scopedKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AgenticShoppingManifestEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as AgenticShoppingManifestEntry).query === 'string',
    );
  } catch {
    return [];
  }
}

export function activeManifestEntries(
  entries: AgenticShoppingManifestEntry[],
): AgenticShoppingManifestEntry[] {
  return entries.filter((e) => !e.dismissed);
}

/** Query-only rows not already represented by a catalog shopping-list product. */
export function manifestSearchOnlyEntries(
  entries: AgenticShoppingManifestEntry[],
  catalogProductIds: Set<string>,
): AgenticShoppingManifestEntry[] {
  return activeManifestEntries(entries).filter(
    (e) => !e.catalogProductId || !catalogProductIds.has(e.catalogProductId),
  );
}

export function isGuestManifestRoom(roomId: string, userId?: string | null): boolean {
  return isGuestWorkspaceId(roomId) || !userId;
}
