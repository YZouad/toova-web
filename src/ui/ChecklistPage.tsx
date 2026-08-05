import { useCallback, useMemo, useState } from 'react';
import type { CuratedProduct } from '../lib/dormChecklist';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import { ProductDrawer } from './ProductDrawer';
import { useStore } from '../store';
import type { FurnitureKind } from '../furniture/registry';
import { FURNITURE } from '../furniture/registry';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { parseInchDims } from '../lib/importedItemSize';
import { supabase } from '../lib/supabase';
import { recordCatalogDownload } from '../lib/catalogEngagement';

interface ChecklistPageProps {
  onBack: () => void;
  onDesign?: () => void;
  /** When true, Place actions are available (designer workspace active). */
  canPlace?: boolean;
}

export function ChecklistPage({ onBack, onDesign, canPlace = false }: ChecklistPageProps) {
  const {
    categories,
    loading,
    error,
    isCategoryDone,
    toggleChecked,
    addToList,
  } = useShoppingCatalogContext();
  const addItem = useStore((s) => s.addItem);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const openCategory = useMemo(
    () => categories.find((c) => c.id === openCategoryId) ?? null,
    [categories, openCategoryId],
  );

  const { done, total } = useMemo(
    () => ({
      done: categories.filter((c) => isCategoryDone(c.id)).length,
      total: categories.length,
    }),
    [categories, isCategoryDone],
  );

  const placeProduct = useCallback(
    async (product: CuratedProduct) => {
      await addToList(product.id);
      if (product.placeBuiltinKind && product.placeBuiltinKind in FURNITURE) {
        addItem(product.placeBuiltinKind as Exclude<FurnitureKind, 'imported' | 'hanging'>, {
          label: product.name,
          curatedProductId: product.id,
        });
        return;
      }
      if (product.placeCatalogKind) {
        const { data, error: qErr } = await supabase
          .from('furniture_catalog')
          .select('kind,label,model_url,width_in,height_in,depth_in')
          .eq('kind', product.placeCatalogKind)
          .maybeSingle();
        if (qErr || !data?.model_url) return;
        const path = String(data.model_url).trim();
        const signed = await signBrowsableModelPath(path);
        if (!signed) return;
        const catalogSizeIn = parseInchDims(
          Number(data.width_in),
          Number(data.height_in),
          Number(data.depth_in),
        );
        addItem('imported', {
          url: signed,
          storagePath: path,
          label: product.name || String(data.label),
          catalogSizeIn: catalogSizeIn ?? undefined,
          curatedProductId: product.id,
        });
        void recordCatalogDownload(String(data.kind)).catch(() => {});
      }
    },
    [addItem, addToList],
  );

  return (
    <div className="checklist-page">
      <header className="checklist-page-topbar">
        <button type="button" className="checklist-page-back" onClick={onBack}>
          ← Back
        </button>
        <div className="checklist-page-brand">
          <div className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>
            t
          </div>
          <span className="tv-logo-text" style={{ fontSize: 22 }}>
            Toova
          </span>
        </div>
        {onDesign ? (
          <button type="button" className="tv-btn-primary checklist-page-design" onClick={onDesign}>
            Design your room
          </button>
        ) : (
          <span className="checklist-page-topbar-spacer" />
        )}
      </header>

      <main className="checklist-page-main">
        <div className="checklist-page-intro">
          <p className="checklist-page-eyebrow">Dorm essentials</p>
          <h1 className="checklist-page-title">The Toova checklist</h1>
          <p className="checklist-page-copy">
            Tap an item to compare our curated picks. Shop affiliate links, add them to your list,
            and place matching pieces in your room before you buy.
          </p>
          <div className="checklist-page-progress" aria-live="polite">
            <span className="checklist-page-progress-label">
              {done} of {total} packed
            </span>
            <div className="checklist-page-progress-track" aria-hidden>
              <div
                className="checklist-page-progress-fill"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {loading ? <p className="checklist-page-status">Loading checklist…</p> : null}
        {error ? (
          <p className="checklist-page-status checklist-page-status--error" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="checklist-page-list">
          {categories.map((item) => {
            const isChecked = isCategoryDone(item.id);
            const count = item.products.length;
            return (
              <li
                key={item.id}
                className={`checklist-page-row${isChecked ? ' checklist-page-row--done' : ''}`}
              >
                <label
                  className="checklist-page-check"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => void toggleChecked(item.id)}
                  />
                  <span className="checklist-page-box" aria-hidden />
                </label>
                <button
                  type="button"
                  className="checklist-page-open"
                  onClick={() => setOpenCategoryId(item.id)}
                >
                  <span className="checklist-page-name">{item.name}</span>
                  <span className="checklist-page-links">
                    {count === 0 ? (
                      <span className="checklist-page-soon">Coming soon</span>
                    ) : (
                      <span className="checklist-page-shop">
                        View {count} pick{count === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="checklist-page-disclaimer">
          As an Amazon Associate, Toova may earn from qualifying purchases. Prices may change.
        </p>
      </main>

      {openCategory ? (
        <ProductDrawer
          categoryName={openCategory.name}
          products={openCategory.products}
          canPlace={canPlace}
          onClose={() => setOpenCategoryId(null)}
          onAddToList={(p) => void addToList(p.id)}
          onPlace={canPlace ? (p) => void placeProduct(p) : undefined}
        />
      ) : null}
    </div>
  );
}
