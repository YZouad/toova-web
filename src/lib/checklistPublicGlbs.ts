/** True when a curated product can be placed into the room designer. */
export function productHasPlaceableModel(product: {
  placeBuiltinKind: string | null;
  placeCatalogKind: string | null;
}): boolean {
  return Boolean(product.placeBuiltinKind || product.placeCatalogKind);
}
