import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { recordCatalogDownload } from './catalogEngagement';
import type { CuratedProduct } from './dormChecklist';
import { parseInchDims } from './importedItemSize';
import { resolveBrowsableModelUrl } from './modelStorage';
import { supabase } from './supabase';
import { useStore } from '../store';

/** Place a curated checklist product into the room (builtin or catalog GLB). */
export async function placeCuratedProduct(product: CuratedProduct): Promise<string | null> {
  const { addItem } = useStore.getState();

  if (product.placeBuiltinKind && product.placeBuiltinKind in FURNITURE) {
    return addItem(product.placeBuiltinKind as Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>, {
      label: product.name,
      curatedProductId: product.id,
    });
  }

  if (!product.placeCatalogKind) return null;

  const { data, error: qErr } = await supabase
    .from('furniture_catalog')
    .select('kind,label,model_url,width_in,height_in,depth_in')
    .eq('kind', product.placeCatalogKind)
    .maybeSingle();
  if (qErr || !data?.model_url) return null;

  const path = String(data.model_url).trim();
  const signed = await resolveBrowsableModelUrl(path);
  if (!signed) return null;

  const catalogSizeIn = parseInchDims(
    Number(data.width_in),
    Number(data.height_in),
    Number(data.depth_in),
  );

  const id = addItem('imported', {
    url: signed,
    storagePath: path,
    label: product.name || String(data.label),
    catalogSizeIn: catalogSizeIn ?? undefined,
    curatedProductId: product.id,
  });
  void recordCatalogDownload(String(data.kind)).catch(() => {});
  return id;
}

/** Room item id covering this product (by curated id or placeable kind). */
export function findRoomItemForProduct(
  product: CuratedProduct,
  items: ReturnType<typeof useStore.getState>['items'],
  order: string[],
): string | null {
  for (const id of order) {
    const it = items[id];
    if (!it) continue;
    if (it.curatedProductId === product.id) return id;
  }
  for (const id of order) {
    const it = items[id];
    if (!it) continue;
    if (product.placeBuiltinKind && it.kind === product.placeBuiltinKind) return id;
    if (product.placeCatalogKind && it.kind === product.placeCatalogKind) return id;
  }
  return null;
}
