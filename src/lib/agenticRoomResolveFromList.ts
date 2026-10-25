import type { AffiliateOffer } from './affiliateLinks';
import { searchOffersForQuery } from './affiliateLinks';
import type { CuratedProduct } from './dormChecklist';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticRoomRequest } from './agenticRoomPrompt';
import type { AgenticCommunityMatch } from './agenticCommunityMatch';
import type { AgenticPosterMatch } from './agenticPosterMatch';
import { resolveAgenticPoster } from './agenticPosterMatch';
import { resolveAgenticThemeProfile } from './agenticThemeProfile';
import { defaultPlaceInRoom } from './agenticRoomPlacement';
import {
  resolveAgenticItems,
  type AgenticResolveResult,
  type ResolvedAgenticItem,
} from './agenticRoomResolve';
import { inches, ROOM } from '../units';
import type { RoomScanItemSidecar } from './roomScanManifest';

export interface AgenticReviewScanMeta {
  scanId: string;
  scanSizeIn?: [number, number, number];
  scanPose?: { x: number; z: number; rotationY: number };
  scanLocationLabel?: string;
  scanPhotoDataUrl?: string;
}

export interface ResolvedAgenticItemWithOffers extends ResolvedAgenticItem {
  searchOffers: AffiliateOffer[];
}

export interface AgenticReviewRow extends ResolvedAgenticItemWithOffers {
  placeInRoom: boolean;
  communityModel: AgenticCommunityMatch | null;
  bankPoster: AgenticPosterMatch | null;
  scan?: AgenticReviewScanMeta;
}

export function toAgenticReviewRows(
  items: ResolvedAgenticItemWithOffers[],
  theme?: string | null,
  prompt?: string | null,
): AgenticReviewRow[] {
  const profile = resolveAgenticThemeProfile(theme, prompt);
  const profileTheme = profile?.label ?? theme ?? undefined;
  return items.map((item) => {
    const bankPoster = resolveAgenticPoster(item.query, profileTheme, 25, profile);
    const cleared = bankPoster
      ? { ...item, builtinKind: null, warnings: [] as string[] }
      : item;
    return {
      ...cleared,
      placeInRoom: defaultPlaceInRoom({
        query: item.query,
        product: cleared.product,
        builtinKind: cleared.builtinKind,
        communityModel: null,
        bankPoster,
      }),
      communityModel: null,
      bankPoster,
    };
  });
}

export interface AgenticListResolveResult extends Omit<AgenticResolveResult, 'items'> {
  items: AgenticReviewRow[];
  request: AgenticRoomRequest;
}

export function listResultToRoomRequest(list: AgenticFurnitureListResult): AgenticRoomRequest {
  return {
    widthIn: list.widthIn ?? inches(10),
    depthIn: list.depthIn ?? inches(12),
    heightIn: list.heightIn ?? ROOM.height,
    items: list.items,
    budgetCents: list.budgetCents,
    vibe: list.vibe,
  };
}

export function attachScanSidecarToReviewRows(
  rows: AgenticReviewRow[],
  listItems: AgenticFurnitureListResult['items'],
  sidecar: Record<string, RoomScanItemSidecar>,
  photos?: Record<string, string>,
): AgenticReviewRow[] {
  return rows.map((row, index) => {
    const scanId = listItems[index]?.scanId;
    if (!scanId) return row;
    const meta = sidecar[scanId];
    if (!meta) return row;
    const rotationY = meta.rotationY ?? 0;
    const scan: AgenticReviewScanMeta = {
      scanId,
      scanSizeIn: meta.sizeIn,
      scanLocationLabel: meta.locationLabel,
      scanPhotoDataUrl: photos?.[scanId],
    };
    if (meta.positionIn) {
      scan.scanPose = {
        x: meta.positionIn.x,
        z: meta.positionIn.z,
        rotationY,
      };
    }
    return { ...row, scan };
  });
}

export function resolveAgenticList(
  list: AgenticFurnitureListResult,
  products: CuratedProduct[],
  sourcePrompt?: string | null,
): AgenticListResolveResult {
  const request = listResultToRoomRequest(list);
  const result = resolveAgenticItems(request, products, sourcePrompt ?? undefined);
  const withOffers = result.items.map((item) => ({
    ...item,
    searchOffers:
      item.product?.affiliateUrl?.trim() ? [] : searchOffersForQuery(item.query),
  }));
  const items = toAgenticReviewRows(withOffers, list.theme, sourcePrompt ?? list.roomType);
  return { ...result, items, request };
}
