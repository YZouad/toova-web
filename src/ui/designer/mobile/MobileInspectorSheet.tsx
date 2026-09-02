import {
  COMFORTER_COLORS,
  DEFAULT_COMFORTER_COLOR_ID,
  DEFAULT_PILLOW_COLOR_ID,
  DEFAULT_SHEET_COLOR_ID,
  PILLOW_COLORS,
  SHEET_COLORS,
} from '../../../lib/bedding/catalog';
import {
  createDefaultPillow,
  createDefaultPillows,
  resolveBeddingConfig,
} from '../../../lib/bedding/config';
import type { BeddingConfigPatch } from '../../../lib/bedding/types';
import { DEFAULT_SHELF_COLOR, SHELF_COLOR_SWATCHES } from '../../../furniture/registry';
import { DEFAULT_RUG_COLOR, isChecklistRug } from '../../../lib/checklistPublicGlbs';
import { LED_PALETTE_PRESETS, palettePresetBackground } from '../../../lib/hangingDecorGeometry';
import { proportionalSizesFromMaxSide } from '../../../lib/uniformItemSize';
import { planBounds } from '../../../lib/roomGeometry';
import { DEFAULT_EMITTER, useStore } from '../../../store';
import type { InspectorTab } from '../chromeTypes';
import { inspectorTabsForKind } from '../inspectorTabs';
import { MobileSheet } from './MobileSheet';

export interface MobileInspectorSheetProps {
  onClose: () => void;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
}

const TAB_LABELS: Record<InspectorTab, string> = {
  fit: 'Size & fit',
  bedding: 'Bedding',
  finish: 'Finish',
  path: 'Path & sag',
  bulbs: 'Bulbs',
  light: 'Light',
};

export function MobileInspectorSheet({ onClose, tab, onTab }: MobileInspectorSheetProps) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomGeometry = useStore((s) => s.roomGeometry);
  const updateRotation = useStore((s) => s.updateRotation);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const setWallMounted = useStore((s) => s.setWallMounted);
  const setBedHeight = useStore((s) => s.setBedHeight);
  const setTintColor = useStore((s) => s.setTintColor);
  const setBeddingConfig = useStore((s) => s.setBeddingConfig);
  const setHangingConfig = useStore((s) => s.setHangingConfig);
  const setEmitterConfig = useStore((s) => s.setEmitterConfig);
  const beginHangingDraft = useStore((s) => s.beginHangingDraft);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);

  if (!item) {
    return (
      <MobileSheet kind="inspect" title="No selection" onClose={onClose}>
        <p className="dgm-empty__hint">Tap a piece to edit its size, finish, or lighting.</p>
      </MobileSheet>
    );
  }

  const tabs = inspectorTabsForKind(item.kind);
  const isHanging = item.kind === 'hanging';
  const isLight = item.kind === 'light';
  const isBed = item.kind === 'bed';
  const isFurniture = !isHanging && !isLight;
  const rotDeg = Math.round((((item.rotationY * 180) / Math.PI) % 360 + 360) % 360);
  const dims = `${Math.round(item.size[0])}×${Math.round(item.size[2])}×${Math.round(item.size[1])}″`;
  const maxElevation = Math.max(0, roomGeometry.height - item.size[1]);
  const maxFootprint = Math.max(planBounds(roomGeometry).width, planBounds(roomGeometry).depth, 200);
  const maxSide = Math.max(item.size[0], item.size[1], item.size[2]);
  const canEditSize = item.kind !== 'imported' || !!item.importedNaturalSize;
  const emitter = item.emitter ?? DEFAULT_EMITTER;
  const hang = item.hanging;
  const bulbTabLabel =
    hang?.kind === 'leaves' ? 'Leaves' : hang?.kind === 'led-strip' ? 'Colors' : 'Bulbs';

  return (
    <MobileSheet
      kind="inspect"
      title={item.label?.trim() || item.kind}
      onClose={onClose}
      headerEnd={<span className="dgm-sheet-count">{dims}</span>}
    >
      <div className="dgm-tab-row" role="tablist" aria-label="Inspector">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`dgm-tab-btn${tab === t ? ' is-active' : ''}`}
            onClick={() => onTab(t)}
          >
            {t === 'bulbs' ? bulbTabLabel : TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="dgm-inspector-body">
        {tab === 'fit' && isFurniture ? (
          <div className="dgm-stack">
            {canEditSize ? (
              <>
                <section className="dgm-section">
                  <div className="dgm-section-head">
                    <h3 className="dgm-section-title">Scale</h3>
                    <span className="dgm-section-meta">{Math.round(maxSide)}″</span>
                  </div>
                  <input
                    type="range"
                    className="dgm-range"
                    min={4}
                    max={maxFootprint}
                    step={0.5}
                    value={maxSide}
                    onChange={(e) =>
                      setItemSize(
                        item.id,
                        proportionalSizesFromMaxSide(item.size, Number(e.target.value)),
                      )
                    }
                    aria-label="Scale all dimensions"
                  />
                </section>
                <section className="dgm-section">
                  <div className="dgm-section-head">
                    <h3 className="dgm-section-title">Dimensions</h3>
                    <span className="dgm-section-meta">{dims}</span>
                  </div>
                  <div className="dgm-dim-grid">
                    {(
                      [
                        { label: 'Width', axis: 0 as const },
                        { label: 'Height', axis: 1 as const },
                        { label: 'Depth', axis: 2 as const },
                      ] as const
                    ).map((dim) => (
                      <label key={dim.label} className="dgm-dim-field">
                        <span className="dgm-dim-field__label">{dim.label}</span>
                        <input
                          className="dgm-dim-field__input"
                          type="number"
                          min={1}
                          max={dim.axis === 1 ? roomGeometry.height : maxFootprint}
                          step={0.5}
                          value={Math.round(item.size[dim.axis] * 10) / 10}
                          aria-label={`${dim.label} in inches`}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n) || n <= 0) return;
                            const next: [number, number, number] = [
                              item.size[0],
                              item.size[1],
                              item.size[2],
                            ];
                            next[dim.axis] = n;
                            setItemSize(item.id, next);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <p className="dgm-empty__hint">Measuring model…</p>
            )}

            <section className="dgm-section">
              <div className="dgm-section-head">
                <h3 className="dgm-section-title">Rotation</h3>
                <span className="dgm-section-meta">{rotDeg}°</span>
              </div>
              <input
                type="range"
                className="dgm-range"
                min={0}
                max={359}
                step={15}
                value={rotDeg}
                onChange={(e) => updateRotation(item.id, (Number(e.target.value) * Math.PI) / 180)}
                aria-label="Rotation"
              />
            </section>

            {isBed ? (
              <section className="dgm-section">
                <div className="dgm-section-head">
                  <h3 className="dgm-section-title">Leg height</h3>
                  <span className="dgm-section-meta">{item.bedLegHeight ?? 8}″</span>
                </div>
                <input
                  type="range"
                  className="dgm-range"
                  min={4}
                  max={36}
                  step={1}
                  value={item.bedLegHeight ?? 8}
                  onChange={(e) => setBedHeight(item.id, Number(e.target.value))}
                  aria-label="Leg height"
                />
              </section>
            ) : (
              <section className="dgm-section">
                <div className="dgm-section-head">
                  <h3 className="dgm-section-title">Height off floor</h3>
                  <span className="dgm-section-meta">{Math.round(item.position[1])}″</span>
                </div>
                <input
                  type="range"
                  className="dgm-range"
                  min={0}
                  max={maxElevation}
                  step={1}
                  value={Math.round(item.position[1])}
                  onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                  aria-label="Height off floor"
                />
              </section>
            )}

            <div className="dgm-toggle-card">
              <span className="dgm-toggle-card__copy">
                <span className="dgm-toggle-card__title">Mount on wall</span>
                <span className="dgm-toggle-card__hint">Sticks to the nearest wall as you drag</span>
              </span>
              <button
                type="button"
                className={`dgm-toggle${item.wallMounted ? ' is-on' : ''}`}
                aria-pressed={!!item.wallMounted}
                aria-label="Mount on wall"
                onClick={() => setWallMounted(item.id, !item.wallMounted)}
              />
            </div>
          </div>
        ) : null}

        {tab === 'bedding' && isBed ? (
          <MobileBeddingTab
            config={resolveBeddingConfig(item)}
            patch={(p) => setBeddingConfig(item.id, p)}
          />
        ) : null}

        {tab === 'finish' && isFurniture ? (
          <MobileFinishTab item={item} onTint={(hex) => setTintColor(item.id, hex)} />
        ) : null}

        {tab === 'path' && isHanging && hang ? (
          <div className="dgm-stack">
            <div className="dgm-path-banner">
              <span className="dgm-path-banner__meta">
                {hang.anchors.length} anchors · {hang.kind}
              </span>
              <button
                type="button"
                className="dgm-action-btn"
                onClick={() => {
                  beginHangingDraft(hang.kind);
                  onClose();
                }}
              >
                Redraw
              </button>
            </div>
            {hang.kind !== 'led-strip' ? (
              <section className="dgm-section">
                <div className="dgm-section-head">
                  <h3 className="dgm-section-title">Sag</h3>
                  <span className="dgm-section-meta">{Math.round(hang.sag * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="dgm-range"
                  min={0}
                  max={45}
                  step={1}
                  value={Math.round(hang.sag * 100)}
                  onChange={(e) => setHangingConfig(item.id, { sag: Number(e.target.value) / 100 })}
                  aria-label="Sag"
                />
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'bulbs' && isHanging && hang ? (
          hang.kind === 'lights' || hang.kind === 'led-strip' ? (
            <div className="dgm-stack">
              <section className="dgm-section">
                <div className="dgm-section-head">
                  <h3 className="dgm-section-title">
                    {hang.kind === 'led-strip' ? 'LED spacing' : 'Bulb spacing'}
                  </h3>
                  <span className="dgm-section-meta">{hang.density.toFixed(1)}″</span>
                </div>
                <input
                  type="range"
                  className="dgm-range"
                  min={2}
                  max={18}
                  step={0.5}
                  value={hang.density}
                  onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
                  aria-label="Bulb spacing"
                />
              </section>
              <section className="dgm-section">
                <div className="dgm-section-head">
                  <h3 className="dgm-section-title">Brightness</h3>
                  <span className="dgm-section-meta">{hang.lightIntensity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  className="dgm-range"
                  min={0.2}
                  max={3}
                  step={0.1}
                  value={hang.lightIntensity}
                  onChange={(e) =>
                    setHangingConfig(item.id, { lightIntensity: Number(e.target.value) })
                  }
                  aria-label="String brightness"
                />
              </section>
              <section className="dgm-section">
                <h3 className="dgm-section-title">Colors</h3>
                <div className="dgm-palette-row">
                  {LED_PALETTE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="dgm-palette-btn"
                      title={p.label}
                      aria-label={p.label}
                      style={{ background: palettePresetBackground(p.colors) }}
                      onClick={() => setHangingConfig(item.id, { palette: [...p.colors] })}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <section className="dgm-section">
              <div className="dgm-section-head">
                <h3 className="dgm-section-title">Fullness</h3>
                <span className="dgm-section-meta">{hang.density.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                className="dgm-range"
                min={0.4}
                max={2}
                step={0.05}
                value={hang.density}
                onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
                aria-label="Leaf fullness"
              />
            </section>
          )
        ) : null}

        {tab === 'light' && isLight ? (
          <div className="dgm-stack">
            <section className="dgm-section">
              <div className="dgm-section-head">
                <h3 className="dgm-section-title">Height off floor</h3>
                <span className="dgm-section-meta">{Math.round(item.position[1])}″</span>
              </div>
              <input
                type="range"
                className="dgm-range"
                min={0}
                max={maxElevation}
                step={1}
                value={Math.round(item.position[1])}
                onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                aria-label="Height off floor"
              />
            </section>
            <section className="dgm-section">
              <div className="dgm-section-head">
                <h3 className="dgm-section-title">Brightness</h3>
                <span className="dgm-section-meta">{(emitter.intensity ?? 2.2).toFixed(1)}</span>
              </div>
              <input
                type="range"
                className="dgm-range"
                min={0.2}
                max={10}
                step={0.1}
                value={emitter.intensity ?? DEFAULT_EMITTER.intensity}
                onChange={(e) =>
                  setEmitterConfig(item.id, { intensity: Number(e.target.value), enabled: true })
                }
                aria-label="Light brightness"
              />
            </section>
            <section className="dgm-section">
              <div className="dgm-section-head">
                <h3 className="dgm-section-title">Range</h3>
                <span className="dgm-section-meta">{Math.round(emitter.range ?? 120)}″</span>
              </div>
              <input
                type="range"
                className="dgm-range"
                min={24}
                max={280}
                step={4}
                value={emitter.range ?? DEFAULT_EMITTER.range}
                onChange={(e) =>
                  setEmitterConfig(item.id, { range: Number(e.target.value), enabled: true })
                }
                aria-label="Light range"
              />
            </section>
            <section className="dgm-section">
              <h3 className="dgm-section-title">Color</h3>
              <div className="dgm-swatch-row">
                {['#FFF4E0', '#FFD9A0', '#FFFFFF', '#CFE0FF'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`dgm-swatch${(emitter.color ?? '').toLowerCase() === c.toLowerCase() ? ' is-active' : ''}`}
                    style={{ background: c }}
                    aria-label={`Light color ${c}`}
                    onClick={() => setEmitterConfig(item.id, { color: c, enabled: true })}
                  />
                ))}
                <input
                  type="color"
                  className="dgm-color-input"
                  value={emitter.color ?? DEFAULT_EMITTER.color}
                  onChange={(e) =>
                    setEmitterConfig(item.id, { color: e.target.value, enabled: true })
                  }
                  aria-label="Custom light color"
                />
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <div className="dgm-inspector-foot">
        <button type="button" className="dgm-action-btn" onClick={() => duplicateItem(item.id)}>
          Duplicate
        </button>
        <button
          type="button"
          className="dgm-action-btn is-danger"
          onClick={() => {
            removeItem(item.id);
            onClose();
          }}
        >
          Remove
        </button>
      </div>
    </MobileSheet>
  );
}

function MobileBeddingTab({
  config,
  patch,
}: {
  config: ReturnType<typeof resolveBeddingConfig>;
  patch: (p: BeddingConfigPatch) => void;
}) {
  const colorRow = (
    colors: typeof SHEET_COLORS,
    value: string,
    onPick: (id: string) => void,
  ) => (
    <div className="dgm-swatch-row">
      {colors.slice(0, 8).map((c) => (
        <button
          key={c.id}
          type="button"
          className={`dgm-swatch${value === c.id ? ' is-active' : ''}`}
          style={{ background: c.hex }}
          title={c.label}
          aria-label={c.label}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );

  return (
    <div className="dgm-stack">
      <section className="dgm-section">
        <label className="dgm-check-row">
          <input
            type="checkbox"
            checked={config.sheets.enabled}
            onChange={(e) => patch({ sheets: { enabled: e.target.checked } })}
          />
          <span className="dgm-section-title">Sheets</span>
        </label>
        {config.sheets.enabled
          ? colorRow(SHEET_COLORS, config.sheets.colorId || DEFAULT_SHEET_COLOR_ID, (colorId) =>
              patch({ sheets: { colorId } }),
            )
          : null}
      </section>

      <section className="dgm-section">
        <label className="dgm-check-row">
          <input
            type="checkbox"
            checked={config.comforter.enabled}
            onChange={(e) => patch({ comforter: { enabled: e.target.checked } })}
          />
          <span className="dgm-section-title">Comforter / duvet</span>
        </label>
        {config.comforter.enabled
          ? colorRow(
              COMFORTER_COLORS,
              config.comforter.colorId || DEFAULT_COMFORTER_COLOR_ID,
              (colorId) => patch({ comforter: { colorId } }),
            )
          : null}
      </section>

      <section className="dgm-section">
        <div className="dgm-section-head">
          <label className="dgm-check-row">
            <input
              type="checkbox"
              checked={config.pillows.enabled}
              onChange={(e) => {
                if (e.target.checked && config.pillows.items.length === 0) {
                  patch({ pillows: { enabled: true, items: createDefaultPillows(1) } });
                } else {
                  patch({ pillows: { enabled: e.target.checked } });
                }
              }}
            />
            <span className="dgm-section-title">Pillows</span>
          </label>
        </div>
        {config.pillows.enabled ? (
          <>
            <div className="dgm-stepper">
              <button
                type="button"
                className="dgm-stepper__btn"
                aria-label="Fewer pillows"
                disabled={config.pillows.items.length <= 1}
                onClick={() =>
                  patch({
                    pillows: { items: config.pillows.items.slice(0, -1) },
                  })
                }
              >
                −
              </button>
              <span className="dgm-stepper__value">{config.pillows.items.length}</span>
              <button
                type="button"
                className="dgm-stepper__btn"
                aria-label="More pillows"
                onClick={() =>
                  patch({
                    pillows: {
                      enabled: true,
                      items: [...config.pillows.items, createDefaultPillow()],
                    },
                  })
                }
              >
                +
              </button>
            </div>
            {config.pillows.items[0]
              ? colorRow(
                  PILLOW_COLORS,
                  config.pillows.items[0].colorId || DEFAULT_PILLOW_COLOR_ID,
                  (colorId) =>
                    patch({
                      pillows: {
                        items: config.pillows.items.map((p, i) =>
                          i === 0 ? { ...p, colorId } : p,
                        ),
                      },
                    }),
                )
              : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

function MobileFinishTab({
  item,
  onTint,
}: {
  item: NonNullable<ReturnType<typeof useStore.getState>['items'][string]>;
  onTint: (hex: string) => void;
}) {
  const isShelf = item.kind === 'shelf';
  const isRug = item.kind === 'imported' && isChecklistRug(item);
  const canTint = isShelf || isRug || item.kind === 'imported';

  if (!canTint) {
    return (
      <p className="dgm-note">
        Finish options depend on the piece. Built-in furniture keeps its materials.
      </p>
    );
  }

  const swatches = isShelf
    ? SHELF_COLOR_SWATCHES
    : [
        { label: 'Natural', color: DEFAULT_RUG_COLOR },
        { label: 'Sage', color: '#6b7f6a' },
        { label: 'Terracotta', color: '#C98A6B' },
        { label: 'Charcoal', color: '#3a3a3a' },
        { label: 'Cream', color: '#FBF7F0' },
      ];
  const current = item.tintColor ?? (isShelf ? DEFAULT_SHELF_COLOR : DEFAULT_RUG_COLOR);

  return (
    <section className="dgm-section">
      <h3 className="dgm-section-title">Frame color</h3>
      <div className="dgm-swatch-row">
        {swatches.map((s) => (
          <button
            key={s.color}
            type="button"
            className={`dgm-swatch${current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
            style={{ background: s.color }}
            title={s.label}
            aria-label={s.label}
            onClick={() => onTint(s.color)}
          />
        ))}
        <input
          type="color"
          className="dgm-color-input"
          value={current.length === 7 ? current : '#a98662'}
          onChange={(e) => onTint(e.target.value)}
          aria-label="Custom tint"
        />
      </div>
      {item.kind === 'imported' && !isRug ? (
        <p className="dgm-note">Imported models keep their own materials; tint multiplies the mesh color.</p>
      ) : null}
    </section>
  );
}
