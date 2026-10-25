import { FURNITURE, type GalleryFurnitureKind } from '../../furniture/registry';
import type { CuratedProduct } from '../dormChecklist';
import { resolvePlaceBeddingKind } from '../dormChecklist';
import { productHasPlaceableModel } from '../checklistPublicGlbs';
import { normalizeSearchText } from '../designerSearch';
import type { ResolvedAgenticItem } from '../agenticRoomResolve';

const BEDDING_QUERY =
  /\b(bedding|comforter|sheets|duvet|pillow|mattress\s+topper|blanket)\b/i;

const STRUCTURAL_BED_QUERY =
  /\b(beds?|bed\s+frames?|twin\s+xl?\s+bed|queen\s+bed|full\s+bed|king\s+bed)\b/i;

/** Map casual "add a bed" phrasing to a catalog-friendly furniture query. */
export function normalizeReviseAddQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const n = normalizeSearchText(trimmed);
  if (BEDDING_QUERY.test(n) && !/\b(frame|frames)\b/.test(n)) return trimmed;
  if (n === 'bed' || n === 'beds' || /\badd\s+(a\s+)?beds?\b/.test(n)) {
    return 'twin bed frame';
  }
  if (/\bbeds?\b/.test(n) && !/\bframe/.test(n)) {
    return trimmed.replace(/\bbeds?\b/i, 'twin bed frame');
  }
  return trimmed;
}

function isBeddingProduct(product: CuratedProduct): boolean {
  return Boolean(resolvePlaceBeddingKind(product));
}

function isPlaceableFurniture(product: CuratedProduct): boolean {
  return productHasPlaceableModel(product) && !isBeddingProduct(product);
}

function pickBedProduct(candidates: Array<CuratedProduct | null | undefined>): CuratedProduct | null {
  for (const p of candidates) {
    if (p && p.placeBuiltinKind === 'bed' && isPlaceableFurniture(p)) return p;
  }
  for (const p of candidates) {
    if (p && isPlaceableFurniture(p) && /\bbed\b/i.test(p.name)) return p;
  }
  return null;
}

function wantsStructuralBed(query: string): boolean {
  const n = normalizeSearchText(query);
  if (BEDDING_QUERY.test(n) && !/\b(frame|frames)\b/.test(n)) return false;
  return STRUCTURAL_BED_QUERY.test(n);
}

/**
 * Revise chat should propose real room furniture, not checklist accessories
 * (storage bins, bedding SKUs) when the user asked for beds, desks, etc.
 */
export function refineReviseAddRow(
  query: string,
  row: ResolvedAgenticItem,
  allProducts: CuratedProduct[],
): {
  product: CuratedProduct | null;
  alternates: CuratedProduct[];
  builtinKind: GalleryFurnitureKind | null;
  label: string;
} {
  const normalizedQuery = normalizeReviseAddQuery(query);
  let product = row.product;
  let builtinKind = row.builtinKind;

  const pool = [product, ...row.alternates, ...allProducts].filter(
    (p): p is CuratedProduct => !!p && p.published,
  );

  const placeablePool = pool.filter(isPlaceableFurniture);
  const uniquePlaceable = [...new Map(placeablePool.map((p) => [p.id, p])).values()];

  if (product && !isPlaceableFurniture(product)) {
    product = null;
  }

  if (wantsStructuralBed(normalizedQuery)) {
    const bedProduct = pickBedProduct([product, ...row.alternates, ...uniquePlaceable]);
    if (bedProduct) {
      product = bedProduct;
      builtinKind = null;
    } else {
      product = null;
      builtinKind = builtinKind ?? 'bed';
    }
  } else if (!product && builtinKind == null) {
    const placeable = uniquePlaceable.find((p) =>
      normalizeSearchText(p.name).includes(normalizeSearchText(normalizedQuery).split(' ')[0] ?? ''),
    );
    if (placeable) product = placeable;
  }

  if (!product && !builtinKind && row.builtinKind) {
    builtinKind = row.builtinKind;
  }

  const alternates = uniquePlaceable
    .filter((p) => p.id !== product?.id)
    .slice(0, 6);

  const label =
    product?.name ??
    (builtinKind ? FURNITURE[builtinKind].label : normalizedQuery);

  return { product, alternates, builtinKind, label };
}
