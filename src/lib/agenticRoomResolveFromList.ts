import type { AffiliateOffer } from './affiliateLinks';
import { searchOffersForQuery } from './affiliateLinks';
import type { CuratedProduct } from './dormChecklist';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticRoomRequest } from './agenticRoomPrompt';
import {
  resolveAgenticItems,
  type AgenticResolveResult,
  type ResolvedAgenticItem,
} from './agenticRoomResolve';
import { inches, ROOM } from '../units';

export interface ResolvedAgenticItemWithOffers extends ResolvedAgenticItem {
  searchOffers: AffiliateOffer[];
}

export interface AgenticListResolveResult extends Omit<AgenticResolveResult, 'items'> {
  items: ResolvedAgenticItemWithOffers[];
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
  const items = result.items.map((item) => ({
    ...item,
    searchOffers:
      item.product?.affiliateUrl?.trim() ? [] : searchOffersForQuery(item.query),
  }));
  return { ...result, items, request };
}
