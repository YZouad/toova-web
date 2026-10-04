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

export interface ResolvedAgenticItemWithOffers extends ResolvedAgenticItem {
  searchOffers: AffiliateOffer[];
}

export interface AgenticReviewRow extends ResolvedAgenticItemWithOffers {
  placeInRoom: boolean;
  communityModel: AgenticCommunityMatch | null;
  bankPoster: AgenticPosterMatch | null;
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
    heightIn: ROOM.height,
    items: list.items,
    budgetCents: list.budgetCents,
    vibe: list.vibe,
  };
}

export function resolveAgenticList(
  list: AgenticFurnitureListResult,
  products: CuratedProduct[],
  sourcePrompt?: string | null,
): AgenticListResolveResult {
  const request = listResultToRoomRequest(list);
  const result = resolveAgenticItems(request, products);
  const withOffers = result.items.map((item) => ({
    ...item,
    searchOffers:
      item.product?.affiliateUrl?.trim() ? [] : searchOffersForQuery(item.query),
  }));
  const items = toAgenticReviewRows(withOffers, list.theme, sourcePrompt ?? list.roomType);
  return { ...result, items, request };
}
