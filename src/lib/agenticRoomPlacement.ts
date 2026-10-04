import type { GalleryFurnitureKind } from '../furniture/registry';
import type { AgenticCommunityMatch } from './agenticCommunityMatch';
import type { AgenticPosterMatch } from './agenticPosterMatch';
import { productHasPlaceableModel } from './checklistPublicGlbs';
import {
  getProductDrawKind,
  resolvePlaceBeddingKind,
  resolvePlaceHangingKind,
  type CuratedProduct,
} from './dormChecklist';

const CHECKLIST_ONLY =
  /\b(bedding|comforter|sheets|duvet|pillow|mattress|blanket|throw|poster|print|artwork|wall art|canvas|rug|area rug|carpet|mat|string lights|led strip|hanging leaves|garland)\b/i;

function isChecklistOnlyRow(row: {
  query: string;
  product?: CuratedProduct | null;
}): boolean {
  if (row.product && resolvePlaceBeddingKind(row.product)) return true;
  if (row.product && resolvePlaceHangingKind(row.product)) return true;
  if (row.product && getProductDrawKind(row.product)) return true;
  return CHECKLIST_ONLY.test(row.query);
}

/** Default “Place in room” for a resolved checklist row. */
export function defaultPlaceInRoom(row: {
  query: string;
  product?: CuratedProduct | null;
  builtinKind?: GalleryFurnitureKind | null;
  communityModel?: AgenticCommunityMatch | null;
  bankPoster?: AgenticPosterMatch | null;
}): boolean {
  if (row.bankPoster) return true;
  if (row.communityModel) return true;
  if (isChecklistOnlyRow(row)) return false;
  if (row.product && productHasPlaceableModel(row.product)) return true;
  if (row.builtinKind) return true;
  return false;
}

export function rowCanPlaceInRoom(row: {
  query: string;
  product?: CuratedProduct | null;
  builtinKind?: GalleryFurnitureKind | null;
  communityModel?: AgenticCommunityMatch | null;
  bankPoster?: AgenticPosterMatch | null;
}): boolean {
  if (row.bankPoster) return true;
  if (row.communityModel) return true;
  if (isChecklistOnlyRow(row)) return false;
  if (row.product && productHasPlaceableModel(row.product)) return true;
  if (row.builtinKind) return true;
  return false;
}
