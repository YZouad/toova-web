import {
  DEFAULT_HEADBOARD_COLOR,
  headboardHeightIn,
  headboardWidthScale,
  MAX_HEADBOARD_HEIGHT_IN,
  MAX_HEADBOARD_WIDTH_SCALE,
  MIN_HEADBOARD_HEIGHT_IN,
  MIN_HEADBOARD_WIDTH_SCALE,
  resolveHeadboardColor,
} from '../../lib/bedHeadboard';
import { defaultFinishColor, FURNITURE_FINISH_SWATCHES } from '../../lib/furnitureFinish';
import { useFurnitureFinish } from '../../furniture/useFurnitureFinish';
import type { Item } from '../../store';
import { useStore } from '../../store';
import { PanelSection } from './PanelShell';

export function HeadboardEditor({ item, compact }: { item: Item; compact?: boolean }) {
  const setHeadboardEnabled = useStore((s) => s.setHeadboardEnabled);
  const setHeadboardColor = useStore((s) => s.setHeadboardColor);
  const setHeadboardHeight = useStore((s) => s.setHeadboardHeight);
  const setHeadboardWidthScale = useStore((s) => s.setHeadboardWidthScale);

  const finish = useFurnitureFinish(item, defaultFinishColor('bed'));
  const color = resolveHeadboardColor(item, finish.color);
  const height = headboardHeightIn(item);
  const widthPct = Math.round(headboardWidthScale(item) * 100);

  const swatchGrid = compact ? 'dgm-swatch-row' : 'dg-swatch-grid';
  const swatchBtn = compact ? 'dgm-swatch' : 'dg-swatch';

  const colorSwatches = (
    <div className={swatchGrid}>
      {FURNITURE_FINISH_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${swatchBtn}${color.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          onClick={() => setHeadboardColor(item.id, s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : undefined}
        value={color.length === 7 ? color : DEFAULT_HEADBOARD_COLOR}
        onChange={(e) => setHeadboardColor(item.id, e.target.value)}
        aria-label="Headboard color"
        style={
          compact
            ? undefined
            : { width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }
        }
      />
    </div>
  );

  const sliders = (
    <>
      <PanelSection title="Height" meta={`${height}″`}>
        <input
          type="range"
          className={compact ? 'dgm-range' : undefined}
          min={MIN_HEADBOARD_HEIGHT_IN}
          max={MAX_HEADBOARD_HEIGHT_IN}
          step={1}
          value={height}
          onChange={(e) => setHeadboardHeight(item.id, Number(e.target.value))}
          style={compact ? undefined : { width: '100%', accentColor: 'var(--accent)' }}
          aria-label="Headboard height"
        />
      </PanelSection>
      <PanelSection title="Width" meta={`${widthPct}% of bed`}>
        <input
          type="range"
          className={compact ? 'dgm-range' : undefined}
          min={MIN_HEADBOARD_WIDTH_SCALE * 100}
          max={MAX_HEADBOARD_WIDTH_SCALE * 100}
          step={5}
          value={widthPct}
          onChange={(e) => setHeadboardWidthScale(item.id, Number(e.target.value) / 100)}
          style={compact ? undefined : { width: '100%', accentColor: 'var(--accent)' }}
          aria-label="Headboard width"
        />
      </PanelSection>
    </>
  );

  if (compact) {
    return (
      <section className="dgm-section">
        <label className="dgm-check-row">
          <input
            type="checkbox"
            checked={!!item.headboardEnabled}
            onChange={(e) => setHeadboardEnabled(item.id, e.target.checked)}
          />
          <span className="dgm-section-title">Headboard</span>
        </label>
        {item.headboardEnabled ? (
          <div className="dgm-stack" style={{ marginTop: 10 }}>
            {colorSwatches}
            <div className="dgm-section-head">
              <h3 className="dgm-section-title">Height</h3>
              <span className="dgm-section-meta">{height}″</span>
            </div>
            <input
              type="range"
              className="dgm-range"
              min={MIN_HEADBOARD_HEIGHT_IN}
              max={MAX_HEADBOARD_HEIGHT_IN}
              step={1}
              value={height}
              onChange={(e) => setHeadboardHeight(item.id, Number(e.target.value))}
              aria-label="Headboard height"
            />
            <div className="dgm-section-head">
              <h3 className="dgm-section-title">Width</h3>
              <span className="dgm-section-meta">{widthPct}%</span>
            </div>
            <input
              type="range"
              className="dgm-range"
              min={MIN_HEADBOARD_WIDTH_SCALE * 100}
              max={MAX_HEADBOARD_WIDTH_SCALE * 100}
              step={5}
              value={widthPct}
              onChange={(e) => setHeadboardWidthScale(item.id, Number(e.target.value) / 100)}
              aria-label="Headboard width"
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <PanelSection title="Headboard">
      <label className="dg-row" style={{ padding: 0, marginBottom: item.headboardEnabled ? 10 : 0 }}>
        <input
          type="checkbox"
          checked={!!item.headboardEnabled}
          onChange={(e) => setHeadboardEnabled(item.id, e.target.checked)}
        />
        <span className="dg-row__label">Show headboard at the head of the bed</span>
      </label>
      {item.headboardEnabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {colorSwatches}
          {sliders}
        </div>
      ) : null}
    </PanelSection>
  );
}
