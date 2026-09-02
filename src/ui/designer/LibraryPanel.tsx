import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGalleryCatalog } from '../../hooks/useGalleryCatalog';
import {
  getBuiltinPreviewUrl,
  requestBuiltinPreview,
  useBuiltinPreviews,
  withBuiltinPreview,
} from '../../hooks/useBuiltinPreviews';
import {
  CATALOG_CATEGORY_DEFS,
  MAX_CATALOG_CATEGORIES,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../../lib/galleryCatalog';
import type { CatalogModel } from './chromeTypes';
import type { HangingDecorKind } from '../../store';
import { IconFreeLight, IconHangingLeaves, IconHangingLights, IconLedStrip } from './icons';
import { PanelShell } from './PanelShell';
import { placeFromCatalog } from './placeCatalogModel';

const SORT_OPTIONS: { id: GallerySort; label: string }[] = [
  { id: 'hot', label: 'Popular now' },
  { id: 'downloads', label: 'Most placed' },
  { id: 'likes', label: 'Most liked' },
  { id: 'views', label: 'Most viewed' },
  { id: 'newest', label: 'Newest' },
];

const SOURCE_TABS: { id: GallerySource; label: string; sub: string }[] = [
  { id: 'toova', label: 'Toova library', sub: 'Curated' },
  { id: 'community', label: 'Community', sub: 'Shared' },
  { id: 'mine', label: 'Your models', sub: 'Uploads' },
];

export interface LibraryPanelProps {
  compact?: boolean;
  onClose: () => void;
  onImport: () => void;
  onOpenModel: (model: CatalogModel) => void;
  onStartDraw: (kind: HangingDecorKind) => void;
  onAddLight: () => void;
}

export function LibraryPanel({
  compact,
  onClose,
  onImport,
  onOpenModel,
  onStartDraw,
  onAddLight,
}: LibraryPanelProps) {
  const { user } = useAuth();
  const builtinPreviews = useBuiltinPreviews();
  const [source, setSource] = useState<GallerySource>('toova');
  const [sort, setSort] = useState<GallerySort>('hot');
  const [categories, setCategories] = useState<CatalogCategorySlug[]>([]);
  const [query, setQuery] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

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

  const sortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.label ?? 'Hot';

  const place = useCallback(
    (model: CatalogModel) => {
      placeFromCatalog(model, user?.id);
    },
    [user?.id],
  );

  const toggleCat = useCallback((slug: CatalogCategorySlug) => {
    setCategories((cur) => toggleCatalogCategory(cur, slug));
  }, []);

  const drawRow = (
    row: {
      label: string;
      meta: string;
      color: string;
      Icon: typeof IconHangingLights;
      run: () => void;
    },
  ) => (
    <button
      key={row.label}
      type="button"
      className="dg-row"
      style={{
        padding: '8px 9px',
        border: '1px solid var(--rule-soft)',
        borderRadius: 8,
        background: 'var(--paper-0)',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      }}
      onClick={row.run}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: row.color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--ink-1)',
        }}
      >
        <row.Icon size={14} stroke="currentColor" />
      </span>
      <span style={{ marginLeft: 8 }}>
        <span style={{ display: 'block', font: 'var(--type-body-sm)', color: 'var(--ink-1)' }}>
          {row.label}
        </span>
        <span style={{ display: 'block', font: 'var(--type-mono-xs)', color: 'var(--ink-5)' }}>
          {row.meta}
        </span>
      </span>
    </button>
  );

  const createRows = useMemo(
    () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              font: 'var(--type-mono-xs)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-6)',
            }}
          >
            Draw it in the room
          </span>
          {drawRow({
            label: 'Draw fairy lights',
            meta: 'draped path',
            color: '#E8C27A',
            Icon: IconHangingLights,
            run: () => onStartDraw('lights'),
          })}
          {drawRow({
            label: 'Draw hanging leaves',
            meta: 'draped path',
            color: '#7E8A60',
            Icon: IconHangingLeaves,
            run: () => onStartDraw('leaves'),
          })}
          {drawRow({
            label: 'Place a free light',
            meta: 'drops in, then lift',
            color: '#F0DCA8',
            Icon: IconFreeLight,
            run: onAddLight,
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              font: 'var(--type-mono-xs)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-6)',
            }}
          >
            LED strips
          </span>
          {drawRow({
            label: 'Draw LED strip',
            meta: 'straight runs between points',
            color: '#6EB5FF',
            Icon: IconLedStrip,
            run: () => onStartDraw('led-strip'),
          })}
        </div>
      </div>
    ),
    [onAddLight, onStartDraw],
  );

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, flex: 1 }}>
      {error ? (
        <p style={{ color: 'var(--danger)', font: '400 13px/1.4 var(--font-sans)' }}>{error}</p>
      ) : null}
      {loading && models.length === 0 ? (
        <p style={{ color: 'var(--ink-6)', font: '400 13px/1.4 var(--font-sans)', padding: 24, textAlign: 'center' }}>
          Loading models…
        </p>
      ) : null}
      {!loading && models.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'center' }}>
          <span style={{ font: '500 17px/1.2 var(--font-serif)', color: 'var(--ink-0)' }}>Nothing here yet</span>
          <span style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--ink-4)', maxWidth: 280 }}>
            No models match these filters. Try another source, or clear a category.
          </span>
          {categories.length > 0 ? (
            <button type="button" className="dg-footer-btn" onClick={() => setCategories([])}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: '4px 10px' }}>
          {models.map((m) => {
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
              <div
                key={m.kind}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  borderRadius: 9,
                  border: '1px solid transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (m.isBuiltin) requestBuiltinPreview(m.kind);
                    onOpenModel(withBuiltinPreview(m, builtinPreviews));
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    flex: 1,
                    minWidth: 0,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: '1px solid rgba(36,31,25,0.12)',
                      flex: 'none',
                      background: 'var(--paper-2)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          font: '600 13px/1 var(--font-sans)',
                          color: 'var(--ink-4)',
                        }}
                      >
                        {letter}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span
                      style={{
                        font: '500 13px/1.2 var(--font-sans)',
                        color: 'var(--ink-0)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {m.label}
                    </span>
                    <span
                      style={{
                        font: 'var(--type-mono-xs)',
                        color: 'var(--ink-6)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {creator} · {dims}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="dg-sheet-header__close"
                  style={{ width: 26, height: 26, borderRadius: '50%' }}
                  aria-label={`Add ${m.label}`}
                  onClick={() => place(m)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      )}
      {hasMore ? (
        <button
          type="button"
          className="dg-footer-btn"
          style={{ alignSelf: 'center', marginTop: 12 }}
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );

  const filters = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 0, flex: 1 }}>
      {createRows}
      <div className="dg-row dg-row--between" style={{ padding: '4px 0 8px', minHeight: 0 }}>
        <span
          style={{
            font: 'var(--type-mono-xs)',
            letterSpacing: 'var(--tracking-eyebrow)',
            textTransform: 'uppercase',
            color: 'var(--ink-6)',
          }}
        >
          Category
        </span>
        {categories.length > 0 ? (
          <button
            type="button"
            style={{
              font: 'var(--type-mono-xs)',
              color: 'var(--accent-text)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            onClick={() => setCategories([])}
          >
            clear
          </button>
        ) : null}
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {CATALOG_CATEGORY_DEFS.map((c) => {
          const on = categories.includes(c.slug);
          const locked = !on && categories.length >= MAX_CATALOG_CATEGORIES;
          return (
            <button
              key={c.slug}
              type="button"
              disabled={locked}
              aria-pressed={on}
              onClick={() => toggleCat(c.slug)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px',
                border: 'none',
                borderRadius: 7,
                background: on ? 'var(--accent-bg)' : 'transparent',
                cursor: locked ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: locked ? 0.45 : 1,
                width: '100%',
              }}
            >
              <span
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 4,
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-hair)'}`,
                  background: on ? 'var(--accent)' : 'var(--paper-0)',
                  flex: 'none',
                }}
              />
              <span style={{ flex: 1, font: '500 12px/1.2 var(--font-sans)', color: 'var(--ink-1)' }}>
                {c.label}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ paddingTop: 10, font: 'var(--type-mono-xs)', color: 'var(--ink-6)' }}>
        Up to {MAX_CATALOG_CATEGORIES} categories
      </div>
    </div>
  );

  const sourceBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
      <div className="dg-tabs dg-tabs--segment" style={{ flex: 'none' }} role="tablist" aria-label="Model source">
        {SOURCE_TABS.map((tab) => {
          if (tab.id === 'mine' && !user) return null;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              className={`dg-tabs__btn${source === tab.id ? ' is-active' : ''}`}
              onClick={() => {
                setSource(tab.id);
                if (tab.id === 'mine' && sort === 'hot') setSort('newest');
                else if (tab.id !== 'mine' && sort === 'newest') setSort('hot');
              }}
            >
              <span>{tab.label}</span>
              <span className="dg-tabs__sub">{tab.sub}</span>
            </button>
          );
        })}
      </div>
      <span className="dg-row__meta" style={{ marginLeft: 'auto' }}>
        {loading && models.length === 0 ? '…' : `${total} models`}
      </span>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="dg-sort-btn"
          onClick={() => setSortOpen((v) => !v)}
          aria-expanded={sortOpen}
          aria-haspopup="listbox"
        >
          <span className="dg-sort-btn__eyebrow">Sort</span>
          <span className="dg-sort-btn__value">{sortLabel}</span>
          <svg className="dg-sort-btn__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {sortOpen ? (
          <div
            className="dg-more-menu"
            style={{ position: 'absolute', right: 0, top: 42, width: 190, zIndex: 5, borderRadius: 9 }}
            role="listbox"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="dg-more-menu__item"
                role="option"
                aria-selected={sort === opt.id}
                onClick={() => {
                  setSort(opt.id);
                  setSortOpen(false);
                }}
              >
                {opt.label}
                {sort === opt.id ? <span className="dg-more-menu__kbd">✓</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  const search = (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: compact ? '100%' : 280,
        padding: '9px 12px',
        background: 'var(--paper-1)',
        border: '1px solid var(--rule-input)',
        borderRadius: 'var(--dg-pill)',
      }}
    >
      <span aria-hidden style={{ color: 'var(--ink-6)', fontSize: 12 }}>⌕</span>
      <input
        type="search"
        placeholder="Search models"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          font: '400 13px/1 var(--font-sans)',
          color: 'var(--ink-0)',
        }}
      />
    </label>
  );

  const body = (
    <>
      {sourceBar}
      {categories.length > 0 ? (
        <div className="dg-chip-row" style={{ marginBottom: 10 }}>
          {categories.map((slug) => {
            const def = CATALOG_CATEGORY_DEFS.find((c) => c.slug === slug);
            return (
              <button
                key={slug}
                type="button"
                className="dg-chip is-accent"
                onClick={() => toggleCat(slug)}
              >
                {def?.label ?? slug} ×
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          gap: compact ? 0 : 0,
          minHeight: 0,
          flex: 1,
          flexDirection: compact ? 'column' : 'row',
        }}
      >
        <div
          style={{
            flex: compact ? 'none' : 'none',
            width: compact ? '100%' : 210,
            borderRight: compact ? 'none' : '1px solid var(--rule-soft)',
            paddingRight: compact ? 0 : 12,
            marginBottom: compact ? 12 : 0,
            maxHeight: compact ? 220 : undefined,
            overflow: compact ? 'auto' : undefined,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filters}
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', paddingLeft: compact ? 0 : 12 }}>
          {list}
        </div>
      </div>
    </>
  );

  return (
    <PanelShell
      compact={compact}
      sheetClass="dg-sheet--library"
      mobileHeight="tall"
      title="Add to the room"
      onClose={onClose}
      headerExtra={!compact ? search : undefined}
      bodyClassName=""
      footer={
        <>
          <button type="button" className="dg-footer-btn is-accent" onClick={onImport} style={{ borderStyle: 'dashed' }}>
            Upload or generate a model
          </button>
          <span style={{ flex: 1, font: '400 11px/1.4 var(--font-sans)', color: 'var(--ink-4)' }}>
            Anything you add lands in the middle of the room.
          </span>
        </>
      }
    >
      {compact ? (
        <>
          <div style={{ marginBottom: 12 }}>{search}</div>
          {body}
        </>
      ) : (
        body
      )}
    </PanelShell>
  );
}
