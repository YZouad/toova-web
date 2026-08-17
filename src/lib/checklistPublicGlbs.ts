/** True when a curated product can be placed into the room designer. */
export function productHasPlaceableModel(product: {
  placeBuiltinKind: string | null;
  placeCatalogKind: string | null;
}): boolean {
  return Boolean(product.placeBuiltinKind || product.placeCatalogKind);
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
