import { supabase } from './supabase';
import {
  maxInchSide,
  parseInchDims,
  resolveImportedInitialSize,
  sizeRatiosMatchNatural,
  type InchSize,
} from './importedItemSize';
import type { Item } from '../store';

/** Attach catalog inch dimensions and fix sizes corrupted by mesh-unit copy. */
export async function patchImportedItemsFromCatalog(items: Item[]): Promise<void> {
  const paths = [
    ...new Set(
      items
        .filter((it) => it.kind === 'imported' && it.importedStoragePath)
        .map((it) => it.importedStoragePath as string),
    ),
  ];
  if (paths.length === 0) return;

  const { data, error } = await supabase
    .from('furniture_catalog')
    .select('model_url,width_in,height_in,depth_in')
    .in('model_url', paths);

  if (error || !data) return;

  const byPath = new Map<string, InchSize>();
  for (const row of data) {
    const path = String(row.model_url ?? '').trim();
    const dims = parseInchDims(row.width_in, row.height_in, row.depth_in);
    if (path && dims) byPath.set(path, dims);
  }

  for (const it of items) {
    if (it.kind !== 'imported' || !it.importedStoragePath) continue;
    const catalogSize = byPath.get(it.importedStoragePath);
    if (!catalogSize) continue;
    it.catalogSizeIn = catalogSize;
    const natural = it.importedNaturalSize;
    if (natural) {
      if (!sizeRatiosMatchNatural(it.size, natural)) {
        it.size = resolveImportedInitialSize(it.size, natural, catalogSize);
      }
    } else if (maxInchSide(it.size) <= 3) {
      it.size = resolveImportedInitialSize(it.size, it.size, catalogSize);
    }
  }
}
