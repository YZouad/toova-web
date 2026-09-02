import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useShoppingCatalogContext } from '../../context/ShoppingCatalogContext';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../../hooks/useBuiltinPreviews';
import { useDesignerSearch } from '../../hooks/useDesignerSearch';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import type { CuratedProduct } from '../../lib/dormChecklist';
import type { HangingDecorKind } from '../../store';
import { getProductDrawKind } from '../../lib/dormChecklist';
import { useStore } from '../../store';
import { IconSearch } from './icons';
import type { CommandPaletteCommand } from './commandPaletteCommands';
import type { SearchResult } from './commandSearchTypes';
import { placeCuratedProduct, startChecklistDrawPlacement } from '../../lib/placeCuratedProduct';
import { placeFromCatalog } from './placeCatalogModel';

export type { CommandPaletteCommand } from './commandPaletteCommands';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandPaletteCommand[];
  onPlaceModel?: (model: GalleryModel) => void;
  onPlaceAndEdit?: (model: GalleryModel) => void;
  onStartDraw?: (kind: HangingDecorKind) => void;
  onAddLight?: () => void;
  onOpenInspector?: () => void;
  onOpenAddPanel?: () => void;
  userId?: string | null;
  /** Element that opened the palette (for focus restore). */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function HighlightLabel({
  label,
  ranges,
}: {
  label: string;
  ranges?: Array<{ start: number; end: number }>;
}) {
  if (!ranges?.length) return <>{label}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(label.slice(cursor, r.start));
    parts.push(
      <mark key={i} className="dg-cmdk-mark">
        {label.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < label.length) parts.push(label.slice(cursor));
  return <>{parts}</>;
}

function ActionGlyph({ icon }: { icon?: string }) {
  if (icon === 'light') return <span aria-hidden>☀</span>;
  if (icon === 'paint') return <span aria-hidden>◫</span>;
  if (icon === 'camera') return <span aria-hidden>◎</span>;
  if (icon === 'add') return <span aria-hidden>+</span>;
  if (icon === 'look') return <span aria-hidden>◫</span>;
  if (icon === 'pieces') return <span aria-hidden>☰</span>;
  if (icon === 'help') return <span aria-hidden>?</span>;
  if (icon === 'save') return <span aria-hidden>↓</span>;
  if (icon === 'share') return <span aria-hidden>↗</span>;
  if (icon === 'export') return <span aria-hidden>▣</span>;
  return <span aria-hidden>·</span>;
}

export function CommandPalette({
  open,
  onClose,
  commands,
  onPlaceModel,
  onPlaceAndEdit,
  onStartDraw,
  onAddLight,
  onOpenInspector,
  onOpenAddPanel,
  userId,
  restoreFocusRef,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionIdPrefix = useId();
  const { list, productsById, categories } = useShoppingCatalogContext();
  const builtinPreviews = useBuiltinPreviews();

  const checklistProducts = useMemo(() => {
    const out: CuratedProduct[] = [];
    for (const cat of categories) {
      for (const p of cat.products) out.push(p);
    }
    // Also include products referenced only via shopping list
    for (const entry of list) {
      const p = productsById[entry.productId];
      if (p && !out.some((x) => x.id === p.id)) out.push(p);
    }
    return out;
  }, [categories, list, productsById]);

  const checklistProductIds = useMemo(
    () => new Set(list.map((e) => e.productId)),
    [list],
  );

  const checklistKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const entry of list) {
      const product = productsById[entry.productId];
      if (!product) continue;
      if (product.placeBuiltinKind) kinds.add(product.placeBuiltinKind);
      if (product.placeCatalogKind) kinds.add(product.placeCatalogKind);
    }
    for (const p of checklistProducts) {
      if (p.placeBuiltinKind) kinds.add(p.placeBuiltinKind);
      if (p.placeCatalogKind) kinds.add(p.placeCatalogKind);
    }
    return kinds;
  }, [list, productsById, checklistProducts]);

  const placeModel = (model: GalleryModel, andEdit?: boolean) => {
    if (andEdit && onPlaceAndEdit) {
      onPlaceAndEdit(model);
      return;
    }
    if (onPlaceModel) {
      onPlaceModel(model);
      return;
    }
    const id = placeFromCatalog(model, userId);
    if (andEdit && id) {
      useStore.getState().select(id);
      onOpenInspector?.();
    }
    onClose();
  };

  const placeProduct = async (product: CuratedProduct, andEdit?: boolean) => {
    const drawKind = getProductDrawKind(product);
    if (drawKind) {
      startChecklistDrawPlacement(product);
      onStartDraw?.(drawKind);
      onClose();
      return;
    }
    const id = await placeCuratedProduct(product);
    if (id) {
      useStore.getState().select(id);
      if (andEdit) onOpenInspector?.();
    }
    onClose();
  };

  const search = useDesignerSearch({
    open,
    query,
    commands,
    checklistProducts,
    checklistProductIds,
    checklistKinds,
    onPlaceModel: placeModel,
    onPlaceProduct: (p, andEdit) => {
      void placeProduct(p, andEdit);
    },
    onStartDraw: (kind) => {
      onStartDraw?.(kind);
      onClose();
    },
    onAddLight: () => {
      onAddLight?.();
      onClose();
    },
    onSelectItem: (id) => {
      useStore.getState().select(id);
      onClose();
    },
    onEditItem: (id) => {
      useStore.getState().select(id);
      onOpenInspector?.();
      onClose();
    },
    onOpenAddPanel,
    includeMine: true,
  });

  const items = search.results;
  const hasPlaceable = items.some(
    (i) => i.type === 'catalogModel' || i.type === 'checklistProduct' || i.type === 'syntheticTool',
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef?.current?.focus?.();
    };
  }, [open, restoreFocusRef]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    setActive((i) => {
      if (items.length === 0) return 0;
      return Math.min(i, items.length - 1);
    });
  }, [items.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmdk-index="${active}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open, items]);

  useEffect(() => {
    if (!open) return;
    const runItem = (item: SearchResult, andEdit: boolean) => {
      if (andEdit && item.runAndEdit) item.runAndEdit();
      else item.run();
      if (
        item.type === 'action' &&
        !['action-keys', 'action-tour'].includes(item.id)
      ) {
        onClose();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
        if (nodes.length === 0) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(Math.max(items.length - 1, 0), i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[active];
        if (!item) return;
        const andEdit = e.metaKey || e.ctrlKey;
        runItem(item, andEdit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  if (!open) return null;

  const activeOptionId =
    items[active] != null ? `${optionIdPrefix}-opt-${items[active]!.id}` : undefined;

  const sections: Array<{ key: 'add' | 'room' | 'actions'; label: string }> = [
    { key: 'add', label: 'Add to room' },
    { key: 'room', label: 'In this room' },
    { key: 'actions', label: 'Actions' },
  ];

  let flatIndex = -1;

  return (
    <div
      className="dg-cmdk"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="dg-cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="dg-cmdk-input">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${optionIdPrefix}-listbox`}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            placeholder="Search pieces, colors, actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands"
          />
          <button type="button" className="dg-cmdk-esc" onClick={onClose} aria-label="Close search">
            ESC
          </button>
        </div>

        <div
          id={`${optionIdPrefix}-listbox`}
          ref={listRef}
          className="dg-cmdk-list"
          role="listbox"
          aria-label="Search results"
        >
          <div className="dg-cmdk-live" aria-live="polite">
            {search.announcement}
          </div>

          {search.status === 'loading' && items.length === 0 ? (
            <div className="dg-cmdk-loading" aria-hidden>
              <span className="dg-cmdk-skeleton" />
              <span className="dg-cmdk-skeleton" />
              <span className="dg-cmdk-skeleton" />
            </div>
          ) : null}

          {search.status === 'error' ? (
            <div className="dg-cmdk-error" role="alert">
              <span>{search.error ?? 'Search failed'}</span>
              <button type="button" className="dg-cmdk-retry" onClick={search.retry}>
                Retry
              </button>
            </div>
          ) : null}

          {query.trim().length === 1 ? (
            <p className="dg-cmdk-hint">Keep typing to search pieces</p>
          ) : null}

          {items.length === 0 && search.status !== 'loading' && query.trim().length >= 2 ? (
            <p className="dg-cmdk-empty">
              No matching results. Try a color name, “string lights”, or an action like “Present”.
            </p>
          ) : null}

          {sections.map((sec, secIdx) => {
            const rows = items.filter((i) => i.section === sec.key);
            if (rows.length === 0) return null;
            const showRule = secIdx > 0 && items.some((i) => {
              const order = sections.findIndex((s) => s.key === i.section);
              return order < secIdx;
            });
            return (
              <div key={sec.key} role="group" aria-labelledby={`${optionIdPrefix}-${sec.key}`}>
                {showRule ? <div className="dg-cmdk-rule" aria-hidden /> : null}
                <div className="dg-cmdk-group" id={`${optionIdPrefix}-${sec.key}`}>
                  {sec.label}
                </div>
                {rows.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const optionId = `${optionIdPrefix}-opt-${item.id}`;
                  const letter = (item.label.trim()[0] ?? '?').toUpperCase();
                  const catalogThumb =
                    item.type === 'catalogModel' || item.type === 'checklistProduct'
                      ? item.previewUrl ??
                        (item.type === 'catalogModel' && item.model.isBuiltin
                          ? getBuiltinPreviewUrl(item.model.kind, builtinPreviews)
                          : undefined)
                      : undefined;
                  return (
                    <button
                      key={item.id}
                      id={optionId}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-cmdk-index={index}
                      className={`dg-cmdk-item${index === active ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => {
                        item.run();
                        // Overlay-switching actions (keys, etc.) replace cmdk themselves.
                        if (
                          item.type === 'action' &&
                          !['action-keys', 'action-tour'].includes(item.id)
                        ) {
                          onClose();
                        }
                      }}
                    >
                      {item.type === 'catalogModel' || item.type === 'checklistProduct' ? (
                        <span className="dg-cmdk-item__thumb" aria-hidden>
                          {catalogThumb ? (
                            <img src={catalogThumb} alt="" draggable={false} />
                          ) : item.type === 'catalogModel' && item.thumbColor ? (
                            <span
                              className="dg-cmdk-item__swatch"
                              style={{ background: item.thumbColor }}
                            />
                          ) : (
                            letter
                          )}
                        </span>
                      ) : item.type === 'syntheticTool' ? (
                        <span
                          className="dg-cmdk-item__thumb"
                          aria-hidden
                          style={{ background: item.thumbColor ?? 'var(--paper-3)' }}
                        />
                      ) : item.type === 'action' ? (
                        <span className="dg-cmdk-item__icon" aria-hidden>
                          <ActionGlyph icon={item.icon} />
                        </span>
                      ) : (
                        <span className="dg-cmdk-item__icon" aria-hidden>
                          ·
                        </span>
                      )}
                      <span className="dg-cmdk-item__label">
                        <HighlightLabel label={item.label} ranges={item.highlightRanges} />
                      </span>
                      {item.meta ? (
                        <span className="dg-cmdk-item__meta">{item.meta}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {search.hasMore && onOpenAddPanel ? (
            <button
              type="button"
              className="dg-cmdk-more"
              onClick={() => {
                onOpenAddPanel();
                onClose();
              }}
            >
              Show all in Add…
            </button>
          ) : null}
        </div>

        <div className="dg-cmdk-foot">
          <span>↑↓ move</span>
          <span>{hasPlaceable ? '↵ place' : '↵ run'}</span>
          {hasPlaceable ? <span>⌘↵ place &amp; edit</span> : <span>esc close</span>}
        </div>
      </div>
    </div>
  );
}
