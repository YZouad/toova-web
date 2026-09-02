import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useGalleryCatalog } from '../../../hooks/useGalleryCatalog';
import {
  getBuiltinPreviewUrl,
  requestBuiltinPreview,
  useBuiltinPreviews,
  withBuiltinPreview,
} from '../../../hooks/useBuiltinPreviews';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../../../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../../../lib/galleryCatalog';
import type { CatalogModel } from '../chromeTypes';
import type { HangingDecorKind } from '../../../store';
import { IconHangingLeaves, IconHangingLights, IconLedStrip } from '../icons';
import { placeFromCatalog } from '../placeCatalogModel';
import { MobileSheet } from './MobileSheet';

const SORT_OPTIONS: { id: GallerySort; label: string; short: string }[] = [
  { id: 'hot', label: 'Popular now', short: 'Hot' },
  { id: 'downloads', label: 'Most placed', short: 'Placed' },
  { id: 'likes', label: 'Most liked', short: 'Liked' },
  { id: 'views', label: 'Most viewed', short: 'Views' },
  { id: 'newest', label: 'Newest', short: 'New' },
];

const SOURCE_TABS: { id: GallerySource; label: string }[] = [
  { id: 'toova', label: 'Toova' },
  { id: 'community', label: 'Community' },
  { id: 'mine', label: 'Yours' },
];

export interface MobileLibrarySheetProps {
  onClose: () => void;
  onImport: () => void;
  onOpenModel: (model: CatalogModel) => void;
  onStartDraw: (kind: HangingDecorKind) => void;
  onAddLight: () => void;
}

export function MobileLibrarySheet({
  onClose,
  onImport,
  onOpenModel,
  onStartDraw,
  onAddLight,
}: MobileLibrarySheetProps) {
  const { user } = useAuth();
  const builtinPreviews = useBuiltinPreviews();
  const [source, setSource] = useState<GallerySource>('toova');
  const [sort, setSort] = useState<GallerySort>('hot');
  const [sortOpen, setSortOpen] = useState(false);
  const [categories, setCategories] = useState<CatalogCategorySlug[]>([]);
  const [query, setQuery] = useState('');
  const sortWrapRef = useRef<HTMLDivElement>(null);

  const {
    models,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
  } = useGalleryCatalog({
    enabled: true,
    source,
    sort,
    categories,
    query,
  });

  const place = useCallback(
    (model: CatalogModel) => {
      placeFromCatalog(model, user?.id);
    },
    [user?.id],
  );

  const toggleCat = useCallback((slug: CatalogCategorySlug) => {
    setCategories((cur) => toggleCatalogCategory(cur, slug));
  }, []);

  const countLabel = loading && models.length === 0 ? '…' : `${total} models`;
  const sortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.short ?? 'Hot';

  useEffect(() => {
    if (!sortOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!sortWrapRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setSortOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [sortOpen]);

  const footer = (
    <div className="dgm-library-footer">
      <div className="dgm-action-row">
        <button
          type="button"
          className="dgm-action-btn is-dashed"
          onClick={() => onStartDraw('lights')}
        >
          <span className="dgm-action-btn__dot" style={{ background: '#E8C27A', display: 'grid', placeItems: 'center', color: 'rgba(36,31,25,0.72)' }}>
            <IconHangingLights size={10} />
          </span>
          Fairy lights
        </button>
        <button
          type="button"
          className="dgm-action-btn is-dashed"
          onClick={() => onStartDraw('leaves')}
        >
          <span className="dgm-action-btn__dot" style={{ background: '#7E8A60', display: 'grid', placeItems: 'center', color: 'rgba(36,31,25,0.72)' }}>
            <IconHangingLeaves size={10} />
          </span>
          Leaves
        </button>
      </div>
      <div className="dgm-action-row">
        <button
          type="button"
          className="dgm-action-btn is-dashed is-full"
          onClick={() => onStartDraw('led-strip')}
        >
          <span className="dgm-action-btn__dot" style={{ background: '#6EB5FF', display: 'grid', placeItems: 'center', color: 'rgba(36,31,25,0.72)' }}>
            <IconLedStrip size={10} />
          </span>
          LED strip
        </button>
      </div>
      <button type="button" className="dgm-action-btn is-outline is-full" onClick={onImport}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        Bring in your own piece
      </button>
    </div>
  );

  return (
    <MobileSheet
      kind="add"
      title="Add to the room"
      onClose={onClose}
      bodyClassName="dgm-sheet-body--library"
      headerEnd={
        <>
          <span className="dgm-sheet-count">{countLabel}</span>
          <div className="dgm-lib-sort" ref={sortWrapRef}>
            <button
              type="button"
              className="dgm-lib-sort__btn"
              aria-label={`Sort by ${SORT_OPTIONS.find((o) => o.id === sort)?.label ?? sort}`}
              aria-expanded={sortOpen}
              aria-haspopup="listbox"
              onClick={() => setSortOpen((v) => !v)}
            >
              <span className="dgm-lib-sort__eyebrow">Sort</span>
              <span className="dgm-lib-sort__value">{sortLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {sortOpen ? (
              <div className="dgm-lib-sort__menu" role="listbox" aria-label="Sort models">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="dgm-more-menu__item"
                    role="option"
                    aria-selected={sort === opt.id}
                    onClick={() => {
                      setSort(opt.id);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                    {sort === opt.id ? <span className="dgm-lib-sort__check" aria-hidden>✓</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      }
    >
      <div className="dgm-library-sticky">
        <label className="dgm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" />
          </svg>
          <input
            type="search"
            placeholder="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="dgm-segment-row dgm-segment-row--3" role="tablist" aria-label="Model source">
          {SOURCE_TABS.map((tab) => {
            if (tab.id === 'mine' && !user) return null;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={source === tab.id}
                className={`dgm-segment-btn${source === tab.id ? ' is-active' : ''}`}
                onClick={() => {
                  setSource(tab.id);
                  if (tab.id === 'mine' && sort === 'hot') setSort('newest');
                  else if (tab.id !== 'mine' && sort === 'newest') setSort('hot');
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="dgm-chip-scroll" role="group" aria-label="Categories">
          {CATALOG_CATEGORY_DEFS.map((c) => {
            const on = categories.includes(c.slug);
            const locked = !on && categories.length >= MAX_CATALOG_CATEGORIES;
            return (
              <button
                key={c.slug}
                type="button"
                disabled={locked}
                aria-pressed={on}
                className={`dgm-chip${on ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => toggleCat(c.slug)}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dgm-library-list">
        {error ? <p className="dgm-error">{error}</p> : null}
        {loading && models.length === 0 ? (
          <p className="dgm-empty__hint">Loading models…</p>
        ) : null}
        {!loading && models.length === 0 ? (
          <div className="dgm-empty">
            <p className="dgm-empty__title">Nothing here yet</p>
            <p className="dgm-empty__hint">Try another source or clear a category filter.</p>
            {categories.length > 0 ? (
              <button type="button" className="dgm-action-btn" onClick={() => setCategories([])}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          models.map((m) => {
            const dims = `${Math.round(m.width_in)}×${Math.round(m.depth_in)}×${Math.round(m.height_in)}″`;
            const creator =
              m.creatorDisplayName || m.creatorHandle
                ? m.creatorDisplayName ?? `@${m.creatorHandle}`
                : m.isBuiltin
                  ? 'Toova'
                  : 'Community';
            const thumb =
              m.previewUrl ??
              (m.isBuiltin ? getBuiltinPreviewUrl(m.kind, builtinPreviews) : undefined);
            const letter = (m.label?.trim()?.[0] ?? '?').toUpperCase();
            return (
              <div key={m.kind} className="dgm-catalog-row">
                <button
                  type="button"
                  className="dgm-catalog-row__main"
                  onClick={() => {
                    if (m.isBuiltin) requestBuiltinPreview(m.kind);
                    onOpenModel(withBuiltinPreview(m, builtinPreviews));
                  }}
                >
                  <span className="dgm-catalog-row__thumb">
                    {thumb ? (
                      <img src={thumb} alt="" draggable={false} />
                    ) : (
                      <span aria-hidden>{letter}</span>
                    )}
                  </span>
                  <span className="dgm-catalog-row__copy">
                    <span className="dgm-catalog-row__name">{m.label}</span>
                    <span className="dgm-catalog-row__meta">
                      {creator} · {dims}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="dgm-catalog-row__add"
                  aria-label={`Add ${m.label}`}
                  onClick={() => place(m)}
                >
                  +
                </button>
              </div>
            );
          })
        )}
        {hasMore ? (
          <button
            type="button"
            className="dgm-action-btn is-full"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>

      {footer}
    </MobileSheet>
  );
}
