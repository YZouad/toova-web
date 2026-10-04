import type { AffiliateOffer } from './affiliateLinks';
import { searchOffersForQuery } from './affiliateLinks';
import type { CuratedProduct } from './dormChecklist';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticRoomRequest } from './agenticRoomPrompt';
import type { AgenticCommunityMatch } from './agenticCommunityMatch';
import type { AgenticPosterMatch } from './agenticPosterMatch';
import { resolveAgenticPoster } from './agenticPosterMatch';
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
): AgenticReviewRow[] {
  return items.map((item) => {
    const bankPoster = resolveAgenticPoster(item.query, theme ?? undefined);
    return {
      ...item,
      placeInRoom: defaultPlaceInRoom({
        query: item.query,
        product: item.product,
        builtinKind: item.builtinKind,
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
): AgenticListResolveResult {
  const request = listResultToRoomRequest(list);
  const result = resolveAgenticItems(request, products);
  const withOffers = result.items.map((item) => ({
    ...item,
    searchOffers:
      item.product?.affiliateUrl?.trim() ? [] : searchOffersForQuery(item.query),
  }));
  const items = toAgenticReviewRows(withOffers, list.theme);
  return { ...result, items, request };
}
