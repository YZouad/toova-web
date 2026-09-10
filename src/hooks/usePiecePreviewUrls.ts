import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mapImportedPreviewUrls,
  resolveCatalogPreviewUrls,
  type CatalogPreviewMaps,
} from '../lib/catalogPreviewUrls';
import { getSessionCatalogPreview } from '../lib/catalogThumbnailBackfill';
import type { Item } from '../store';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from './useBuiltinPreviews';

const EMPTY_CATALOG: CatalogPreviewMaps = {
  byModelUrl: new Map(),
  byKind: new Map(),
};

function importedFingerprint(items: Item[]): string {
  return items
    .filter((it) => it.kind === 'imported')
    .map((it) => `${it.importedStoragePath ?? ''}\t${it.catalogKind ?? ''}`)
    .sort()
    .join('\n');
}

/** JPEG URLs for pieces-menu tiles: catalog thumbs for imports, procedural JPEGs for builtins. */
export function usePiecePreviewUrls(items: Item[]): Record<string, string> {
  const builtins = useBuiltinPreviews();
  const [catalog, setCatalog] = useState<CatalogPreviewMaps>(EMPTY_CATALOG);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const fingerprint = importedFingerprint(items);

  useEffect(() => {
    const lookups = itemsRef.current
      .filter((it) => it.kind === 'imported')
      .map((it) => ({
        modelUrl: it.importedStoragePath,
        kind: it.catalogKind,
      }));
    if (lookups.length === 0) {
      setCatalog(EMPTY_CATALOG);
      return;
    }
    let cancelled = false;
    void resolveCatalogPreviewUrls(lookups).then((maps) => {
      if (!cancelled) setCatalog(maps);
    });
    return () => {
      cancelled = true;
    };
  }, [fingerprint]);

  return useMemo(() => {
    const imported = mapImportedPreviewUrls(items, catalog, getSessionCatalogPreview);
    const out: Record<string, string> = { ...imported };
    for (const it of items) {
      if (out[it.id]) continue;
      if (it.kind === 'imported' || it.kind === 'hanging' || it.kind === 'light') continue;
      const builtin = getBuiltinPreviewUrl(it.kind, builtins);
      if (builtin) out[it.id] = builtin;
    }
    return out;
  }, [items, catalog, builtins]);
}
