import {
  COMFORTER_COLORS,
  COMFORTER_PATTERNS,
  DEFAULT_COMFORTER_COLOR_ID,
  DEFAULT_COMFORTER_PATTERN_ID,
  DEFAULT_PILLOW_COLOR_ID,
  DEFAULT_PILLOW_PATTERN_ID,
  DEFAULT_SHEET_COLOR_ID,
  DEFAULT_SHEET_PATTERN_ID,
  PILLOW_COLORS,
  PILLOW_PATTERNS,
  PILLOW_SIZES,
  SHEET_COLORS,
  SHEET_PATTERNS,
} from '../lib/bedding/catalog';
import {
  createDefaultPillow,
  createDefaultPillows,
  resolveBeddingConfig,
} from '../lib/bedding/config';
import type { BeddingConfigPatch, BeddingPillow, PillowSizeId } from '../lib/bedding/types';
import { useStore } from '../store';
import { BeddingColorPicker } from './BeddingColorPicker';
import { GlassSurface } from './GlassSurface';
import { Button } from './kit/Button';
import { Checkbox } from './kit/Checkbox';
import { MonoMeta } from './kit/MonoMeta';
import { RangeControl } from './kit/RangeControl';
import { Select } from './kit/Select';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BeddingPanel({ open, onClose }: Props) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const setBeddingConfig = useStore((s) => s.setBeddingConfig);

  if (!item || item.kind !== 'bed') return null;

  const config = resolveBeddingConfig(item);

  const patch = (p: BeddingConfigPatch) => setBeddingConfig(item.id, p);

  const updatePillow = (pillowId: string, next: Partial<BeddingPillow>) => {
    patch({
      pillows: {
        items: config.pillows.items.map((p) =>
          p.id === pillowId ? { ...p, ...next } : p,
        ),
      },
    });
  };

  const removePillow = (pillowId: string) => {
    patch({
      pillows: {
        items: config.pillows.items.filter((p) => p.id !== pillowId),
      },
    });
  };

  const addPillow = () => {
    patch({
      pillows: {
        enabled: true,
        items: [...config.pillows.items, createDefaultPillow()],
      },
    });
  };

  return (
    <div
      className={`bedding-popup-wrap${open ? ' bedding-popup-wrap--open' : ''}`}
      aria-hidden={!open}
    >
      <aside
        className={`bedding-popup tv-scroll${open ? ' bedding-popup--open' : ''}`}
        aria-label="Bedding settings"
        aria-hidden={!open}
      >
        <GlassSurface as="div" className="bedding-popup__glass">
          <div className="designer-advanced-head">
            <div>
              <span className="designer-advanced-eyebrow">Bedding</span>
              <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 4 }}>
                {item.label}
              </MonoMeta>
            </div>
            <button
              type="button"
              className="designer-advanced-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="bedding-popup__body">
            <MonoMeta size="xs" tone="dense" upper className="bedding-popup__section-title">
              Layers
            </MonoMeta>

            <Checkbox
              checked={config.topper.enabled}
              label="Mattress Topper"
              onChange={(checked) => patch({ topper: { enabled: checked } })}
            />

            <div className="bedding-panel-block">
              <Checkbox
                checked={config.sheets.enabled}
                label="Bed Sheets"
                onChange={(checked) => patch({ sheets: { enabled: checked } })}
              />
              {config.sheets.enabled ? (
                <div className="bedding-panel-controls">
                  <BeddingColorPicker
                    label="Color"
                    colors={SHEET_COLORS}
                    value={config.sheets.colorId}
                    fallbackColorId={DEFAULT_SHEET_COLOR_ID}
                    onChange={(colorId) => patch({ sheets: { colorId } })}
                  />
                  <label className="bedding-panel-field">
                    <MonoMeta size="xs" tone="dense">Pattern</MonoMeta>
                    <Select
                      value={config.sheets.patternId}
                      options={SHEET_PATTERNS.map((p) => ({ value: p.id, label: p.label }))}
                      onChange={(value) => patch({ sheets: { patternId: value } })}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="bedding-panel-block">
              <Checkbox
                checked={config.comforter.enabled}
                label="Comforter"
                onChange={(checked) => patch({ comforter: { enabled: checked } })}
              />
              {config.comforter.enabled ? (
                <div className="bedding-panel-controls">
                  <BeddingColorPicker
                    label="Color"
                    colors={COMFORTER_COLORS}
                    value={config.comforter.colorId}
                    fallbackColorId={DEFAULT_COMFORTER_COLOR_ID}
                    onChange={(colorId) => patch({ comforter: { colorId } })}
                  />
                  <label className="bedding-panel-field">
                    <MonoMeta size="xs" tone="dense">Pattern</MonoMeta>
                    <Select
                      value={config.comforter.patternId}
                      options={COMFORTER_PATTERNS.map((p) => ({ value: p.id, label: p.label }))}
                      onChange={(value) => patch({ comforter: { patternId: value } })}
                    />
                  </label>
                  <RangeControl
                    label="Drape length"
                    value={config.comforter.drapeInches ?? 6}
                    min={3}
                    max={14}
                    step={0.5}
                    unit="″"
                    onChange={(v) => patch({ comforter: { drapeInches: v } })}
                  />
                </div>
              ) : null}
            </div>

            <div className="bedding-panel-block">
              <Checkbox
                checked={config.pillows.enabled}
                label="Pillows"
                onChange={(checked) => {
                  if (checked && config.pillows.items.length === 0) {
                    patch({
                      pillows: { enabled: true, items: createDefaultPillows(1) },
                    });
                  } else {
                    patch({ pillows: { enabled: checked } });
                  }
                }}
              />
              {config.pillows.enabled ? (
                <div className="bedding-panel-controls">
                  {config.pillows.items.map((pillow, index) => (
                    <div key={pillow.id} className="bedding-pillow-row">
                      <MonoMeta size="xs" tone="dense" upper>
                        Pillow {index + 1}
                      </MonoMeta>
                      <label className="bedding-panel-field">
                        <MonoMeta size="xs" tone="dense">Size</MonoMeta>
                        <Select
                          value={pillow.size}
                          options={(Object.keys(PILLOW_SIZES) as PillowSizeId[]).map((id) => ({
                            value: id,
                            label: PILLOW_SIZES[id].label,
                          }))}
                          onChange={(value) =>
                            updatePillow(pillow.id, { size: value as PillowSizeId })
                          }
                        />
                      </label>
                      <BeddingColorPicker
                        label="Color"
                        colors={PILLOW_COLORS}
                        value={pillow.colorId}
                        fallbackColorId={DEFAULT_PILLOW_COLOR_ID}
                        onChange={(colorId) => updatePillow(pillow.id, { colorId })}
                      />
                      <label className="bedding-panel-field">
                        <MonoMeta size="xs" tone="dense">Pattern</MonoMeta>
                        <Select
                          value={pillow.patternId}
                          options={PILLOW_PATTERNS.map((p) => ({ value: p.id, label: p.label }))}
                          onChange={(value) => updatePillow(pillow.id, { patternId: value })}
                        />
                      </label>
                      <RangeControl
                        label="Left / Right"
                        value={pillow.offsetX ?? 0}
                        min={-12}
                        max={12}
                        step={0.5}
                        unit="″"
                        onChange={(v) => updatePillow(pillow.id, { offsetX: v })}
                      />
                      <RangeControl
                        label="Head / Foot"
                        value={pillow.offsetZ ?? 0}
                        min={-18}
                        max={18}
                        step={0.5}
                        unit="″"
                        onChange={(v) => updatePillow(pillow.id, { offsetZ: v })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removePillow(pillow.id)}
                        disabled={config.pillows.items.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addPillow}>
                    Add pillow
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </GlassSurface>
      </aside>
    </div>
  );
}
