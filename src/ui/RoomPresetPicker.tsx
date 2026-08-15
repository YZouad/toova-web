import { useMemo, useState } from 'react';
import {
  type RoomPlanPreset,
  type RoomPlanPresetId,
  ROOM_PLAN_PRESETS,
} from '../lib/roomPlanPresets';
import {
  type RoomTemplate,
  type RoomTemplateId,
  ROOM_TEMPLATES,
  buildTemplateEnvironment,
  templatePreviewItems,
} from '../lib/roomTemplates';
import type { FloorPlan } from '../lib/floorPlanGeometry';
import type { RoomEnvironment } from '../store';
import { Modal, Button, MonoMeta, Plate } from './kit';
import { RoomPreview } from './RoomPreview';
import { PurchaseReviewPanel } from './PurchaseReviewPanel';
import { useShoppingCatalogContext } from '../context/ShoppingCatalogContext';
import type { CuratedProduct, ShoppingListEntry } from '../lib/dormChecklist';

export type RoomCreateSelection =
  | {
      kind: 'template';
      templateId: RoomTemplateId;
      plan: FloorPlan;
      environment: RoomEnvironment;
    }
  | {
      kind: 'preset';
      presetId: RoomPlanPresetId;
      plan: FloorPlan;
    };

interface RoomPresetPickerProps {
  open: boolean;
  creating?: boolean;
  onClose: () => void;
  onSelect: (selection: RoomCreateSelection) => void | Promise<void>;
  onCustomize: () => void;
}

interface PresetPreview {
  preset: RoomPlanPreset;
  plan: FloorPlan;
}

export function RoomPresetPicker({
  open,
  creating = false,
  onClose,
  onSelect,
  onCustomize,
}: RoomPresetPickerProps) {
  const { categories, addToList, list, markReviewDone } =
    useShoppingCatalogContext();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewTemplateId, setReviewTemplateId] = useState<RoomTemplateId | null>(null);

  const previews = useMemo<PresetPreview[]>(
    () => ROOM_PLAN_PRESETS.map((preset) => ({ preset, plan: preset.build() })),
    [],
  );
  const templatePreviews = useMemo(
    () =>
      ROOM_TEMPLATES.map((template) => ({
        template,
        plan: template.buildPlan(),
        items: templatePreviewItems(template),
      })),
    [],
  );

  const disabled = creating || busyId !== null;

  const reviewLines = useMemo(() => {
    if (!reviewTemplateId) return [] as { entry: ShoppingListEntry; product: CuratedProduct }[];
    const template = ROOM_TEMPLATES.find((t) => t.id === reviewTemplateId);
    if (!template) return [];
    const slugToProduct = new Map<string, CuratedProduct>();
    for (const cat of categories) {
      for (const p of cat.products) slugToProduct.set(p.slug, p);
    }
    const lines: { entry: ShoppingListEntry; product: CuratedProduct }[] = [];
    for (const slug of template.essentialProductSlugs) {
      const product = slugToProduct.get(slug);
      if (!product) continue;
      const entry =
        list.find((e) => e.productId === product.id) ??
        ({ productId: product.id, quantity: 1, reviewDone: false } satisfies ShoppingListEntry);
      lines.push({ entry, product });
    }
    return lines;
  }, [reviewTemplateId, categories, list]);

  const runSelect = async (id: string, selection: RoomCreateSelection) => {
    if (disabled) return;
    setBusyId(id);
    try {
      await onSelect(selection);
    } finally {
      setBusyId(null);
    }
  };

  const handleTemplateUse = async (template: RoomTemplate) => {
    if (disabled) return;
    // Prefill To Buy with simple essentials before opening the designer.
    const slugToId = new Map<string, string>();
    for (const cat of categories) {
      for (const p of cat.products) slugToId.set(p.slug, p.id);
    }
    for (const slug of template.essentialProductSlugs) {
      const productId = slugToId.get(slug);
      if (productId) void addToList(productId);
    }
    await runSelect(template.id, {
      kind: 'template',
      templateId: template.id,
      plan: template.buildPlan(),
      environment: buildTemplateEnvironment(template),
    });
  };

  const handlePreset = async (preset: RoomPlanPreset) => {
    await runSelect(preset.id, {
      kind: 'preset',
      presetId: preset.id,
      plan: preset.build(),
    });
  };

  const handleCustom = () => {
    if (disabled) return;
    setBusyId('custom');
    onCustomize();
  };

  return (
    <>
      <Modal
        open={open}
        meta="New room"
        title="Choose a starting layout"
        onClose={disabled ? () => undefined : onClose}
        width={920}
        className="room-preset-modal"
      >
        <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 12 }}>
          Furnished starters
        </MonoMeta>
        <p style={{ margin: '0 0 16px', font: 'var(--type-body-sm)', color: 'var(--ink-4)', maxWidth: '52ch' }}>
          Pick a room that is already designed. Order the simple supplies as-is, or open the designer
          and edit tables, beds, and finishes.
        </p>
        <div className="room-preset-grid room-preset-grid--templates" role="list">
          {templatePreviews.map(({ template, plan, items }) => {
            const isBusy = busyId === template.id;
            return (
              <div
                key={template.id}
                className={[
                  'kit-plate-card',
                  'kit-plate-card--interactive',
                  'room-preset-card',
                  'room-template-card',
                  disabled && !isBusy ? 'room-preset-card--disabled' : '',
                  isBusy ? 'room-preset-card--busy' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <Plate height={148} topCaption={`${template.id}.room`}>
                  <div className="app-ledger-plate-preview room-preset-preview">
                    <RoomPreview geometry={plan} items={items} />
                  </div>
                </Plate>
                <div className="kit-plate-card__caption">
                  <div className="room-preset-card-copy">
                    <div className="kit-plate-card__name">{template.label}</div>
                    <div className="kit-plate-card__author">{template.description}</div>
                  </div>
                  <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                    {isBusy ? 'Creating…' : template.tagline}
                  </span>
                </div>
                <div className="room-template-card-actions">
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => void handleTemplateUse(template)}
                  >
                    Use this room
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setReviewTemplateId(template.id)}
                  >
                    Shop essentials
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <MonoMeta size="sm" tone="dense" style={{ display: 'block', margin: '28px 0 12px' }}>
          Blank floor plans
        </MonoMeta>
        <div className="room-preset-grid" role="list">
          {previews.map(({ preset, plan }) => {
            const isBusy = busyId === preset.id;
            return (
              <div
                key={preset.id}
                className={[
                  'kit-plate-card',
                  'kit-plate-card--interactive',
                  'room-preset-card',
                  disabled && !isBusy ? 'room-preset-card--disabled' : '',
                  isBusy ? 'room-preset-card--busy' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <button
                  type="button"
                  className="room-preset-card-btn"
                  disabled={disabled}
                  onClick={() => void handlePreset(preset)}
                  aria-label={`${preset.label}: ${preset.description}`}
                >
                  <Plate height={148} topCaption={`${preset.id}.plan`}>
                    <div className="app-ledger-plate-preview room-preset-preview">
                      <RoomPreview geometry={plan} items={[]} />
                    </div>
                  </Plate>
                  <div className="kit-plate-card__caption">
                    <div className="room-preset-card-copy">
                      <div className="kit-plate-card__name">{preset.label}</div>
                      <div className="kit-plate-card__author">{preset.description}</div>
                    </div>
                    <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                      {isBusy ? 'Creating…' : preset.dimensionsLabel}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}

          <div
            className={[
              'kit-plate-card',
              'kit-plate-card--interactive',
              'room-preset-card',
              'room-preset-card--custom',
              disabled && busyId !== 'custom' ? 'room-preset-card--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
          >
            <button
              type="button"
              className="room-preset-card-btn"
              disabled={disabled}
              onClick={handleCustom}
              aria-label="Customize your own floor plan"
            >
              <div className="room-preset-custom-plate" style={{ height: 148 }}>
                <span className="room-preset-custom-glyph" aria-hidden>
                  ✎
                </span>
                <span className="room-preset-custom-hint">Draw walls freely</span>
              </div>
              <div className="kit-plate-card__caption">
                <div className="room-preset-card-copy">
                  <div className="kit-plate-card__name">Customize your own</div>
                  <div className="kit-plate-card__author">
                    Start from a blank canvas and draw every wall yourself.
                  </div>
                </div>
                <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense room-preset-card-dims">
                  Custom
                </span>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {reviewTemplateId && reviewLines.length > 0 ? (
        <PurchaseReviewPanel
          lines={reviewLines}
          onClose={() => setReviewTemplateId(null)}
          onMarkDone={(productId, done) => {
            void addToList(productId);
            void markReviewDone(productId, done);
          }}
        />
      ) : null}
      {reviewTemplateId && reviewLines.length === 0 ? (
        <Modal
          open
          meta="Essentials"
          title="Essentials coming soon."
          onClose={() => setReviewTemplateId(null)}
          width={420}
          footer={
            <Button size="sm" onClick={() => setReviewTemplateId(null)}>
              Close
            </Button>
          }
        >
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--ink-4)' }}>
            We could not match the starter supplies to the live catalog yet. You can still use the
            room and edit furniture in the designer.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
