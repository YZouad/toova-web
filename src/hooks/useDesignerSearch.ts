import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { BUILTIN_CATEGORIES } from '../lib/catalogCategories';
import {
  expandQueryTerms,
  filterByScope,
  highlightRanges,
  normalizeSearchText,
  parseScopedQuery,
  parseSearchIntent,
  rankCandidates,
  softRoomFit,
} from '../lib/designerSearch';
import type { CuratedProduct } from '../lib/dormChecklist';
import {
  searchDesignerCatalog,
  type DesignerCatalogSearchHit,
} from '../lib/galleryCatalog';
import { planBounds } from '../lib/roomGeometry';
import {
  loadRecent,
  loadRecentCommands,
  pushRecentQuery,
} from '../lib/recentCatalogKinds';
import { resolveBrowsableModelUrl } from '../lib/modelStorage';
import { useStore } from '../store';
import type { GalleryModel } from './useGalleryCatalog';
import type { CommandPaletteCommand } from '../ui/designer/commandPaletteCommands';
import { actionIconFor } from '../ui/designer/commandPaletteCommands';
import type {
  SearchResult,
  SearchScope,
  SearchStatus,
  ScoredCandidate,
} from '../ui/designer/commandSearchTypes';

const DEBOUNCE_MS = 200;
const REMOTE_LIMIT = 12;

export interface UseDesignerSearchInput {
  open: boolean;
  query: string;
  commands: CommandPaletteCommand[];
  checklistProducts: CuratedProduct[];
  /** Product ids currently on the shopping list / checklist progress. */
  checklistProductIds: Set<string>;
  /** Kinds that satisfy an outstanding checklist requirement. */
  checklistKinds: Set<string>;
  onPlaceModel: (model: GalleryModel, andEdit?: boolean) => void;
  onPlaceProduct: (product: CuratedProduct, andEdit?: boolean) => void;
  onStartDraw: (kind: 'lights' | 'leaves') => void;
  onAddLight: () => void;
  onSelectItem: (id: string) => void;
  onEditItem: (id: string) => void;
  onOpenAddPanel?: () => void;
  includeMine?: boolean;
}

function hitToModel(hit: DesignerCatalogSearchHit, previewUrl: string | null): GalleryModel {
  const path = hit.model_url?.trim() ?? '';
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  return {
    kind: hit.kind,
    label: hit.label,
    description: hit.description,
    tags: hit.tags,
    categories: hit.categories,
    width_in: hit.width_in,
    height_in: hit.height_in,
    depth_in: hit.depth_in,
    clearance_in: hit.clearance_in,
    userId: hit.user_id,
    visibility: hit.visibility,
    isBuiltin: hit.is_builtin,
    likesCount: hit.likes_count,
    downloadsCount: hit.downloads_count,
    viewsCount: hit.views_count,
    createdAt: hit.created_at,
    creatorHandle: hit.creator_handle,
    creatorDisplayName: hit.creator_display_name,
    likedByMe: hit.liked_by_me,
    hotScore: hit.hot_score,
    storagePath: isAbsolute ? '' : path,
    signedUrl: isAbsolute ? path : null,
    previewUrl,
  };
}

function localBuiltinCandidates(query: string): ScoredCandidate[] {
  const kinds = Object.keys(FURNITURE) as Array<Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>>;
  return kinds.map((k) => {
    const def = FURNITURE[k];
    const cats = BUILTIN_CATEGORIES[k] ?? ['other'];
    return {
      id: `builtin-${k}`,
      label: def.label,
      searchable: [def.label, k, ...cats, ...(k === 'lamp' ? ['desk lamp', 'floor lamp', 'light'] : [])],
      aliases: k === 'lamp' ? ['desk lamp', 'floor lamp', 'lighting'] : undefined,
      section: 'add' as const,
      source: 'toova' as const,
      kind: k,
    };
  });
}

export function useDesignerSearch(input: UseDesignerSearchInput) {
  const {
    open,
    query,
    commands,
    checklistProducts,
    checklistProductIds,
    checklistKinds,
    onPlaceModel,
    onPlaceProduct,
    onStartDraw,
    onAddLight,
    onSelectItem,
    onEditItem,
    onOpenAddPanel,
    includeMine = true,
  } = input;

  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const roomGeometry = useStore((s) => s.roomGeometry);
  const selectedId = useStore((s) => s.selectedId);

  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<
    Array<{ model: GalleryModel; source: 'toova' | 'community' | 'mine'; relevance: number }>
  >([]);
  const [hasMore, setHasMore] = useState(false);
  const requestIdRef = useRef(0);
  const retryRef = useRef<() => void>(() => undefined);

  const { scope, query: scopedQuery } = useMemo(() => parseScopedQuery(query), [query]);
  const trimmed = scopedQuery.trim();
  const intent = useMemo(() => parseSearchIntent(trimmed), [trimmed]);

  const roomBounds = useMemo(() => planBounds(roomGeometry), [roomGeometry]);

  const placedKinds = useMemo(() => {
    const set = new Set<string>();
    for (const id of order) {
      const it = items[id];
      if (it) set.add(it.kind);
    }
    return set;
  }, [items, order]);

  // Remote fetch (debounced + race-safe)
  useEffect(() => {
    if (!open) {
      setRemoteModels([]);
      setStatus('idle');
      setError(null);
      return;
    }

    const q = trimmed;
    if (q.length < 2) {
      requestIdRef.current += 1;
      setRemoteModels([]);
      setStatus('idle');
      setError(null);
      setHasMore(false);
      return;
    }

    // Clear stale catalog immediately so old results don't flash under a new query.
    setRemoteModels([]);
    setStatus('loading');
    setError(null);

    const reqId = ++requestIdRef.current;
    const terms = expandQueryTerms(q);
    let cancelled = false;

    const run = async () => {
      try {
        const hits = await searchDesignerCatalog({
          query: q,
          terms,
          limit: REMOTE_LIMIT,
          includeMine,
        });
        if (cancelled || reqId !== requestIdRef.current) return;

        const resolved = await Promise.all(
          hits.map(async (hit) => {
            let previewUrl: string | null = null;
            const thumb = hit.thumbnail_path?.trim();
            if (thumb) {
              const access = hit.visibility === 'public' || hit.is_builtin ? 'public' : 'private';
              previewUrl = await resolveBrowsableModelUrl(thumb, { access });
            }
            return {
              model: hitToModel(hit, previewUrl),
              source: hit.source,
              relevance: hit.relevance,
            };
          }),
        );
        if (cancelled || reqId !== requestIdRef.current) return;
        setRemoteModels(resolved);
        setHasMore(hits.length >= REMOTE_LIMIT);
        setStatus('success');
        pushRecentQuery(q);
      } catch (e) {
        if (cancelled || reqId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : 'Search failed');
        setStatus('error');
        setRemoteModels([]);
      }
    };

    retryRef.current = () => {
      void run();
    };

    const t = window.setTimeout(() => {
      void run();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, trimmed, includeMine]);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    retryRef.current();
  }, []);

  const results: SearchResult[] = useMemo(() => {
    const recentKinds = loadRecent();
    const recentCmds = loadRecentCommands();
    const candidates: ScoredCandidate[] = [];
    const resultMap = new Map<string, SearchResult>();

    // --- Synthetic tools ---
    const synth: Array<{
      id: string;
      label: string;
      tool: 'string-lights' | 'hanging-leaves' | 'free-light';
      searchable: string[];
      thumbColor: string;
      run: () => void;
    }> = [
      {
        id: 'synth-string-lights',
        label: 'String lights',
        tool: 'string-lights',
        searchable: ['string lights', 'fairy lights', 'leds', 'garland', 'strand', 'lamp', 'light'],
        thumbColor: '#8A8478',
        run: () => onStartDraw('lights'),
      },
      {
        id: 'synth-hanging-leaves',
        label: 'Hanging leaves',
        tool: 'hanging-leaves',
        searchable: ['leaves', 'garland', 'vines', 'hanging'],
        thumbColor: '#6b7f6a',
        run: () => onStartDraw('leaves'),
      },
      {
        id: 'synth-free-light',
        label: 'Free light',
        tool: 'free-light',
        searchable: ['free light', 'point light', 'bulb', 'fixture'],
        thumbColor: '#E8C27A',
        run: () => onAddLight(),
      },
    ];
    for (const s of synth) {
      candidates.push({
        id: s.id,
        label: s.label,
        searchable: s.searchable,
        section: 'add',
        source: 'synthetic',
        kind: s.tool,
      });
      resultMap.set(s.id, {
        type: 'syntheticTool',
        id: s.id,
        label: s.label,
        section: 'add',
        source: 'synthetic',
        score: 0,
        tool: s.tool,
        thumbColor: s.thumbColor,
        run: s.run,
      });
    }

    // --- Local builtins (instant) ---
    for (const c of localBuiltinCandidates(trimmed)) {
      const def = FURNITURE[c.kind as Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>];
      const fit = def
        ? softRoomFit(def.size[0], def.size[2], roomBounds.width, roomBounds.depth)
        : 0.5;
      candidates.push({
        ...c,
        fit,
        onChecklist: checklistKinds.has(c.kind!),
        alreadyInRoom: placedKinds.has(c.kind!),
      });
      const model: GalleryModel = {
        kind: c.kind!,
        label: c.label,
        description: null,
        tags: [],
        categories: BUILTIN_CATEGORIES[c.kind as keyof typeof BUILTIN_CATEGORIES] ?? ['other'],
        width_in: def?.size[0] ?? 24,
        height_in: def?.size[1] ?? 24,
        depth_in: def?.size[2] ?? 24,
        clearance_in: def?.clearance ?? null,
        userId: null,
        visibility: 'public',
        isBuiltin: true,
        likesCount: 0,
        downloadsCount: 0,
        viewsCount: 0,
        createdAt: '',
        creatorHandle: null,
        creatorDisplayName: null,
        likedByMe: false,
        hotScore: 0,
        storagePath: '',
        signedUrl: null,
        previewUrl: null,
      };
      resultMap.set(c.id, {
        type: 'catalogModel',
        id: c.id,
        label: c.label,
        section: 'add',
        source: 'toova',
        score: 0,
        model,
        onChecklist: checklistKinds.has(c.kind!),
        alreadyInRoom: placedKinds.has(c.kind!),
        meta: checklistKinds.has(c.kind!)
          ? 'on your checklist'
          : placedKinds.has(c.kind!)
            ? 'already in room'
            : undefined,
        thumbColor: c.kind === 'lamp' ? '#D4C4A0' : undefined,
        run: () => onPlaceModel(model, false),
        runAndEdit: () => onPlaceModel(model, true),
      });
    }

    // --- Checklist products ---
    for (const product of checklistProducts) {
      if (!product.published) continue;
      const placeable = !!(product.placeBuiltinKind || product.placeCatalogKind);
      if (!placeable) continue;
      const id = `checklist-${product.id}`;
      const placed = [...order].some((itemId) => {
        const it = items[itemId];
        if (!it) return false;
        if (it.curatedProductId === product.id) return true;
        if (product.placeBuiltinKind && it.kind === product.placeBuiltinKind) return true;
        if (product.placeCatalogKind && it.kind === product.placeCatalogKind) return true;
        return false;
      });
      const onList = checklistProductIds.has(product.id);
      candidates.push({
        id,
        label: product.name,
        searchable: [
          product.name,
          product.brand ?? '',
          product.slug,
          product.placeBuiltinKind ?? '',
          product.placeCatalogKind ?? '',
        ],
        section: 'add',
        source: 'checklist',
        kind: product.placeCatalogKind ?? product.placeBuiltinKind ?? product.slug,
        onChecklist: onList,
        alreadyInRoom: placed,
      });
      resultMap.set(id, {
        type: 'checklistProduct',
        id,
        label: product.name,
        section: 'add',
        source: 'checklist',
        score: 0,
        product,
        previewUrl: product.imageUrl,
        placed,
        meta: placed ? 'already in room' : 'on your checklist',
        run: () => onPlaceProduct(product, false),
        runAndEdit: () => onPlaceProduct(product, true),
      });
    }

    // --- Remote catalog hits (override builtins of same kind when richer) ---
    for (const hit of remoteModels) {
      const id = `remote-${hit.source}-${hit.model.kind}`;
      const onChecklist = checklistKinds.has(hit.model.kind);
      candidates.push({
        id,
        label: hit.model.label,
        searchable: [
          hit.model.label,
          hit.model.kind,
          hit.model.description ?? '',
          ...hit.model.tags,
          ...hit.model.categories,
        ],
        section: 'add',
        source: hit.source,
        kind: hit.model.kind,
        onChecklist,
        alreadyInRoom: placedKinds.has(hit.model.kind),
        popularity: hit.relevance,
        fit: softRoomFit(
          hit.model.width_in,
          hit.model.depth_in,
          roomBounds.width,
          roomBounds.depth,
        ),
      });
      resultMap.set(id, {
        type: 'catalogModel',
        id,
        label: hit.model.label,
        section: 'add',
        source: hit.source,
        score: hit.relevance,
        model: hit.model,
        previewUrl: hit.model.previewUrl,
        onChecklist,
        alreadyInRoom: placedKinds.has(hit.model.kind),
        meta: onChecklist
          ? 'on your checklist'
          : hit.source === 'community'
            ? 'community'
            : hit.source === 'mine'
              ? 'yours'
              : placedKinds.has(hit.model.kind)
                ? 'already in room'
                : undefined,
        run: () => onPlaceModel(hit.model, false),
        runAndEdit: () => onPlaceModel(hit.model, true),
      });
    }

    // --- Room items (collapse identical kind + label) ---
    {
      const roomGroups = new Map<
        string,
        { itemId: string; label: string; kind: string; count: number; selected: boolean }
      >();
      for (const itemId of order) {
        const it = items[itemId];
        if (!it) continue;
        const label = it.label || it.kind;
        const key = `${it.kind}::${normalizeSearchText(label)}`;
        const isSelected = itemId === selectedId;
        const existing = roomGroups.get(key);
        if (!existing) {
          roomGroups.set(key, {
            itemId,
            label,
            kind: it.kind,
            count: 1,
            selected: isSelected,
          });
        } else {
          existing.count += 1;
          if (isSelected) {
            existing.itemId = itemId;
            existing.selected = true;
          }
        }
      }
      for (const g of roomGroups.values()) {
        const id = `room-${g.itemId}`;
        candidates.push({
          id,
          label: g.label,
          searchable: [g.label, g.kind],
          section: 'room',
          source: 'room',
          kind: g.kind,
        });
        resultMap.set(id, {
          type: 'roomItem',
          id,
          label: g.label,
          section: 'room',
          source: 'room',
          score: 0,
          itemId: g.itemId,
          kind: g.kind,
          meta: g.selected ? 'selected' : g.count > 1 ? `${g.count} in room` : 'in room',
          run: () => onSelectItem(g.itemId),
          runAndEdit: () => onEditItem(g.itemId),
        });
      }
    }

    // --- Actions ---
    for (const cmd of commands) {
      const id = `action-${cmd.id}`;
      const recentIdx = recentCmds.indexOf(cmd.id);
      candidates.push({
        id,
        label: cmd.label,
        searchable: [cmd.label, cmd.id, cmd.hint ?? ''],
        section: 'actions',
        source: 'action',
        recentIndex: recentIdx >= 0 ? recentIdx : undefined,
      });
      resultMap.set(id, {
        type: 'action',
        id,
        label: cmd.label,
        section: 'actions',
        source: 'action',
        score: 0,
        hint: cmd.hint,
        meta: cmd.hint,
        icon: actionIconFor(cmd.id),
        run: cmd.run,
      });
    }

    // Intent boosts: promote matching actions
    if (intent.kind === 'toggle_lights') {
      const c = candidates.find((x) => x.id === 'action-toggle-lamps');
      if (c) c.searchable = [...c.searchable, 'lamp', 'light', 'turn', 'on', 'off'];
    }

    let filtered = filterByScope(candidates, scope as SearchScope);

    // Empty query: recents + core actions + synthetic tools — not the full catalog.
    if (!normalizeSearchText(trimmed)) {
      const recentSet = new Set(recentKinds);
      filtered = filtered.filter((c) => {
        if (c.section === 'actions') {
          const core = new Set([
            'action-add',
            'action-toggle-lamps',
            'action-wall-paint',
            'action-look',
            'action-light',
            'action-present',
            'action-save',
            'action-checklist',
            'action-keys',
          ]);
          if (core.has(c.id)) return true;
          if (c.recentIndex != null) return true;
          return false;
        }
        if (c.source === 'synthetic') return true;
        if (c.section === 'add' && c.kind && recentSet.has(c.kind)) return true;
        if (c.section === 'room') return false;
        return false;
      });
    }

    const ranked = rankCandidates(filtered, {
      query: trimmed,
      checklistKinds,
      recentKinds,
      // Queried: Hollis-tight. Empty: slightly more room for recents + core actions.
      limits: trimmed ? { add: 3, room: 2, actions: 2 } : { add: 4, room: 0, actions: 6 },
    });

    return ranked
      .map((c) => {
        const r = resultMap.get(c.id);
        if (!r) return null;
        const score = c.popularity ?? 0;
        return {
          ...r,
          score,
          highlightRanges: trimmed ? highlightRanges(r.label, trimmed) : undefined,
        } as SearchResult;
      })
      .filter((r): r is SearchResult => r != null);
  }, [
    trimmed,
    scope,
    intent,
    commands,
    checklistProducts,
    checklistProductIds,
    checklistKinds,
    remoteModels,
    items,
    order,
    placedKinds,
    roomBounds,
    selectedId,
    onPlaceModel,
    onPlaceProduct,
    onStartDraw,
    onAddLight,
    onSelectItem,
    onEditItem,
  ]);

  const counts = useMemo(() => {
    const c = { add: 0, room: 0, actions: 0, total: results.length };
    for (const r of results) c[r.section] += 1;
    return c;
  }, [results]);

  const announcement = useMemo(() => {
    if (status === 'loading') return 'Searching…';
    if (status === 'error') return error ?? 'Search failed';
    if (!open) return '';
    if (trimmed.length === 1) return 'Keep typing to search pieces';
    if (results.length === 0 && trimmed.length >= 2) return 'No matching results';
    return `${results.length} result${results.length === 1 ? '' : 's'}`;
  }, [status, error, open, trimmed, results.length]);

  return {
    results,
    status,
    error,
    retry,
    hasMore,
    counts,
    scope,
    intent,
    announcement,
    showAllInAdd: hasMore && !!onOpenAddPanel ? onOpenAddPanel : undefined,
  };
}

export function isQueryTooShort(query: string): boolean {
  return normalizeSearchText(parseScopedQuery(query).query).length === 1;
}
