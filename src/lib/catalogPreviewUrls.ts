import { getSessionCatalogPreview } from './catalogThumbnailBackfill';
import { resolveCatalogThumbnailUrl } from './modelStorage';
import { supabase } from './supabase';

export interface CatalogPreviewLookup {
  modelUrl?: string | null;
  kind?: string | null;
}

export interface CatalogPreviewMaps {
  byModelUrl: Map<string, string>;
  byKind: Map<string, string>;
}

const cachedByModelUrl = new Map<string, string>();
const cachedByKind = new Map<string, string>();

export function clearCatalogPreviewUrlCache() {
  cachedByModelUrl.clear();
  cachedByKind.clear();
}

export function catalogPreviewAccess(
  visibility: string | null | undefined,
): 'public' | 'private' {
  return visibility === 'public' ? 'public' : 'private';
}

export function mapImportedPreviewUrls(
  items: Array<{
    id: string;
    importedStoragePath?: string | null;
    catalogKind?: string | null;
  }>,
  catalog: CatalogPreviewMaps,
  sessionPreview: (kind: string) => string | undefined = getSessionCatalogPreview,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) {
    const session = it.catalogKind ? sessionPreview(it.catalogKind) : undefined;
    const url =
      session ??
      (it.importedStoragePath
        ? catalog.byModelUrl.get(it.importedStoragePath)
        : undefined) ??
      (it.catalogKind ? catalog.byKind.get(it.catalogKind) : undefined);
    if (url) out[it.id] = url;
  }
  return out;
}

function emptyMaps(): CatalogPreviewMaps {
  return { byModelUrl: new Map(), byKind: new Map() };
}

function remember(modelUrl: string | null, kind: string | null, url: string) {
  if (modelUrl) cachedByModelUrl.set(modelUrl, url);
  if (kind) cachedByKind.set(kind, url);
}

/**
 * Resolve JPEG thumbnail URLs for placed catalog/imported models.
 * Signs the origin bucket first (missing R2 mirrors 404 as HTML).
 */
export async function resolveCatalogPreviewUrls(
  lookups: CatalogPreviewLookup[],
): Promise<CatalogPreviewMaps> {
  const out = emptyMaps();
  const modelUrls = [
    ...new Set(lookups.map((l) => l.modelUrl?.trim() ?? '').filter(Boolean)),
  ];
  const kinds = [...new Set(lookups.map((l) => l.kind?.trim() ?? '').filter(Boolean))];
  if (modelUrls.length === 0 && kinds.length === 0) return out;

  for (const url of modelUrls) {
    const sessionKind = lookups.find((l) => l.modelUrl === url)?.kind?.trim();
    const session = sessionKind ? getSessionCatalogPreview(sessionKind) : undefined;
    const cached = session ?? cachedByModelUrl.get(url);
    if (cached) out.byModelUrl.set(url, cached);
  }
  for (const kind of kinds) {
    const cached = getSessionCatalogPreview(kind) ?? cachedByKind.get(kind);
    if (cached) out.byKind.set(kind, cached);
  }

  const missingUrls = modelUrls.filter((u) => !out.byModelUrl.has(u));
  const missingKinds = kinds.filter((k) => !out.byKind.has(k));
  if (missingUrls.length === 0 && missingKinds.length === 0) return out;

  const rows = await fetchCatalogPreviewRows(missingUrls, missingKinds);
  await Promise.all(
    rows.map(async (row) => {
      const modelUrl = String(row.model_url ?? '').trim();
      const kind = String(row.kind ?? '').trim();
      const thumbPath = String(row.thumbnail_path ?? '').trim();
      const access = catalogPreviewAccess(String(row.visibility ?? ''));
      let url: string | null = null;
      if (thumbPath) {
        url = await resolveCatalogThumbnailUrl(thumbPath, { access });
      }
      if (!url && kind) url = getSessionCatalogPreview(kind) ?? null;
      if (!url) return;
      remember(modelUrl || null, kind || null, url);
      if (modelUrl) out.byModelUrl.set(modelUrl, url);
      if (kind) out.byKind.set(kind, url);
    }),
  );

  return out;
}

interface CatalogPreviewRow {
  kind: string | null;
  model_url: string | null;
  thumbnail_path: string | null;
  visibility: string | null;
}

async function fetchCatalogPreviewRows(
  modelUrls: string[],
  kinds: string[],
): Promise<CatalogPreviewRow[]> {
  const select = 'kind,model_url,thumbnail_path,visibility';
  const rows: CatalogPreviewRow[] = [];
  if (modelUrls.length > 0) {
    const { data, error } = await supabase
      .from('furniture_catalog')
      .select(select)
      .in('model_url', modelUrls);
    if (!error && data) rows.push(...(data as CatalogPreviewRow[]));
  }
  const foundKinds = new Set(rows.map((r) => String(r.kind ?? '').trim()).filter(Boolean));
  const stillMissingKinds = kinds.filter((k) => !foundKinds.has(k));
  if (stillMissingKinds.length > 0) {
    const { data, error } = await supabase
      .from('furniture_catalog')
      .select(select)
      .in('kind', stillMissingKinds);
    if (!error && data) rows.push(...(data as CatalogPreviewRow[]));
  }
  return rows;
}
