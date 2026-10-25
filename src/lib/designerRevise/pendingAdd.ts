import { FURNITURE, type GalleryFurnitureKind } from '../../furniture/registry';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import type { CatalogCategorySlug } from '../catalogCategories';
import type { CuratedProduct } from '../dormChecklist';
import { resolveAgenticItems } from '../agenticRoomResolve';
import { normalizeReviseAddQuery, refineReviseAddRow } from './reviseAddResolve';
import type { RevisePlacementHint } from './reviseSchema';

export interface PendingAddCandidate {
  product: CuratedProduct | null;
  alternates: CuratedProduct[];
  builtinKind: GalleryFurnitureKind | null;
  label: string;
  previewUrl: string | null;
  catalogKind: string | null;
  sizeIn: [number, number, number] | null;
}

export interface PendingAddProposal {
  proposalId: string;
  query: string;
  placement: RevisePlacementHint;
  selectedProductId: string | null;
  candidate: PendingAddCandidate;
}

function builtinSize(kind: GalleryFurnitureKind): [number, number, number] {
  const def = FURNITURE[kind];
  return [...def.size] as [number, number, number];
}

export function resolvePendingAddProposal(
  query: string,
  products: CuratedProduct[],
  placement: RevisePlacementHint = 'center',
): PendingAddProposal | null {
  const normalizedQuery = normalizeReviseAddQuery(query);
  const resolved = resolveAgenticItems(
    { widthIn: 120, depthIn: 144, heightIn: 96, items: [{ query: normalizedQuery, qty: 1 }] },
    products,
    normalizedQuery,
  );
  const row = resolved.items[0];
  if (!row) return null;

  const refined = refineReviseAddRow(normalizedQuery, row, products);
  const { product, alternates, builtinKind, label } = refined;

  if (!product && !builtinKind) return null;

  let catalogKind: string | null = product?.placeCatalogKind ?? null;
  const kindForSize =
    (builtinKind ??
      (product?.placeBuiltinKind as GalleryFurnitureKind | null)) ??
    null;
  let sizeIn: [number, number, number] | null =
    kindForSize && kindForSize in FURNITURE ? builtinSize(kindForSize) : null;

  return {
    proposalId: `revise-add-${crypto.randomUUID().slice(0, 8)}`,
    query: normalizedQuery,
    placement,
    selectedProductId: product?.id ?? null,
    candidate: {
      product,
      alternates,
      builtinKind,
      label,
      previewUrl: product?.imageUrl ?? null,
      catalogKind,
      sizeIn,
    },
  };
}

export function galleryModelForPendingProposal(
  proposal: PendingAddProposal,
  product: CuratedProduct | null,
  builtinPreviewUrl: string | null,
): GalleryModel | null {
  const { candidate } = proposal;
  const chosen = product ?? candidate.product;

  if (chosen?.placeCatalogKind) {
    return {
      kind: chosen.placeCatalogKind,
      label: chosen.name,
      description: chosen.description || null,
      tags: [],
      categories: [],
      width_in: candidate.sizeIn?.[0] ?? 24,
      height_in: candidate.sizeIn?.[1] ?? 24,
      depth_in: candidate.sizeIn?.[2] ?? 24,
      clearance_in: null,
      userId: null,
      visibility: 'public',
      isBuiltin: false,
      likesCount: 0,
      downloadsCount: 0,
      viewsCount: 0,
      createdAt: new Date().toISOString(),
      creatorHandle: null,
      creatorDisplayName: null,
      likedByMe: false,
      hotScore: 0,
      storagePath: '',
      signedUrl: null,
      previewUrl: chosen.imageUrl ?? candidate.previewUrl,
    };
  }

  const kind = candidate.builtinKind ?? chosen?.placeBuiltinKind;
  if (kind && kind in FURNITURE) {
    const def = FURNITURE[kind as GalleryFurnitureKind];
    return {
      kind,
      label: def.label,
      description: null,
      tags: [],
      categories: (def.categories ?? []) as CatalogCategorySlug[],
      width_in: def.size[0],
      height_in: def.size[1],
      depth_in: def.size[2],
      clearance_in: def.clearance ?? null,
      userId: null,
      visibility: 'public',
      isBuiltin: true,
      likesCount: 0,
      downloadsCount: 0,
      viewsCount: 0,
      createdAt: new Date().toISOString(),
      creatorHandle: null,
      creatorDisplayName: null,
      likedByMe: false,
      hotScore: 0,
      storagePath: '',
      signedUrl: null,
      previewUrl: builtinPreviewUrl,
    };
  }

  return null;
}

export function activeProductForProposal(proposal: PendingAddProposal): CuratedProduct | null {
  const { candidate, selectedProductId } = proposal;
  if (selectedProductId) {
    if (candidate.product?.id === selectedProductId) return candidate.product;
    const alt = candidate.alternates.find((p) => p.id === selectedProductId);
    if (alt) return alt;
  }
  return candidate.product;
}
