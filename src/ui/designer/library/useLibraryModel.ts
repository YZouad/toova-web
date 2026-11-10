import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useGalleryCatalog } from '../../../hooks/useGalleryCatalog';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../../../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../../../lib/galleryCatalog';
import {
  buildRoomTagSuggestions,
  essentialLabel,
  suggestionForSelection,
  type AreaSuggestion,
} from '../../../lib/roomTagSuggestions';
import { trackCatalogItemPlaced, trackRoomTagSuggestionPlaced } from '../../../lib/analytics';
import { useStore } from '../../../store';
import type { CatalogModel } from '../chromeTypes';
import { placeFromCatalog } from '../placeCatalogModel';
import type { PlaceContext, PlaceMethod } from './libraryTypes';

export const LIBRARY_SORT_OPTIONS: { id: GallerySort; label: string }[] = [
  { id: 'hot', label: 'Popular now' },
  { id: 'downloads', label: 'Most placed' },
  { id: 'likes', label: 'Most liked' },
  { id: 'views', label: 'Most viewed' },
  { id: 'newest', label: 'Newest' },
];

export const LIBRARY_SOURCE_TABS: { id: GallerySource; label: string; sub: string }[] = [
  { id: 'toova', label: 'Toova library', sub: 'Curated' },
  { id: 'community', label: 'Community', sub: 'Shared' },
  { id: 'mine', label: 'Your models', sub: 'Uploads' },
];

export interface PlaceOpts {
  method?: PlaceMethod;
  spawnAt?: [number, number];
  shoppable?: boolean;
  selectAfter?: boolean;
  /** Skip analytics (e.g. provisional Try-in-room place). */
  skipTrack?: boolean;
  context?: PlaceContext;
}

export function useLibraryModel(opts?: { isAdmin?: boolean }) {
  const { user } = useAuth();
  const [source, setSource] = useState<GallerySource>('toova');
  const [sort, setSort] = useState<GallerySort>('hot');
  const [categories, setCategories] = useState<CatalogCategorySlug[]>([]);
  const [query, setQuery] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeFaceKey, setActiveFaceKey] = useState<string | null>(null);

  const roomGeometry = useStore((s) => s.roomGeometry);
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const selectedId = useStore((s) => s.selectedId);
  const addItem = useStore((s) => s.addItem);
  const select = useStore((s) => s.select);
  const removeItem = useStore((s) => s.removeItem);

  const itemList = useMemo(
    () => order.map((id) => items[id]).filter((it): it is NonNullable<typeof it> => !!it),
    [order, items],
  );
  const selectedItem = selectedId ? items[selectedId] ?? null : null;

  const suggestionReport = useMemo(
    () => buildRoomTagSuggestions(roomGeometry, itemList),
    [roomGeometry, itemList],
  );

  const activeSuggestion: AreaSuggestion | null = useMemo(() => {
    if (activeFaceKey) {
      return suggestionReport.areas.find((a) => a.faceKey === activeFaceKey) ?? null;
    }
    return suggestionForSelection(suggestionReport, roomGeometry, selectedItem);
  }, [activeFaceKey, suggestionReport, roomGeometry, selectedItem]);

  useEffect(() => {
    if (!activeFaceKey && activeSuggestion) {
      setActiveFaceKey(activeSuggestion.faceKey);
    }
  }, [activeFaceKey, activeSuggestion]);

  const catalog = useGalleryCatalog({
    enabled: true,
    source,
    sort,
    categories,
    query,
    isAdmin: opts?.isAdmin,
  });

  const sortLabel = LIBRARY_SORT_OPTIONS.find((o) => o.id === sort)?.label ?? 'Hot';

  const place = useCallback(
    async (model: CatalogModel, opts: PlaceOpts = {}) => {
      const method = opts.method ?? 'click';
      const spawnAt = opts.spawnAt ?? activeSuggestion?.labelAnchor;
      const id = await placeFromCatalog(model, { userId: user?.id, spawnAt });
      if (id) {
        if (!opts.skipTrack) {
          trackCatalogItemPlaced({
            variant: 'showroom',
            method,
            kind: model.kind,
            shoppable: !!opts.shoppable,
            context: opts.context,
          });
          if (activeSuggestion && method !== 'essential') {
            trackRoomTagSuggestionPlaced({
              tag: activeSuggestion.tag,
              kind: model.kind,
            });
          }
        }
        if (opts.selectAfter) select(id);
      }
      return id;
    },
    [user?.id, activeSuggestion, select],
  );

  const placeEssential = useCallback(
    (kind: AreaSuggestion['missingEssentials'][number]) => {
      if (!activeSuggestion) return null;
      const id = addItem(kind, { spawnAt: activeSuggestion.labelAnchor });
      if (id) {
        trackCatalogItemPlaced({
          variant: 'showroom',
          method: 'essential',
          kind,
          shoppable: false,
          context: 'essentials',
        });
        trackRoomTagSuggestionPlaced({
          tag: activeSuggestion.tag,
          kind,
          essential: true,
        });
      }
      return id;
    },
    [activeSuggestion, addItem],
  );

  /** Select an area for progress / spawn / for-you — do NOT AND-filter the catalog. */
  const applySuggestionCategories = useCallback((area: AreaSuggestion) => {
    setActiveFaceKey(area.faceKey);
  }, []);

  const toggleCat = useCallback((slug: CatalogCategorySlug) => {
    setCategories((cur) => toggleCatalogCategory(cur, slug));
  }, []);

  const setSourceTab = useCallback((id: GallerySource) => {
    setSource(id);
    if (id === 'mine' && sort === 'hot') setSort('newest');
    else if (id !== 'mine' && sort === 'newest') setSort('hot');
  }, [sort]);

  return {
    user,
    source,
    setSource: setSourceTab,
    sort,
    setSort,
    sortOpen,
    setSortOpen,
    sortLabel,
    categories,
    setCategories,
    toggleCat,
    query,
    setQuery,
    activeFaceKey,
    setActiveFaceKey,
    suggestionReport,
    activeSuggestion,
    applySuggestionCategories,
    place,
    placeEssential,
    essentialLabel,
    select,
    removeItem,
    items,
    order,
    categoryDefs: CATALOG_CATEGORY_DEFS,
    maxCategories: MAX_CATALOG_CATEGORIES,
    ...catalog,
  };
}

export type LibraryModelApi = ReturnType<typeof useLibraryModel>;
