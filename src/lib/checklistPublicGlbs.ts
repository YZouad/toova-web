import { resolvePlaceHangingKind, type CuratedProduct } from './dormChecklist';

/** True when a curated product can be placed into the room designer. */
export function productHasPlaceableModel(
  product: Pick<CuratedProduct, 'slug' | 'placeBuiltinKind' | 'placeCatalogKind' | 'placeHangingKind'>,
): boolean {
  return Boolean(
    product.placeBuiltinKind || product.placeCatalogKind || resolvePlaceHangingKind(product),
  );
}

export const CHECKLIST_RUG_MODEL_PATH = 'checklist-refs/glb/rug.glb';
export const DEFAULT_RUG_COLOR = '#d8d0c2';

export function isChecklistRug(item: {
  importedStoragePath?: string | null;
  label?: string | null;
}): boolean {
  const path = item.importedStoragePath?.trim() ?? '';
  if (path === CHECKLIST_RUG_MODEL_PATH || path.endsWith('/rug.glb')) return true;
  return (item.label ?? '').trim().toLowerCase() === 'rug';
}
