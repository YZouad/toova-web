import { useEffect, useId, useRef, useState } from 'react';
import {
  CATALOG_CATEGORY_DEFS,
  catalogCategoryLabel,
  toggleCatalogCategory,
  type CatalogCategorySlug,
} from '../lib/catalogCategories';
import type { GallerySort, GallerySource } from '../lib/galleryCatalog';
import type { RoomGallerySort } from '../lib/roomGallery';
import { Button, Input, Tabs } from './kit';

type FilterSource = Exclude<GallerySource, 'toova'> | 'toova';

interface GalleryFiltersProps {
  entity: 'models' | 'rooms';
  source: GallerySource;
  /** Models use GallerySort; rooms use RoomGallerySort — both include 'hot'. */
  sort: GallerySort | RoomGallerySort;
  categories: string[];
  query: string;
  showMine?: boolean;
  /** Hide Community / Toova / My creations source tabs (e.g. Models page). */
  hideSourceTabs?: boolean;
  dense?: boolean;
  /** Show search field in this row (e.g. designer embed). */
  showSearch?: boolean;
  /** Hide sort / category (parent page owns them in the header). */
  hideSortAndCategory?: boolean;
  onSourceChange: (source: GallerySource) => void;
  onSortChange: (sort: GallerySort | RoomGallerySort) => void;
  onCategoriesChange: (categories: string[]) => void;
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

export function gallerySortLabel(entity: 'models' | 'rooms', sort: string): string {
  const opts = entity === 'models' ? MODEL_SORTS : ROOM_SORTS;
  return opts.find((s) => s.id === sort)?.label ?? 'Sort';
}

export function GallerySortMenu({
  entity,
  sort,
  source,
  onSortChange,
}: {
  entity: 'models' | 'rooms';
  sort: GallerySort | RoomGallerySort;
  source?: GallerySource;
  onSortChange: (sort: GallerySort | RoomGallerySort) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const allOptions = entity === 'models' ? MODEL_SORTS : ROOM_SORTS;
  const sortOptions =
    entity === 'models' && source === 'mine'
      ? allOptions.filter((s) => s.id !== 'hot')
      : allOptions;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeSort =
    entity === 'models' && source === 'mine' && sort === 'hot' ? 'newest' : sort;

  return (
    <div className="gallery-chip-menu" ref={wrapRef}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
      >
        {gallerySortLabel(entity, activeSort)} ▾
      </Button>
      {open ? (
        <ul id={menuId} className="gallery-menu" role="listbox" aria-label="Sort by">
          {sortOptions.map((s) => (
            <li key={s.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={activeSort === s.id}
                className={`gallery-menu-item${activeSort === s.id ? ' is-active' : ''}`}
                onClick={() => {
                  onSortChange(s.id);
                  setOpen(false);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function GalleryCategoryMenu({
  categories,
  onCategoriesChange,
}: {
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = categories as CatalogCategorySlug[];
  const buttonLabel =
    selected.length === 0
      ? 'Category'
      : selected.length === 1
        ? catalogCategoryLabel(selected[0]!)
        : selected.length === 2
          ? `${catalogCategoryLabel(selected[0]!)} · ${catalogCategoryLabel(selected[1]!)}`
          : `${selected.length} categories`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="gallery-chip-menu" ref={wrapRef}>
      <Button
        size="sm"
        variant={selected.length > 0 ? 'primary' : 'outline'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
      >
        {buttonLabel} ▾
      </Button>
      {open ? (
        <div id={menuId} className="gallery-cat-panel" role="dialog" aria-label="Filter by category">
          <button
            type="button"
            className={`gallery-cat-option${selected.length === 0 ? ' is-active' : ''}`}
            onClick={() => onCategoriesChange([])}
          >
            All categories
          </button>
          <p className="gallery-cat-hint">Select multiple to match all</p>
          <div className="gallery-cat-grid">
            {CATALOG_CATEGORY_DEFS.map((c) => {
              const on = selected.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  className={`gallery-cat-option${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    onCategoriesChange(
                      toggleCatalogCategory(selected, c.slug as CatalogCategorySlug),
                    )
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GalleryFilters({
  entity,
  source,
  sort,
  categories,
  query,
  showMine,
  hideSourceTabs = false,
  dense,
  showSearch = false,
  hideSortAndCategory = false,
  onSourceChange,
  onSortChange,
  onCategoriesChange,
  onQueryChange,
}: GalleryFiltersProps) {
  const showSourceTabs = entity === 'models' && !hideSourceTabs;
  const showTools = showSearch || !hideSortAndCategory;
  if (!showSourceTabs && !showTools) return null;

  const sourceTabs: { id: FilterSource; label: string }[] = [
    { id: 'community', label: 'Community' },
    { id: 'toova', label: 'Toova' },
    ...(showMine ? [{ id: 'mine' as const, label: 'My creations' }] : []),
  ];

  return (
    <div
      className="gallery-filters-row"
      style={{ marginTop: dense ? 0 : 28, marginBottom: 8 }}
    >
      <div className="gallery-page-header" style={{ width: '100%', marginBottom: 0 }}>
        {showSourceTabs ? (
          <Tabs
            active={source}
            onChange={(id) => onSourceChange(id as GallerySource)}
            style={{ flex: 1, minWidth: 0 }}
            tabs={sourceTabs.map((t) => ({ id: t.id, label: t.label }))}
          />
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {showTools ? (
          <div className="gallery-filters-bar">
            {showSearch ? (
              <Input
                placeholder={entity === 'rooms' ? 'Search rooms' : 'Search models'}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                style={{ width: dense ? 180 : 220 }}
              />
            ) : null}
            {!hideSortAndCategory ? (
              <>
                <GallerySortMenu
                  entity={entity}
                  sort={sort}
                  source={source}
                  onSortChange={onSortChange}
                />
                {entity === 'models' ? (
                  <GalleryCategoryMenu
                    categories={categories}
                    onCategoriesChange={onCategoriesChange}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
