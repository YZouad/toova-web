import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { withBuiltinPreview, useBuiltinPreviews } from '../../../hooks/useBuiltinPreviews';
import type { CuratedProduct } from '../../../lib/dormChecklist';
import { toggleCatalogLike } from '../../../lib/catalogEngagement';
import { loadRecent } from '../../../lib/recentCatalogKinds';
import { trackCatalogPlaceUndone, trackLibraryOpened } from '../../../lib/analytics';
import type { CatalogCategorySlug } from '../../../lib/catalogCategories';
import { isProceduralBuiltinKind } from '../../../lib/placeGalleryModel';
import { PanelShell } from '../PanelShell';
import type { CatalogModel } from '../chromeTypes';
import { formatPlacedCount, isNewCatalogModel } from './libraryBadges';
import {
  LibraryEmpty,
  LibraryFooter,
  LibrarySearch,
  LibrarySourceBar,
} from './LibraryChrome';
import { LibraryDrawTools } from './LibraryTools';
import { LazyThumb } from './LazyThumb';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { useCatalogDrag } from './useCatalogDrag';
import { useLibraryModel } from './useLibraryModel';
import { useRovingGrid } from './useRovingGrid';
import { useShoppableProducts } from './useShoppableProducts';
import type { LibraryPanelSharedProps, PlaceContext } from './libraryTypes';
import { SHOWROOM_COACH_KEY } from './libraryTypes';
import {
  budgetFit,
  cardBadges,
  dedupeCommunityModels,
  formatModelDims,
  inRoomCounts,
  pairsFor,
  popularRank,
  prepareShowroomRails,
} from './showroomSignals';
import { RoomProgressStrip } from './RoomProgressStrip';
import { ShowroomRail } from './ShowroomRail';
import { CardPriceLink } from './PricePopover';
import { PlacedToast, type PlacedToastState } from './PlacedToast';
import { ShopRoomBar } from './ShopRoomBar';

const ModelTurntable = lazy(() => import('./ModelTurntable'));

function AddPosterCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dgl-add-poster" onClick={onClick}>
      <span className="dgl-add-poster__title">Add a poster</span>
      <span className="dgl-add-poster__hint">Choose from the bank or upload your own</span>
    </button>
  );
}

function useGridColumns(el: HTMLElement | null, fallback = 3) {
  const [columns, setColumns] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const read = () => {
      const cols = getComputedStyle(el).gridTemplateColumns;
      const n = cols && cols !== 'none' ? cols.split(' ').filter(Boolean).length : fallback;
      setColumns(Math.max(1, n));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fallback]);
  return columns;
}

function ShowroomCard({
  model,
  itemProps,
  product,
  hoverKind,
  setHoverKind,
  onOpen,
  onPlace,
  onDragPlace,
  rank,
  inRoom,
  remainingCents,
  addToList,
  onDismissCoach,
  justPlaced,
  onLikeChange,
  signedIn,
}: {
  model: CatalogModel;
  itemProps: ReturnType<ReturnType<typeof useRovingGrid>['getItemProps']>;
  product: CuratedProduct | null;
  hoverKind: string | null;
  setHoverKind: (k: string | null) => void;
  onOpen: (m: CatalogModel) => void;
  onPlace: (m: CatalogModel) => void;
  onDragPlace: (m: CatalogModel, spawnAt: [number, number]) => void;
  rank: 1 | 2 | 3 | null;
  inRoom: number;
  remainingCents: number | null;
  addToList: (productId: string) => void;
  onDismissCoach?: () => void;
  justPlaced?: boolean;
  onLikeChange?: (kind: string, liked: boolean, likesCount: number) => void;
  signedIn: boolean;
}) {
  const timer = useRef<number | null>(null);
  const showTurntable = hoverKind === model.kind;
  const canTurntable = isProceduralBuiltinKind(model.kind) || !!model.signedUrl;
  const budget = budgetFit(product?.priceCents, remainingCents, product?.currency);
  const canLike = model.visibility === 'public' && !model.isBuiltin;
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeHint, setLikeHint] = useState(false);
  const [ttFailed, setTtFailed] = useState(false);
  const [ttReady, setTtReady] = useState(false);
  const { dragging, ...dragHandlers } = useCatalogDrag({
    model,
    onPlaceAt: (m, spawnAt) => onDragPlace(m, spawnAt),
  });

  const badges = cardBadges({
    rank,
    isNew: isNewCatalogModel(model.createdAt),
    placedCount: model.downloadsCount,
    inRoom,
  });

  const armHover = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (canTurntable && model.signedUrl && !isProceduralBuiltinKind(model.kind)) {
        void import('./ModelTurntable').then((m) => m.preloadCatalogModel(model));
      }
      setHoverKind(model.kind);
    }, 250);
  };
  const clearHover = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHoverKind(null);
    setTtFailed(false);
    setTtReady(false);
  };

  const onLike = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!canLike || likeBusy) return;
    if (!signedIn) {
      setLikeHint(true);
      return;
    }
    setLikeBusy(true);
    const prevLiked = model.likedByMe;
    const prevCount = model.likesCount;
    onLikeChange?.(model.kind, !prevLiked, Math.max(0, prevCount + (prevLiked ? -1 : 1)));
    try {
      const res = await toggleCatalogLike(model.kind);
      onLikeChange?.(model.kind, res.liked, res.likes_count);
    } catch {
      onLikeChange?.(model.kind, prevLiked, prevCount);
    } finally {
      setLikeBusy(false);
    }
  };

  return (
    <div
      className={`dgl-card${justPlaced ? ' is-pop' : ''}${dragging ? ' is-dragging' : ''}`}
      role="gridcell"
      tabIndex={itemProps.tabIndex}
      data-roving-index={itemProps['data-roving-index']}
      onFocus={() => {
        itemProps.onFocus();
        armHover();
      }}
      onMouseEnter={armHover}
      onMouseLeave={clearHover}
      onBlur={clearHover}
      onDoubleClick={() => onPlace(model)}
    >
      <div
        className={`dgl-card__media${ttReady ? ' is-tt-ready' : ''}`}
        title="Drag into room"
        {...dragHandlers}
      >
        <LazyThumb
          kind={model.kind}
          label={model.label}
          previewUrl={model.previewUrl}
          isBuiltin={model.isBuiltin}
          fill
        />
        {showTurntable && canTurntable && !ttFailed ? (
          <Suspense fallback={null}>
            <ModelTurntable
              model={model}
              onReady={() => setTtReady(true)}
              onError={() => {
                setTtFailed(true);
                setTtReady(false);
              }}
            />
          </Suspense>
        ) : null}
        <div className="dgl-card__badges" title={badges.title || undefined}>
          {badges.visible.map((b) => (
            <span key={b.key} className={`dgl-badge${b.className ? ` ${b.className}` : ''}`}>
              {b.label}
            </span>
          ))}
        </div>
        {canLike && (model.likedByMe || model.likesCount > 0) ? (
          <button
            type="button"
            className={`dgl-like dgl-like--overlay is-visible${model.likedByMe ? ' is-on' : ''}`}
            aria-pressed={model.likedByMe}
            aria-label={model.likedByMe ? 'Unlike' : 'Like'}
            disabled={likeBusy}
            title={likeHint && !signedIn ? 'Sign in to like' : undefined}
            onClick={(e) => void onLike(e)}
          >
            ♥{model.likesCount > 0 ? ` ${formatPlacedCount(model.likesCount)}` : ''}
          </button>
        ) : canLike ? (
          <button
            type="button"
            className={`dgl-like dgl-like--overlay dgl-like--hover${model.likedByMe ? ' is-on' : ''}`}
            aria-pressed={model.likedByMe}
            aria-label={model.likedByMe ? 'Unlike' : 'Like'}
            disabled={likeBusy}
            title={likeHint && !signedIn ? 'Sign in to like' : undefined}
            onClick={(e) => void onLike(e)}
          >
            ♥
          </button>
        ) : null}
        <button
          type="button"
          className="dgl-btn dgl-btn--place dgl-card__place-pill"
          aria-label={`Place ${model.label}`}
          onClick={() => {
            onDismissCoach?.();
            onPlace(model);
          }}
        >
          Place
        </button>
      </div>
      <div className="dgl-card__body">
        <button
          type="button"
          className="dgl-card__title"
          title={model.label}
          onClick={() => onOpen(model)}
        >
          {model.label}
        </button>
        <span className="dgl-card__meta">
          {formatModelDims(model)}
          {product?.rating != null ? (
            <>
              {' · '}
              {product.rating.toFixed(1)}
              {product.reviewCount != null
                ? ` (${product.reviewCount.toLocaleString('en-US')})`
                : ''}
            </>
          ) : null}
        </span>
        {product ? (
          <div className="dgl-card__price-row">
            <CardPriceLink
              product={product}
              budget={budget}
              addToList={addToList}
              modelLabel={model.label}
            />
          </div>
        ) : null}
        {likeHint && !signedIn ? <span className="dgl-muted">Sign in to like</span> : null}
      </div>
    </div>
  );
}

function CompactRailCard({
  model,
  product,
  remainingCents,
  addToList,
  onPlace,
}: {
  model: CatalogModel;
  product: CuratedProduct | null;
  remainingCents: number | null;
  addToList: (productId: string) => void;
  onPlace: () => void;
}) {
  const budget = budgetFit(product?.priceCents, remainingCents, product?.currency);
  return (
    <div className="dgl-rail-card" role="listitem">
      <LazyThumb
        kind={model.kind}
        label={model.label}
        previewUrl={model.previewUrl}
        isBuiltin={model.isBuiltin}
        fill
      />
      <span className="dgl-rail-card__title" title={model.label}>
        {model.label}
      </span>
      <span className="dgl-card__meta">{formatModelDims(model)}</span>
      {product ? (
        <CardPriceLink
          product={product}
          budget={budget}
          addToList={addToList}
          modelLabel={model.label}
          compact
        />
      ) : null}
      <button
        type="button"
        className="dgl-btn dgl-btn--place dgl-rail-card__place"
        aria-label={`Place ${model.label}`}
        onClick={onPlace}
      >
        Place
      </button>
    </div>
  );
}

export function ShowroomLibrary(props: LibraryPanelSharedProps) {
  const lib = useLibraryModel({ isAdmin: props.isAdmin });
  const shop = useShoppableProducts();
  const builtinPreviews = useBuiltinPreviews();
  const [hoverKind, setHoverKind] = useState<string | null>(null);
  const [toast, setToast] = useState<PlacedToastState | null>(null);
  const [justPlacedKind, setJustPlacedKind] = useState<string | null>(null);
  const [likeOverrides, setLikeOverrides] = useState<
    Record<string, { likedByMe: boolean; likesCount: number }>
  >({});
  const [showCoach, setShowCoach] = useState(() => {
    try {
      return localStorage.getItem(SHOWROOM_COACH_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [budgetPrompt, setBudgetPrompt] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [catsExpanded, setCatsExpanded] = useState(false);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const gridColumns = useGridColumns(gridEl, 3);

  useEffect(() => {
    trackLibraryOpened({ variant: 'showroom' });
  }, []);

  const roomCounts = useMemo(() => inRoomCounts(lib.items), [lib.items]);
  const recentKinds = useMemo(() => loadRecent(), [lib.models.length, toast?.itemId]);

  const modelsWithLikes = useMemo(() => {
    const mapped = lib.models.map((m) => {
      const o = likeOverrides[m.kind];
      return o ? { ...m, likedByMe: o.likedByMe, likesCount: o.likesCount } : m;
    });
    return lib.source === 'community' ? dedupeCommunityModels(mapped) : mapped;
  }, [lib.models, likeOverrides, lib.source]);

  const leadCount = gridColumns * 3;

  const rails = useMemo(
    () =>
      prepareShowroomRails({
        models: modelsWithLikes,
        areaCategories: lib.activeSuggestion?.catalogCategories,
        recentKinds,
        source: lib.source,
        excludeKinds: modelsWithLikes
          .slice(0, leadCount + gridColumns * 2)
          .map((m) => m.kind),
      }),
    [modelsWithLikes, lib.activeSuggestion, recentKinds, lib.source, leadCount, gridColumns],
  );

  const splitGrid =
    rails.forYou.length > 0 || rails.newWeek.length > 0 || rails.recent.length > 0;

  const visibleCats = catsExpanded
    ? lib.categoryDefs
    : lib.categoryDefs.slice(0, 10);
  const hasMoreCats = lib.categoryDefs.length > 10;

  const afterPlace = useCallback(
    (m: CatalogModel, id: string | null) => {
      if (!id) return;
      setJustPlacedKind(m.kind);
      window.setTimeout(() => setJustPlacedKind((k) => (k === m.kind ? null : k)), 600);
      setToast({
        itemId: id,
        model: m,
        pairs: pairsFor(m, lib.models),
      });
      setShowCoach(false);
      try {
        localStorage.setItem(SHOWROOM_COACH_KEY, '1');
      } catch {
        /* ignore */
      }
    },
    [lib.models],
  );

  const place = useCallback(
    async (m: CatalogModel, context: PlaceContext = 'grid') => {
      const id = await lib.place(m, {
        method: 'click',
        shoppable: shop.byKind.has(m.kind),
        context,
      });
      afterPlace(m, id);
    },
    [lib, shop.byKind, afterPlace],
  );

  const dragPlace = useCallback(
    async (m: CatalogModel, spawnAt: [number, number]) => {
      const id = await lib.place(m, {
        method: 'drag',
        spawnAt,
        shoppable: shop.byKind.has(m.kind),
        context: 'grid',
      });
      afterPlace(m, id);
    },
    [lib, shop.byKind, afterPlace],
  );

  const open = useCallback(
    (m: CatalogModel) => {
      props.onOpenModel(withBuiltinPreview(m, builtinPreviews));
    },
    [props, builtinPreviews],
  );

  const undo = useCallback(() => {
    if (!toast) return;
    lib.removeItem(toast.itemId);
    trackCatalogPlaceUndone({ kind: toast.model.kind });
    setToast(null);
  }, [toast, lib]);

  const dismissCoach = useCallback(() => {
    setShowCoach(false);
    try {
      localStorage.setItem(SHOWROOM_COACH_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const roving = useRovingGrid({
    count: modelsWithLikes.length,
    columns: gridColumns,
    onPlace: (i) => {
      const m = modelsWithLikes[i];
      if (m) void place(m, 'grid');
    },
    onOpen: (i) => {
      const m = modelsWithLikes[i];
      if (m) open(m);
    },
    onEscape: props.onClose,
  });

  const openBudget = () => {
    setBudgetPrompt(true);
    setBudgetDraft(
      shop.moveInBudgetCents != null
        ? String(Math.round(shop.moveInBudgetCents / 100))
        : '',
    );
  };

  const renderCard = (m: CatalogModel, i: number) => (
    <ShowroomCard
      key={m.kind}
      model={m}
      itemProps={roving.getItemProps(i)}
      product={shop.productForKind(m.kind)}
      hoverKind={hoverKind}
      setHoverKind={setHoverKind}
      onOpen={open}
      onPlace={(model) => void place(model, 'grid')}
      onDragPlace={dragPlace}
      rank={popularRank(i, lib.sort)}
      inRoom={roomCounts.get(m.kind) ?? 0}
      remainingCents={shop.budgetSummary.remainingCents}
      addToList={shop.addToList}
      onDismissCoach={dismissCoach}
      justPlaced={justPlacedKind === m.kind}
      signedIn={!!lib.user}
      onLikeChange={(kind, likedByMe, likesCount) => {
        setLikeOverrides((prev) => ({ ...prev, [kind]: { likedByMe, likesCount } }));
      }}
    />
  );

  const headSlice = splitGrid ? leadCount : modelsWithLikes.length;
  const headModels = modelsWithLikes.slice(0, headSlice);
  const restModels = splitGrid ? modelsWithLikes.slice(headSlice) : [];

  const gridBlock =
    lib.loading && modelsWithLikes.length === 0 ? (
      <p className="dgl-muted" style={{ padding: 24, textAlign: 'center' }}>
        Loading models…
      </p>
    ) : !lib.loading && modelsWithLikes.length === 0 ? (
      <LibraryEmpty categories={lib.categories} setCategories={lib.setCategories} />
    ) : (
      <div
        ref={setGridEl}
        className="dgl-showroom__grid"
        role="grid"
        aria-label="Furniture showroom"
        tabIndex={0}
        onKeyDown={roving.onKeyDown}
      >
        {headModels.map((m, i) => renderCard(m, i))}
      </div>
    );

  const restGrid =
    restModels.length > 0 ? (
      <div
        className="dgl-showroom__grid"
        role="grid"
        aria-label="More furniture"
        tabIndex={0}
        onKeyDown={roving.onKeyDown}
      >
        {restModels.map((m, i) => renderCard(m, i + headSlice))}
        <InfiniteScrollSentinel
          hasMore={lib.hasMore}
          loading={lib.loadingMore}
          onLoadMore={() => void lib.loadMore()}
        />
      </div>
    ) : modelsWithLikes.length > 0 ? (
      <InfiniteScrollSentinel
        hasMore={lib.hasMore}
        loading={lib.loadingMore}
        onLoadMore={() => void lib.loadMore()}
      />
    ) : null;

  const railsBlock = (
    <>
      {rails.forYou.length > 0 && lib.activeSuggestion ? (
        <ShowroomRail title={`Picked for your ${lib.activeSuggestion.label}`}>
          {rails.forYou.map((m) => (
            <CompactRailCard
              key={`fy-${m.kind}`}
              model={m}
              product={shop.productForKind(m.kind)}
              remainingCents={shop.budgetSummary.remainingCents}
              addToList={shop.addToList}
              onPlace={() => void place(m, 'for_you')}
            />
          ))}
        </ShowroomRail>
      ) : null}
      {rails.newWeek.length > 0 ? (
        <ShowroomRail title="New this week">
          {rails.newWeek.map((m) => (
            <CompactRailCard
              key={`new-${m.kind}`}
              model={m}
              product={shop.productForKind(m.kind)}
              remainingCents={shop.budgetSummary.remainingCents}
              addToList={shop.addToList}
              onPlace={() => void place(m, 'new')}
            />
          ))}
        </ShowroomRail>
      ) : null}
      {rails.recent.length > 0 ? (
        <ShowroomRail title="Recently used">
          {rails.recent.map((m) => (
            <CompactRailCard
              key={`rec-${m.kind}`}
              model={m}
              product={shop.productForKind(m.kind)}
              remainingCents={shop.budgetSummary.remainingCents}
              addToList={shop.addToList}
              onPlace={() => void place(m, 'recent')}
            />
          ))}
        </ShowroomRail>
      ) : null}
    </>
  );

  return (
    <PanelShell
      compact={false}
      sheetClass="dg-sheet--library"
      title="Add to the room"
      onClose={props.onClose}
      headerExtra={<LibrarySearch query={lib.query} setQuery={lib.setQuery} />}
      bodyClassName="dgl-sheet-body dgl-sheet-body--showroom"
      footer={
        <div className="dgl-footer-stack">
          {budgetPrompt ? (
            <div className="dgl-budget-prompt" role="dialog" aria-label="Set move-in budget">
              <label className="dgl-budget-prompt__label">
                Move-in budget ($)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  className="dgl-budget-prompt__input"
                />
              </label>
              <div className="dgl-buy__actions">
                <button
                  type="button"
                  className="dgl-btn dgl-btn--accent"
                  onClick={() => {
                    const dollars = Number(budgetDraft);
                    if (Number.isFinite(dollars) && dollars >= 0) {
                      shop.setMoveInBudget(Math.round(dollars * 100));
                    }
                    setBudgetPrompt(false);
                  }}
                >
                  Save
                </button>
                <button type="button" className="dgl-btn" onClick={() => setBudgetPrompt(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <div className="dgl-footer-row">
            <LibraryFooter onImport={props.onImport} secondary />
            <ShopRoomBar
              lines={shop.purchaseCartLines}
              hasBudget={shop.moveInBudgetCents != null}
              onSetBudget={openBudget}
              removeFromList={shop.removeFromList}
            />
          </div>
        </div>
      }
    >
      <div className="dgl-showroom">
        <LibrarySourceBar
          source={lib.source}
          setSource={lib.setSource}
          sort={lib.sort}
          setSort={lib.setSort}
          sortOpen={lib.sortOpen}
          setSortOpen={lib.setSortOpen}
          sortLabel={lib.sortLabel}
          total={lib.total}
          loading={lib.loading}
          user={lib.user}
          drawTools={
            <LibraryDrawTools
              onStartDraw={props.onStartDraw}
              onStartMeasure={props.onStartMeasure}
              onAddLight={props.onAddLight}
              layout="rail"
            />
          }
        />

        <RoomProgressStrip
          suggestion={lib.activeSuggestion}
          essentialLabel={lib.essentialLabel}
          onPlaceEssential={(k) => {
            const id = lib.placeEssential(k);
            if (id) {
              afterPlace(
                {
                  kind: k,
                  label: lib.essentialLabel(k),
                  description: null,
                  tags: [],
                  categories: [],
                  width_in: 0,
                  height_in: 0,
                  depth_in: 0,
                  clearance_in: null,
                  userId: null,
                  visibility: 'public',
                  isBuiltin: true,
                  likesCount: 0,
                  downloadsCount: 0,
                  viewsCount: 0,
                  createdAt: new Date().toISOString(),
                  creatorHandle: null,
                  creatorDisplayName: 'Toova',
                  likedByMe: false,
                  hotScore: 0,
                  storagePath: '',
                  signedUrl: null,
                  previewUrl: null,
                },
                id,
              );
            }
          }}
          onSelectArea={lib.applySuggestionCategories}
          areas={lib.suggestionReport.areas}
        />

        <div className="dgl-showroom__cats-row">
          <div
            className={`dgl-showroom__cats${catsExpanded ? ' is-expanded' : ''}`}
            role="group"
            aria-label="Categories"
          >
            {visibleCats.map((c) => {
              const on = lib.categories.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  className={`dg-chip${on ? ' is-accent' : ''}`}
                  aria-pressed={on}
                  onClick={() => lib.toggleCat(c.slug as CatalogCategorySlug)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {hasMoreCats ? (
            <button
              type="button"
              className="dg-chip dgl-showroom__cats-more"
              onClick={() => setCatsExpanded((v) => !v)}
            >
              {catsExpanded ? 'Less' : 'More'}
            </button>
          ) : null}
        </div>

        {showCoach ? (
          <div className="dgl-coach-banner" role="note">
            <span>Tip: drag a piece into your room, or press Place.</span>
            <button type="button" className="dgl-btn dgl-btn--ghost" onClick={dismissCoach}>
              Got it
            </button>
          </div>
        ) : null}

        {lib.error ? <p style={{ color: 'var(--danger)' }}>{lib.error}</p> : null}

        <div className="dgl-showroom__scroll">
          <AddPosterCard onClick={props.onAddPoster} />
          {gridBlock}
          {railsBlock}
          {restGrid}
          {toast ? (
            <PlacedToast
              state={toast}
              onUndo={undo}
              onDismiss={() => setToast(null)}
              onPlacePair={(m) => void place(m, 'pairs')}
            />
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}
