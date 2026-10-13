import type { WindowCurtains } from '../../lib/floorPlanGeometry';
import {
  CURTAIN_COLOR_SWATCHES,
  DEFAULT_WINDOW_CURTAINS,
} from '../../lib/windowCurtainDefaults';
import { PanelSection } from './PanelShell';

export function WindowCurtainEditor({
  openingId,
  curtains,
  onChange,
  variant = 'designer',
}: {
  openingId: string;
  curtains: WindowCurtains | undefined;
  onChange: (curtains: WindowCurtains | undefined) => void;
  variant?: 'floor-plan' | 'designer';
}) {
  const isFp = variant === 'floor-plan';

  const toggle = (
    <div className={isFp ? 'fp-field-row' : 'dg-chip-row'}>
      <button
        type="button"
        className={isFp ? `fp-chip${curtains ? ' active' : ''}` : `dg-chip${curtains ? ' is-active' : ''}`}
        aria-pressed={!!curtains}
        onClick={() => onChange(curtains ? undefined : DEFAULT_WINDOW_CURTAINS)}
      >
        {curtains ? 'On' : 'Off'}
      </button>
    </div>
  );

  const swatches = curtains ? (
    <div className={isFp ? 'fp-curtain-swatches' : 'dg-swatch-grid'}>
      {CURTAIN_COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch.color}
          type="button"
          className={
            isFp
              ? `fp-curtain-swatch${curtains.color.toLowerCase() === swatch.color.toLowerCase() ? ' active' : ''}`
              : `dg-swatch${curtains.color.toLowerCase() === swatch.color.toLowerCase() ? ' is-active' : ''}`
          }
          style={{ background: swatch.color }}
          title={swatch.label}
          aria-label={swatch.label}
          aria-pressed={curtains.color.toLowerCase() === swatch.color.toLowerCase()}
          onClick={() => onChange({ ...curtains, color: swatch.color })}
        />
      ))}
      <input
        type="color"
        className={isFp ? 'fp-curtain-color-input' : 'dg-color-input'}
        value={curtains.color}
        aria-label="Custom curtain color"
        onChange={(e) => onChange({ ...curtains, color: e.target.value })}
      />
    </div>
  ) : null;

  const openness = curtains ? (
    <div className={isFp ? 'fp-field' : undefined}>
      <label
        className={isFp ? 'fp-field-label' : 'dg-field-label'}
        htmlFor={`curtain-openness-${openingId}`}
      >
        Open {Math.round(curtains.openness * 100)}%
      </label>
      <input
        id={`curtain-openness-${openingId}`}
        className={isFp ? 'fp-curtain-range' : undefined}
        style={isFp ? undefined : { width: '100%', accentColor: 'var(--accent)' }}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={curtains.openness}
        onChange={(e) => onChange({ ...curtains, openness: Number(e.target.value) })}
      />
    </div>
  ) : null;

  if (isFp) {
    return (
      <>
        <div className="fp-field fp-curtain-field">
          <label className="fp-field-label">Curtains</label>
          {toggle}
        </div>
        {curtains ? (
          <>
            <div className="fp-field">
              <label className="fp-field-label">Fabric color</label>
              {swatches}
            </div>
            {openness}
          </>
        ) : null}
      </>
    );
  }

  return (
    <PanelSection title="Curtains">
      {toggle}
      {curtains ? (
        <>
          <div className="dg-field">
            <div className="dg-field-label">Fabric color</div>
            {swatches}
          </div>
          {openness}
        </>
      ) : (
        <p className="dg-finish-photo__hint">Turn curtains on to dress this window in the room.</p>
      )}
    </PanelSection>
  );
}
