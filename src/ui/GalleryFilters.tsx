import { useEffect, useId, useRef, useState } from 'react';
import {
  CATALOG_CATEGORY_DEFS,
  catalogCategoryLabel,
  type CatalogCategorySlug,
} from '../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../lib/galleryCatalog';
import type { RoomGallerySort } from '../lib/roomGallery';

type FilterSource = Exclude<GallerySource, 'toova'> | 'toova';

interface GalleryFiltersProps {
  entity: 'models' | 'rooms';
  source: GallerySource;
  /** Models use GallerySort; rooms use RoomGallerySort — both include 'hot'. */
  sort: GallerySort | RoomGallerySort;
  category: string | null;
  query: string;
  showMine?: boolean;
  dense?: boolean;
  onSourceChange: (source: GallerySource) => void;
  onSortChange: (sort: GallerySort | RoomGallerySort) => void;
  onCategoryChange: (category: string | null) => void;
  onQueryChange: (query: string) => void;
}

const MODEL_SORTS: { id: GallerySort; label: string }[] = [
  { id: 'hot', label: 'Trending' },
  { id: 'downloads', label: 'Most downloaded' },
  { id: 'likes', label: 'Most liked' },
  { id: 'views', label: 'Most viewed' },
  { id: 'newest', label: 'Newest' },
];

const ROOM_SORTS: { id: RoomGallerySort; label: string }[] = [
  { id: 'hot', label: 'Trending' },
  { id: 'clones', label: 'Most cloned' },
  { id: 'likes', label: 'Most liked' },
  { id: 'views', label: 'Most viewed' },
  { id: 'newest', label: 'Newest' },
];

function sortLabel(
  entity: 'models' | 'rooms',
  sort: string,
): string {
  const opts = entity === 'models' ? MODEL_SORTS : ROOM_SORTS;
  return opts.find((s) => s.id === sort)?.label ?? 'Sort';
}

export function GalleryFilters({
  entity,
  source,
  sort,
  category,
  query,
  showMine,
  dense,
  onSourceChange,
  onSortChange,
  onCategoryChange,
  onQueryChange,
}: GalleryFiltersProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const sortWrapRef = useRef<HTMLDivElement>(null);
  const catWrapRef = useRef<HTMLDivElement>(null);
  const sortMenuId = useId();
  const catMenuId = useId();

  useEffect(() => {
    if (!sortOpen && !catOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sortOpen && sortWrapRef.current && !sortWrapRef.current.contains(t)) {
        setSortOpen(false);
      }
      if (catOpen && catWrapRef.current && !catWrapRef.current.contains(t)) {
        setCatOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSortOpen(false);
        setCatOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen, catOpen]);

  const categoryLabel = category ? catalogCategoryLabel(category) : 'Category';
  const sortOptions = entity === 'models' ? MODEL_SORTS : ROOM_SORTS;
  const showCategory = entity === 'models';
  const showSourceTabs = entity === 'models';
  const sourceTabs: { id: FilterSource; label: string }[] = [
    { id: 'community', label: 'Community' },
    { id: 'toova', label: 'Toova' },
    ...(showMine ? [{ id: 'mine' as const, label: 'My creations' }] : []),
  ];

  return (
    <div className={`gallery-filters${dense ? ' gallery-filters--dense' : ''}`}>
      {showSourceTabs ? (
        <div className="gallery-source-tabs" role="tablist" aria-label="Gallery source">
          {sourceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              className={`gallery-source-tab${source === tab.id ? ' is-active' : ''}`}
              onClick={() => onSourceChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="gallery-search">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={
            entity === 'models'
              ? 'Search models, categories, creators…'
              : 'Search rooms, creators…'
          }
          aria-label={entity === 'models' ? 'Search models' : 'Search rooms'}
        />
      </div>

      <div className="gallery-toolbar">
        {entity === 'rooms' || source !== 'mine' ? (
          <div className="gallery-toolbar-left">
            <div className="gallery-menu-wrap" ref={sortWrapRef}>
              <button
                type="button"
                className={`gallery-chip gallery-chip--menu is-active${sortOpen ? ' is-open' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                aria-controls={sortMenuId}
                onClick={() => {
                  setSortOpen((v) => !v);
                  setCatOpen(false);
                }}
              >
                <span>{sortLabel(entity, sort)}</span>
                <span className="gallery-chip-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {sortOpen ? (
                <ul
                  id={sortMenuId}
                  className="gallery-menu"
                  role="listbox"
                  aria-label="Sort by"
                >
                  {sortOptions.map((s) => (
                    <li key={s.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={sort === s.id}
                        className={`gallery-menu-item${sort === s.id ? ' is-active' : ''}`}
                        onClick={() => {
                          onSortChange(s.id);
                          setSortOpen(false);
                        }}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="gallery-mine-hint">Newest first</p>
        )}

        {showCategory ? (
          <div className="gallery-menu-wrap gallery-menu-wrap--cat" ref={catWrapRef}>
            <button
              type="button"
              className={`gallery-chip gallery-chip--menu${category ? ' is-active' : ''}${catOpen ? ' is-open' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={catOpen}
              aria-controls={catMenuId}
              onClick={() => {
                setCatOpen((v) => !v);
                setSortOpen(false);
              }}
            >
              <span className="gallery-chip-label">
                {category ? categoryLabel : 'Category'}
              </span>
              <span className="gallery-chip-caret" aria-hidden>
                ▾
              </span>
            </button>
            {catOpen ? (
              <div
                id={catMenuId}
                className="gallery-cat-panel"
                role="dialog"
                aria-label="Filter by category"
              >
                <button
                  type="button"
                  className={`gallery-cat-option${category == null ? ' is-active' : ''}`}
                  onClick={() => {
                    onCategoryChange(null);
                    setCatOpen(false);
                  }}
                >
                  All categories
                </button>
                <div className="gallery-cat-grid">
                  {CATALOG_CATEGORY_DEFS.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className={`gallery-cat-option${category === c.slug ? ' is-active' : ''}`}
                      onClick={() => {
                        onCategoryChange(
                          category === c.slug
                            ? null
                            : (c.slug as CatalogCategorySlug),
                        );
                        setCatOpen(false);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
