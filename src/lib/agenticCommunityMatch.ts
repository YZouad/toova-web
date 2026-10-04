import { expandQueryTerms } from './designerSearch';
import { searchDesignerCatalog } from './galleryCatalog';
import { buildGallerySearchParams } from './galleryCatalogHelpers';
import { resolveCatalogThumbnailUrl } from './modelStorage';

export interface AgenticCommunityMatch {
  kind: string;
  label: string;
  previewUrl: string | null;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  relevance: number;
}

export function communityGallerySearchPath(query: string): string {
  return buildGallerySearchParams({
    mode: 'models',
    source: 'community',
    query: query.trim(),
  });
}

/** Top community gallery models for a shopping-list line (3D assets, not shop products). */
export async function fetchCommunityMatchesForQuery(
  query: string,
  limit = 3,
): Promise<AgenticCommunityMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const hits = await searchDesignerCatalog({
    query: q,
    terms: expandQueryTerms(q),
    limit: Math.max(limit * 3, 8),
    includeMine: false,
  });

  const communityHits = hits.filter((hit) => hit.source === 'community').slice(0, limit);

  return Promise.all(
    communityHits.map(async (hit) => {
      let previewUrl: string | null = null;
      const thumb = hit.thumbnail_path?.trim();
      if (thumb) {
        previewUrl = await resolveCatalogThumbnailUrl(thumb, { access: 'public' });
      }
      return {
        kind: hit.kind,
        label: hit.label,
        previewUrl,
        creatorHandle: hit.creator_handle,
        creatorDisplayName: hit.creator_display_name,
        relevance: hit.relevance,
      };
    }),
  );
}

/** Batch-fetch community matches for multiple checklist queries. */
export async function fetchCommunityMatchesByQuery(
  queries: string[],
  limitPerQuery = 3,
): Promise<Record<string, AgenticCommunityMatch[]>> {
  const unique = [...new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 2))];
  if (unique.length === 0) return {};

  const entries = await Promise.all(
    unique.map(async (query) => {
      try {
        const matches = await fetchCommunityMatchesForQuery(query, limitPerQuery);
        return [query, matches] as const;
      } catch {
        return [query, []] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
