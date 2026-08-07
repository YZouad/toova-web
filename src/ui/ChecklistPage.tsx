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
import {
  Banner,
  Button,
  Checkbox,
  Eyebrow,
  Logo,
  MonoMeta,
  SectionOpener,
  SiteFooter,
  Spinner,
} from './kit';
import { FeedbackModal } from './FeedbackModal';

interface ChecklistPageProps {
  onBack: () => void;
  onDesign?: () => void;
  /** When true, Place actions are available (designer workspace active). */
  canPlace?: boolean;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

export function ChecklistPage({
  onBack,
  onDesign,
  canPlace = false,
  onContact,
  onPitchMadness,
  onAdmin,
}: ChecklistPageProps) {
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
    <div className="toova-page app-page checklist-page tv-scroll">
      <div className="toova-paper" aria-hidden />

      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Button variant="mono" onClick={onBack}>
            ← Back
          </Button>
          <Logo size={21} />
          {onDesign ? (
            <Button size="sm" onClick={onDesign}>
              Design your room
            </Button>
          ) : (
            <span style={{ width: 96 }} aria-hidden />
          )}
        </div>
      </header>

      <main className="app-main">
        <Eyebrow level="page">Dorm essentials</Eyebrow>
        <SectionOpener
          level={4}
          title="The Toova checklist."
          note={`${done} of ${total} packed`}
          style={{ marginTop: 24 }}
        />
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', maxWidth: 'var(--measure-body)', margin: '16px 0 32px' }}>
          Tap an item to compare our curated picks. Shop affiliate links, add them to your list,
          and place matching pieces in your room before you buy.
        </p>

        {loading ? <Spinner label="Loading checklist…" /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="kit-ruled-list">
          {categories.map((item, index) => {
            const isChecked = isCategoryDone(item.id);
            const count = item.products.length;
            return (
              <div
                key={item.id}
                className={[
                  'kit-ruled-list__row',
                  index === categories.length - 1 ? 'kit-ruled-list__row--last-in-col' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={() => void toggleChecked(item.id)}
                  label=""
                  style={{ flex: 'none' }}
                />
                <button
                  type="button"
                  className="checklist-row-action"
                  onClick={() => setOpenCategoryId(item.id)}
                >
                  <span className={`checklist-row-name${isChecked ? ' checklist-row-name--done' : ''}`}>
                    {item.name}
                  </span>
                  <MonoMeta size="sm" tone="dense" className="kit-ruled-list__meta">
                    {count === 0 ? 'Coming soon' : `View ${count} pick${count === 1 ? '' : 's'}`}
                  </MonoMeta>
                </button>
              </div>
            );
          })}
        </div>

        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 32 }}>
          As an Amazon Associate, Toova may earn from qualifying purchases. Prices may change.
        </MonoMeta>
      </main>

      <SiteFooter
        onContact={onContact}
        onPitchMadness={onPitchMadness}
        onFeedback={() => setFeedbackOpen(true)}
        onAdmin={onAdmin}
      />
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="dashboard"
      />

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
