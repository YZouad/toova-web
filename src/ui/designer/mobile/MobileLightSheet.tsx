import { useMemo } from 'react';
import { useStore } from '../../../store';
import { TIME_PRESETS } from '../LightPanel';
import { MobileSheet } from './MobileSheet';

function nearestTimePreset(hour: number): string {
  let best = TIME_PRESETS[0]!;
  let bestDist = Infinity;
  for (const p of TIME_PRESETS) {
    const d = Math.min(Math.abs(hour - p.hour), 24 - Math.abs(hour - p.hour));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best.id;
}

export interface MobileLightSheetProps {
  onClose: () => void;
  onStartDraw?: (kind: 'lights' | 'leaves') => void;
  onAddLight?: () => void;
}

export function MobileLightSheet({ onClose, onStartDraw, onAddLight }: MobileLightSheetProps) {
  const exposure = useStore((s) => s.environment.exposure);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const appearance = useStore((s) => s.environment.appearance);
  const setExposure = useStore((s) => s.setExposure);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
  const setAppearance = useStore((s) => s.setAppearance);
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const select = useStore((s) => s.select);

  const freeLights = useMemo(
    () =>
      order
        .map((id) => items[id])
        .filter((it): it is NonNullable<typeof it> => !!it && it.kind === 'light'),
    [items, order],
  );

  const hangingLights = useMemo(
    () =>
      order
        .map((id) => items[id])
        .filter(
          (it): it is NonNullable<typeof it> =>
            !!it && it.kind === 'hanging' && it.hanging?.kind === 'lights',
        ),
    [items, order],
  );

  const hangingLeaves = useMemo(
    () =>
      order
        .map((id) => items[id])
        .filter(
          (it): it is NonNullable<typeof it> =>
            !!it && it.kind === 'hanging' && it.hanging?.kind === 'leaves',
        ),
    [items, order],
  );

  const activeTime = nearestTimePreset(timeOfDay);
  const brightnessPct = Math.round(((exposure - 0.2) / (3 - 0.2)) * 100);
  const hasFixtures = freeLights.length > 0 || hangingLights.length > 0 || hangingLeaves.length > 0;

  return (
    <MobileSheet kind="light" title="Light & mood" onClose={onClose}>
      <section className="dgm-section">
        <h3 className="dgm-section-title">Time of day</h3>
        <div className="dgm-segment-row">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dgm-segment-btn${activeTime === p.id ? ' is-active' : ''}`}
              aria-pressed={activeTime === p.id}
              onClick={() => setTimeOfDay(p.hour)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="dgm-section">
        <div className="dgm-section-head">
          <h3 className="dgm-section-title">Brightness</h3>
          <span className="dgm-section-meta">{brightnessPct}%</span>
        </div>
        <input
          type="range"
          className="dgm-range"
          min={0.2}
          max={3}
          step={0.05}
          value={exposure}
          onChange={(e) => setExposure(Number(e.target.value))}
          aria-label="Sun and ambient intensity"
        />
      </section>

      <hr className="dgm-rule" />

      <section className="dgm-section">
        <span className="dgm-eyebrow">Fixtures in this room</span>

        <button
          type="button"
          className="dgm-toggle-card"
          aria-pressed={appearance.recessedLights}
          onClick={() => setAppearance({ recessedLights: !appearance.recessedLights })}
        >
          <span className="dgm-toggle-card__copy">
            <span className="dgm-toggle-card__title">Ceiling lights</span>
            <span className="dgm-toggle-card__hint">Recessed cans on a grid. The room&apos;s own light.</span>
          </span>
          <span className={`dgm-toggle${appearance.recessedLights ? ' is-on' : ''}`} aria-hidden />
        </button>

        <div className="dgm-fixture-list">
          {hangingLights.map((it) => (
            <button
              key={it.id}
              type="button"
              className="dgm-fixture"
              onClick={() => {
                select(it.id);
                onClose();
              }}
            >
              <span className="dgm-fixture__swatch" style={{ background: '#E8C27A' }} />
              <span className="dgm-fixture__label">{it.label}</span>
              <span className="dgm-fixture__meta">string</span>
            </button>
          ))}
          {hangingLeaves.map((it) => (
            <button
              key={it.id}
              type="button"
              className="dgm-fixture"
              onClick={() => {
                select(it.id);
                onClose();
              }}
            >
              <span className="dgm-fixture__swatch" style={{ background: '#7E8A60' }} />
              <span className="dgm-fixture__label">{it.label}</span>
              <span className="dgm-fixture__meta">leaves</span>
            </button>
          ))}
          {freeLights.map((it) => {
            const elev = Math.round(it.position[1]);
            return (
              <button
                key={it.id}
                type="button"
                className="dgm-fixture"
                onClick={() => {
                  select(it.id);
                  onClose();
                }}
              >
                <span className="dgm-fixture__swatch" style={{ background: '#F0DCA8' }} />
                <span className="dgm-fixture__label">{it.label || 'Free light'}</span>
                <span className="dgm-fixture__meta">{elev}″ up</span>
              </button>
            );
          })}
          {!hasFixtures ? (
            <p className="dgm-fixture__empty">No free lights yet. Add one to sculpt highlights.</p>
          ) : null}
        </div>

        {onStartDraw ? (
          <div className="dgm-action-row">
            <button
              type="button"
              className="dgm-action-btn is-dashed"
              onClick={() => onStartDraw('lights')}
            >
              Draw string lights
            </button>
            <button
              type="button"
              className="dgm-action-btn is-dashed"
              onClick={() => onStartDraw('leaves')}
            >
              Draw leaves
            </button>
          </div>
        ) : null}

        {onAddLight ? (
          <button type="button" className="dgm-action-btn is-accent is-full" onClick={onAddLight}>
            Add free light
          </button>
        ) : null}
      </section>
    </MobileSheet>
  );
}
