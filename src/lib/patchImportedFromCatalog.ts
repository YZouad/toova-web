import { supabase } from './supabase';
import {
  maxInchSide,
  parseInchDims,
  resolveImportedInitialSize,
  sizeRatiosMatchNatural,
  type InchSize,
} from './importedItemSize';
import type { Item } from '../store';

export interface CatalogRowByPath {
  kind: string;
  dims: InchSize;
}

/** Apply catalog inch dimensions and fix sizes corrupted by mesh-unit copy. */
export function applyCatalogSizes(
  items: Item[],
  dimsByPath: Map<string, InchSize>,
): void {
  for (const it of items) {
    if (it.kind !== 'imported' || !it.importedStoragePath) continue;
    const catalogSize = dimsByPath.get(it.importedStoragePath);
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

/** Backfill furniture_catalog.kind on imported items from model_url. */
export function applyCatalogKinds(
  items: Item[],
  kindByPath: Map<string, string>,
): void {
  for (const it of items) {
    if (it.kind !== 'imported' || !it.importedStoragePath || it.catalogKind) continue;
    const kind = kindByPath.get(it.importedStoragePath);
    if (kind) it.catalogKind = kind;
  }
}

export async function fetchCatalogByModelPath(
  paths: string[],
): Promise<Map<string, CatalogRowByPath>> {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  const byPath = new Map<string, CatalogRowByPath>();
  if (unique.length === 0) return byPath;

  const { data, error } = await supabase
    .from('furniture_catalog')
    .select('kind,model_url,width_in,height_in,depth_in')
    .in('model_url', unique);

  if (error || !data) return byPath;

  for (const row of data) {
    const path = String(row.model_url ?? '').trim();
    const kind = String(row.kind ?? '').trim();
    const dims = parseInchDims(row.width_in, row.height_in, row.depth_in);
    if (path && kind && dims) byPath.set(path, { kind, dims });
  }
  return byPath;
}

export async function fetchCatalogDims(
  paths: string[],
): Promise<Map<string, InchSize>> {
  const byPath = await fetchCatalogByModelPath(paths);
  const dimsOnly = new Map<string, InchSize>();
  for (const [path, row] of byPath) dimsOnly.set(path, row.dims);
  return dimsOnly;
}

/** Attach catalog inch dimensions, kinds, and fix sizes corrupted by mesh-unit copy. */
export async function patchImportedItemsFromCatalog(items: Item[]): Promise<void> {
  const paths = [
    ...new Set(
      items
        .filter((it) => it.kind === 'imported' && it.importedStoragePath)
        .map((it) => it.importedStoragePath as string),
    ),
  ];
  if (paths.length === 0) return;
  const byPath = await fetchCatalogByModelPath(paths);
  const dimsByPath = new Map<string, InchSize>();
  const kindByPath = new Map<string, string>();
  for (const [path, row] of byPath) {
    dimsByPath.set(path, row.dims);
    kindByPath.set(path, row.kind);
  }
  applyCatalogSizes(items, dimsByPath);
  applyCatalogKinds(items, kindByPath);
}

export function catalogDimsFromRpc(
  raw: Record<string, [number, number, number] | number[]> | undefined,
): Map<string, InchSize> {
  const byPath = new Map<string, InchSize>();
  if (!raw) return byPath;
  for (const [path, dims] of Object.entries(raw)) {
    if (!Array.isArray(dims) || dims.length < 3) continue;
    const w = Number(dims[0]);
    const h = Number(dims[1]);
    const d = Number(dims[2]);
    if (![w, h, d].every((n) => Number.isFinite(n) && n > 0)) continue;
    byPath.set(path, [w, h, d]);
  }
  return byPath;
}
