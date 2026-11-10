import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { GallerySort, GallerySource } from '../../../lib/galleryCatalog';
import {
  LIBRARY_SORT_OPTIONS,
  LIBRARY_SOURCE_TABS,
  type LibraryModelApi,
} from './useLibraryModel';
import type { CatalogCategorySlug } from '../../../lib/catalogCategories';

export function LibrarySearch({
  query,
  setQuery,
  wide,
}: {
  query: string;
  setQuery: (q: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`dgl-search${wide ? ' dgl-search--wide' : ''}`}>
      <span aria-hidden className="dgl-search__icon">
        ⌕
      </span>
      <input
        type="search"
        placeholder="Search models"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </label>
  );
}

export function LibrarySourceBar({
  source,
  setSource,
  sort,
  setSort,
  sortOpen,
  setSortOpen,
  sortLabel,
  total,
  loading,
  user,
  drawTools,
}: Pick<
  LibraryModelApi,
  | 'source'
  | 'setSource'
  | 'sort'
  | 'setSort'
  | 'sortOpen'
  | 'setSortOpen'
  | 'sortLabel'
  | 'total'
  | 'loading'
  | 'user'
> & {
  /** Optional Draw & measure popover content. */
  drawTools?: ReactNode;
}) {
  const [drawOpen, setDrawOpen] = useState(false);
  const drawRef = useRef<HTMLDivElement>(null);
  const drawId = useId();

  useEffect(() => {
    if (!drawOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!drawRef.current?.contains(e.target as Node)) setDrawOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawOpen]);

  return (
    <div className="dgl-source-bar">
      <div className="dg-tabs dg-tabs--segment" role="tablist" aria-label="Model source">
        {LIBRARY_SOURCE_TABS.map((tab) => {
          if (tab.id === 'mine' && !user) return null;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              className={`dg-tabs__btn${source === tab.id ? ' is-active' : ''}`}
              onClick={() => setSource(tab.id as GallerySource)}
            >
              <span>{tab.label}</span>
              <span className="dg-tabs__sub">{tab.sub}</span>
            </button>
          );
        })}
      </div>
      <span className="dg-row__meta dgl-source-bar__count">
        {loading && total === 0 ? '…' : `${total} models`}
      </span>
      {drawTools ? (
        <div className="dgl-draw-popover" ref={drawRef}>
          <button
            type="button"
            className="dgl-btn dgl-draw-popover__btn"
            aria-expanded={drawOpen}
            aria-haspopup="dialog"
            aria-controls={drawId}
            onClick={() => setDrawOpen((v) => !v)}
          >
            Draw &amp; measure
          </button>
          {drawOpen ? (
            <div
              id={drawId}
              className="dgl-draw-popover__panel"
              role="dialog"
              aria-label="Draw and measure"
            >
              {drawTools}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="dgl-sort">
        <button
          type="button"
          className="dg-sort-btn"
          onClick={() => setSortOpen((v) => !v)}
          aria-expanded={sortOpen}
          aria-haspopup="listbox"
        >
          <span className="dg-sort-btn__eyebrow">Sort</span>
          <span className="dg-sort-btn__value">{sortLabel}</span>
          <svg
            className="dg-sort-btn__chev"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {sortOpen ? (
          <div className="dg-more-menu dgl-sort__menu" role="listbox">
            {LIBRARY_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="dg-more-menu__item"
                role="option"
                aria-selected={sort === opt.id}
                onClick={() => {
                  setSort(opt.id as GallerySort);
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
}

export function LibraryCategoryChips({
  categories,
  toggleCat,
  defs,
}: {
  categories: CatalogCategorySlug[];
  toggleCat: (slug: CatalogCategorySlug) => void;
  defs: readonly { slug: CatalogCategorySlug; label: string }[];
}) {
  if (categories.length === 0) return null;
  return (
    <div className="dg-chip-row dgl-active-cats">
      {categories.map((slug) => {
        const def = defs.find((c) => c.slug === slug);
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
  );
}

export function LibraryCategoryList({
  categories,
  toggleCat,
  setCategories,
  defs,
  maxCategories,
}: {
  categories: CatalogCategorySlug[];
  toggleCat: (slug: CatalogCategorySlug) => void;
  setCategories: (cats: CatalogCategorySlug[]) => void;
  defs: readonly { slug: CatalogCategorySlug; label: string }[];
  maxCategories: number;
}) {
  return (
    <div className="dgl-cat-list">
      <div className="dg-row dg-row--between" style={{ padding: '4px 0 8px', minHeight: 0 }}>
        <span className="dgl-eyebrow">Category</span>
        {categories.length > 0 ? (
          <button type="button" className="dgl-link" onClick={() => setCategories([])}>
            clear
          </button>
        ) : null}
      </div>
      <div className="dgl-cat-list__scroll">
        {defs.map((c) => {
          const on = categories.includes(c.slug);
          const locked = !on && categories.length >= maxCategories;
          return (
            <button
              key={c.slug}
              type="button"
              disabled={locked}
              aria-pressed={on}
              onClick={() => toggleCat(c.slug)}
              className={`dgl-cat-row${on ? ' is-on' : ''}`}
            >
              <span className={`dgl-check${on ? ' is-on' : ''}`} />
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>
      <div className="dgl-muted" style={{ paddingTop: 10 }}>
        Up to {maxCategories} categories
      </div>
    </div>
  );
}

export function LibraryEmpty({
  categories,
  setCategories,
}: {
  categories: CatalogCategorySlug[];
  setCategories: (cats: CatalogCategorySlug[]) => void;
}) {
  return (
    <div className="dgl-empty">
      <span className="dgl-empty__title">Nothing here yet</span>
      <span className="dgl-muted">
        No models match these filters. Try another source, or clear a category.
      </span>
      {categories.length > 0 ? (
        <button type="button" className="dg-footer-btn" onClick={() => setCategories([])}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function LibraryFooter({
  onImport,
  hint,
  secondary = false,
}: {
  onImport: () => void;
  hint?: string;
  /** Outline style so Place/Buy keep the accent. */
  secondary?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        className={`dg-footer-btn${secondary ? '' : ' is-accent'}`}
        onClick={onImport}
        style={{ borderStyle: 'dashed' }}
      >
        Upload or generate a model
      </button>
      {hint ? <span className="dgl-footer-hint">{hint}</span> : null}
    </>
  );
}
