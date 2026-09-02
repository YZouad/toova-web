import {
  COMFORTER_COLORS,
  DEFAULT_COMFORTER_COLOR_ID,
  DEFAULT_PILLOW_COLOR_ID,
  DEFAULT_SHEET_COLOR_ID,
  PILLOW_COLORS,
  SHEET_COLORS,
} from '../../lib/bedding/catalog';
import {
  createDefaultPillow,
  createDefaultPillows,
  resolveBeddingConfig,
} from '../../lib/bedding/config';
import type { BeddingConfigPatch } from '../../lib/bedding/types';
import { DEFAULT_SHELF_COLOR, SHELF_COLOR_SWATCHES } from '../../furniture/registry';
import { DEFAULT_RUG_COLOR, isChecklistRug } from '../../lib/checklistPublicGlbs';
import { LED_PALETTE_PRESETS, palettePresetBackground } from '../../lib/hangingDecorGeometry';
import { proportionalSizesFromMaxSide } from '../../lib/uniformItemSize';
import { planBounds } from '../../lib/roomGeometry';
import { DEFAULT_EMITTER, useStore } from '../../store';
import type { InspectorTab } from './chromeTypes';
import { PanelSection } from './PanelShell';

export interface InspectorPanelProps {
  compact?: boolean;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  onClose: () => void;
}

function TabBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dg-tabs__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function InspectorPanel({ compact, tab, onTab, onClose }: InspectorPanelProps) {
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
      <aside className={compact ? 'dg-mobile-sheet dg-mobile-sheet--mid' : 'dg-sheet dg-sheet--inspect'}>
        {compact ? <div className="dg-mobile-sheet__handle" aria-hidden /> : null}
        <div className="dg-sheet-header">
          <div className="dg-sheet-header__copy">
            <div className="dg-sheet-header__title">No selection</div>
          </div>
          <button type="button" className="dg-sheet-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dg-sheet-body">
          <p style={{ font: '400 13px/1.5 var(--font-sans)', color: 'var(--ink-4)' }}>
            Click a piece to edit its size, finish, or lighting.
          </p>
        </div>
      </aside>
    );
  }

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

  const shellClass = compact
    ? 'dg-mobile-sheet dg-mobile-sheet--tall'
    : 'dg-sheet dg-sheet--inspect';

  return (
    <>
      {compact ? (
        <button type="button" className="dg-scrim" aria-label="Close inspector" onClick={onClose} />
      ) : null}
      <aside className={shellClass} role="dialog" aria-modal="true" aria-label={item.label}>
        {compact ? <div className="dg-mobile-sheet__handle" aria-hidden /> : null}

        <div className="dg-sheet-header" style={{ alignItems: 'center' }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              background: item.tintColor ?? '#C9B391',
              border: '1px solid rgba(36,31,25,0.15)',
              flex: 'none',
            }}
          />
          <div className="dg-sheet-header__copy">
            <div className="dg-sheet-header__title">{item.label}</div>
            <div className="dg-row__meta">{dims} · {item.kind}</div>
          </div>
          <button type="button" className="dg-sheet-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="dg-tabs" style={{ margin: '0 12px', borderRadius: 7 }}>
          {isFurniture ? (
            <>
              <TabBtn active={tab === 'fit'} label="Size & fit" onClick={() => onTab('fit')} />
              {isBed ? (
                <TabBtn active={tab === 'bedding'} label="Bedding" onClick={() => onTab('bedding')} />
              ) : null}
              <TabBtn active={tab === 'finish'} label="Finish" onClick={() => onTab('finish')} />
            </>
          ) : null}
          {isHanging ? (
            <>
              <TabBtn active={tab === 'path'} label="Path & sag" onClick={() => onTab('path')} />
              <TabBtn
                active={tab === 'bulbs'}
                label={
                  hang?.kind === 'leaves'
                    ? 'Leaves'
                    : hang?.kind === 'led-strip'
                      ? 'Colors'
                      : 'Bulbs'
                }
                onClick={() => onTab('bulbs')}
              />
            </>
          ) : null}
          {isLight ? (
            <TabBtn active={tab === 'light'} label="Light" onClick={() => onTab('light')} />
          ) : null}
        </div>

        <div className={compact ? 'dg-mobile-sheet__body' : 'dg-sheet-body'} style={{ paddingTop: 16 }}>
          {tab === 'fit' && isFurniture ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {canEditSize ? (
                <>
                  <PanelSection title="Dimensions" meta={`${dims}`}>
                    <div className="dg-dim-grid">
                      {(
                        [
                          { label: 'Width', axis: 0 as const },
                          { label: 'Height', axis: 1 as const },
                          { label: 'Depth', axis: 2 as const },
                        ] as const
                      ).map((dim) => (
                        <label key={dim.label} className="dg-dim-field">
                          <span className="dg-dim-field__label">{dim.label}</span>
                          <input
                            className="dg-dim-field__input"
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
                  </PanelSection>
                  <PanelSection title="Scale all" meta={`${Math.round(maxSide)}″`}>
                    <input
                      type="range"
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
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </PanelSection>
                </>
              ) : (
                <p className="dg-row__meta">Measuring model…</p>
              )}

              <PanelSection title="Rotation" meta={`${rotDeg}°`}>
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={15}
                  value={rotDeg}
                  onChange={(e) => updateRotation(item.id, (Number(e.target.value) * Math.PI) / 180)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </PanelSection>

              {isBed ? (
                <PanelSection title="Leg height" meta={`${item.bedLegHeight ?? 8}″`}>
                  <input
                    type="range"
                    min={4}
                    max={36}
                    step={1}
                    value={item.bedLegHeight ?? 8}
                    onChange={(e) => setBedHeight(item.id, Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </PanelSection>
              ) : (
                <PanelSection title="Height off floor" meta={`${Math.round(item.position[1])}″`}>
                  <input
                    type="range"
                    min={0}
                    max={maxElevation}
                    step={1}
                    value={Math.round(item.position[1])}
                    onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </PanelSection>
              )}

              <div
                className="dg-row dg-row--between"
                style={{
                  padding: 12,
                  background: 'var(--paper-1)',
                  border: '1px solid var(--rule-soft)',
                  borderRadius: 9,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="dg-row__label">Mount on wall</span>
                  <span style={{ font: '400 11px/1.3 var(--font-sans)', color: 'var(--ink-4)' }}>
                    Sticks to the nearest wall as you drag
                  </span>
                </div>
                <button
                  type="button"
                  className={`dg-toggle${item.wallMounted ? ' is-on' : ''}`}
                  aria-pressed={!!item.wallMounted}
                  onClick={() => setWallMounted(item.id, !item.wallMounted)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'bedding' && isBed ? (
            <BeddingTab
              itemId={item.id}
              patch={(p) => setBeddingConfig(item.id, p)}
              config={resolveBeddingConfig(item)}
            />
          ) : null}

          {tab === 'finish' && isFurniture ? (
            <FinishTab
              item={item}
              onTint={(hex) => setTintColor(item.id, hex)}
            />
          ) : null}

          {tab === 'path' && isHanging && hang ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                className="dg-row dg-row--between"
                style={{
                  padding: '11px 12px',
                  background: 'var(--paper-1)',
                  border: '1px solid var(--rule-soft)',
                  borderRadius: 9,
                }}
              >
                <span style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--ink-4)' }}>
                  {hang.anchors.length} anchors · {hang.kind}
                </span>
                <button
                  type="button"
                  className="dg-footer-btn"
                  style={{ minHeight: 32, padding: '8px 11px' }}
                  onClick={() => {
                    beginHangingDraft(hang.kind);
                    onClose();
                  }}
                >
                  Redraw
                </button>
              </div>
              {hang.kind !== 'led-strip' ? (
                <PanelSection title="Sag" meta={`${Math.round(hang.sag * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    step={1}
                    value={Math.round(hang.sag * 100)}
                    onChange={(e) => setHangingConfig(item.id, { sag: Number(e.target.value) / 100 })}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </PanelSection>
              ) : null}
            </div>
          ) : null}

          {tab === 'bulbs' && isHanging && hang ? (
            hang.kind === 'lights' || hang.kind === 'led-strip' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <PanelSection
                  title={hang.kind === 'led-strip' ? 'LED spacing' : 'Bulb spacing'}
                  meta={`${hang.density.toFixed(1)}″`}
                >
                  <input
                    type="range"
                    min={2}
                    max={18}
                    step={0.5}
                    value={hang.density}
                    onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </PanelSection>
                <PanelSection title="Brightness" meta={hang.lightIntensity.toFixed(1)}>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.1}
                    value={hang.lightIntensity}
                    onChange={(e) =>
                      setHangingConfig(item.id, { lightIntensity: Number(e.target.value) })
                    }
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </PanelSection>
                <PanelSection title="Colors">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {LED_PALETTE_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        title={p.label}
                        aria-label={p.label}
                        onClick={() => setHangingConfig(item.id, { palette: [...p.colors] })}
                        style={{
                          flex: '1 1 72px',
                          height: 30,
                          border: '1px solid var(--rule-hair)',
                          borderRadius: 7,
                          overflow: 'hidden',
                          padding: 0,
                          cursor: 'pointer',
                          background: palettePresetBackground(p.colors),
                        }}
                      />
                    ))}
                  </div>
                </PanelSection>
              </div>
            ) : (
              <PanelSection title="Fullness" meta={`${hang.density.toFixed(2)}×`}>
                <input
                  type="range"
                  min={0.4}
                  max={2}
                  step={0.05}
                  value={hang.density}
                  onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </PanelSection>
            )
          ) : null}

          {tab === 'light' && isLight ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <PanelSection title="Height off floor" meta={`${Math.round(item.position[1])}″`}>
                <input
                  type="range"
                  min={0}
                  max={maxElevation}
                  step={1}
                  value={Math.round(item.position[1])}
                  onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </PanelSection>
              <PanelSection title="Brightness" meta={(emitter.intensity ?? 2.2).toFixed(1)}>
                <input
                  type="range"
                  min={0.2}
                  max={10}
                  step={0.1}
                  value={emitter.intensity ?? DEFAULT_EMITTER.intensity}
                  onChange={(e) =>
                    setEmitterConfig(item.id, { intensity: Number(e.target.value), enabled: true })
                  }
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </PanelSection>
              <PanelSection title="Range" meta={`${Math.round(emitter.range ?? 120)}″`}>
                <input
                  type="range"
                  min={24}
                  max={280}
                  step={4}
                  value={emitter.range ?? DEFAULT_EMITTER.range}
                  onChange={(e) =>
                    setEmitterConfig(item.id, { range: Number(e.target.value), enabled: true })
                  }
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </PanelSection>
              <PanelSection title="Color">
                <div className="dg-swatch-grid">
                  {['#FFF4E0', '#FFD9A0', '#FFFFFF', '#CFE0FF'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`dg-swatch${(emitter.color ?? '').toLowerCase() === c.toLowerCase() ? ' is-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setEmitterConfig(item.id, { color: c, enabled: true })}
                    />
                  ))}
                  <input
                    type="color"
                    value={emitter.color ?? DEFAULT_EMITTER.color}
                    onChange={(e) =>
                      setEmitterConfig(item.id, { color: e.target.value, enabled: true })
                    }
                    aria-label="Custom light color"
                    style={{ width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
                  />
                </div>
              </PanelSection>
            </div>
          ) : null}
        </div>

        <div className="dg-sheet-footer">
          <button
            type="button"
            className="dg-footer-btn"
            style={{ flex: 1 }}
            onClick={() => duplicateItem(item.id)}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="dg-footer-btn"
            style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}
            onClick={() => {
              removeItem(item.id);
              onClose();
            }}
          >
            Remove
          </button>
        </div>
      </aside>
    </>
  );
}

function BeddingTab({
  itemId: _itemId,
  config,
  patch,
}: {
  itemId: string;
  config: ReturnType<typeof resolveBeddingConfig>;
  patch: (p: BeddingConfigPatch) => void;
}) {
  void _itemId;
  const colorList = (colors: typeof SHEET_COLORS, value: string, onPick: (id: string) => void) => (
    <div className="dg-swatch-grid">
      {colors.slice(0, 8).map((c) => (
        <button
          key={c.id}
          type="button"
          className={`dg-swatch${value === c.id ? ' is-active' : ''}`}
          style={{ background: c.hex }}
          title={c.label}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PanelSection title="Sheets">
        <label className="dg-row" style={{ padding: 0 }}>
          <input
            type="checkbox"
            checked={config.sheets.enabled}
            onChange={(e) => patch({ sheets: { enabled: e.target.checked } })}
          />
          <span className="dg-row__label">Enabled</span>
        </label>
        {config.sheets.enabled
          ? colorList(SHEET_COLORS, config.sheets.colorId || DEFAULT_SHEET_COLOR_ID, (colorId) =>
              patch({ sheets: { colorId } }),
            )
          : null}
      </PanelSection>

      <PanelSection title="Comforter / duvet">
        <label className="dg-row" style={{ padding: 0 }}>
          <input
            type="checkbox"
            checked={config.comforter.enabled}
            onChange={(e) => patch({ comforter: { enabled: e.target.checked } })}
          />
          <span className="dg-row__label">Enabled</span>
        </label>
        {config.comforter.enabled
          ? colorList(
              COMFORTER_COLORS,
              config.comforter.colorId || DEFAULT_COMFORTER_COLOR_ID,
              (colorId) => patch({ comforter: { colorId } }),
            )
          : null}
      </PanelSection>

      <PanelSection title="Pillows" meta={String(config.pillows.items.length)}>
        <label className="dg-row" style={{ padding: 0 }}>
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
          <span className="dg-row__label">Enabled</span>
        </label>
        {config.pillows.enabled ? (
          <>
            <div className="dg-context-stepper" style={{ marginTop: 8 }}>
              <button
                type="button"
                aria-label="Fewer pillows"
                disabled={config.pillows.items.length <= 1}
                onClick={() =>
                  patch({
                    pillows: {
                      items: config.pillows.items.slice(0, -1),
                    },
                  })
                }
              >
                −
              </button>
              <span className="dg-context-stepper__value">{config.pillows.items.length}</span>
              <button
                type="button"
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
              ? colorList(
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
      </PanelSection>
    </div>
  );
}

function FinishTab({
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
      <div
        style={{
          padding: '11px 12px',
          background: 'var(--paper-1)',
          border: '1px solid var(--rule-soft)',
          borderRadius: 9,
          font: '400 12px/1.5 var(--font-sans)',
          color: 'var(--ink-4)',
        }}
      >
        Finish options depend on the piece. Built-in furniture keeps its materials.
      </div>
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
    <PanelSection title="Frame color">
      <div className="dg-swatch-grid">
        {swatches.map((s) => (
          <button
            key={s.color}
            type="button"
            className={`dg-swatch${current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
            style={{ background: s.color }}
            title={s.label}
            onClick={() => onTint(s.color)}
          />
        ))}
        <input
          type="color"
          value={current.length === 7 ? current : '#a98662'}
          onChange={(e) => onTint(e.target.value)}
          aria-label="Custom tint"
          style={{ width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
        />
      </div>
      {item.kind === 'imported' && !isRug ? (
        <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--ink-4)', margin: '8px 0 0' }}>
          Imported models keep their own materials; tint multiplies the mesh color.
        </p>
      ) : null}
    </PanelSection>
  );
}
