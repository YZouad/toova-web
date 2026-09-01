import { useMemo } from 'react';
import { WEATHER_OPTIONS } from '../../lib/environment';
import { useStore, type HangingDecorKind } from '../../store';
import { PanelSection, PanelShell } from './PanelShell';

/** Time-of-day chips live in Light (not Room look). */
export const TIME_PRESETS: { id: string; label: string; hour: number }[] = [
  { id: 'morning', label: 'Morning', hour: 8 },
  { id: 'afternoon', label: 'Afternoon', hour: 13 },
  { id: 'evening', label: 'Evening', hour: 18 },
  { id: 'night', label: 'Night', hour: 22 },
];

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

export interface LightPanelProps {
  compact?: boolean;
  onClose: () => void;
  onStartDraw?: (kind: HangingDecorKind) => void;
  onAddLight?: () => void;
}

export function LightPanel({ compact, onClose, onStartDraw, onAddLight }: LightPanelProps) {
  const exposure = useStore((s) => s.environment.exposure);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const weather = useStore((s) => s.environment.weather);
  const appearance = useStore((s) => s.environment.appearance);
  const setExposure = useStore((s) => s.setExposure);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
  const setWeather = useStore((s) => s.setWeather);
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

  const activeTime = nearestTimePreset(timeOfDay);
  const brightnessPct = Math.round(((exposure - 0.2) / (3 - 0.2)) * 100);
  const hasFixtures = freeLights.length > 0 || hangingLights.length > 0;

  return (
    <PanelShell
      compact={compact}
      mobileHeight="mid"
      title="Light & mood"
      onClose={onClose}
    >
      <PanelSection title="Time of day">
        <div className="dg-tabs">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dg-tabs__btn${activeTime === p.id ? ' is-active' : ''}`}
              onClick={() => setTimeOfDay(p.hour)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Brightness" meta={`${brightnessPct}%`}>
        <input
          type="range"
          className="dg-range"
          min={0.2}
          max={3}
          step={0.05}
          value={exposure}
          onChange={(e) => setExposure(Number(e.target.value))}
          aria-label="Sun and ambient intensity"
        />
      </PanelSection>

      <PanelSection
        title="Weather outside"
        meta={WEATHER_OPTIONS.find((w) => w.id === weather)?.label}
      >
        <div className="dg-chip-row">
          {WEATHER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`dg-chip${weather === opt.id ? ' is-active' : ''}`}
              onClick={() => setWeather(opt.id)}
              title={opt.label}
            >
              {opt.glyph} {opt.label}
            </button>
          ))}
        </div>
      </PanelSection>

      <hr className="dg-rule" />

      <PanelSection title="Fixtures in this room">
        <button
          type="button"
          className="dg-toggle-card"
          aria-pressed={appearance.recessedLights}
          onClick={() => setAppearance({ recessedLights: !appearance.recessedLights })}
        >
          <span className="dg-toggle-card__copy">
            <span className="dg-toggle-card__title">Ceiling lights</span>
            <span className="dg-toggle-card__hint">Recessed cans on a grid. The room&apos;s own light.</span>
          </span>
          <span
            className={`dg-toggle${appearance.recessedLights ? ' is-on' : ''}`}
            aria-hidden
          />
        </button>

        <div className="dg-fixture-list">
          {hangingLights.map((it) => (
            <button
              key={it.id}
              type="button"
              className="dg-fixture"
              onClick={() => {
                select(it.id);
                onClose();
              }}
            >
              <span className="dg-fixture__swatch" style={{ background: '#E8C27A' }} />
              <span className="dg-row__label">{it.label}</span>
              <span className="dg-row__meta">string</span>
            </button>
          ))}
          {freeLights.map((it) => {
            const elev = Math.round(it.position[1]);
            return (
              <button
                key={it.id}
                type="button"
                className="dg-fixture"
                onClick={() => {
                  select(it.id);
                  onClose();
                }}
              >
                <span className="dg-fixture__swatch" style={{ background: '#F0DCA8' }} />
                <span className="dg-row__label">{it.label || 'Free light'}</span>
                <span className="dg-row__meta">{elev}″ up</span>
              </button>
            );
          })}
          {!hasFixtures ? (
            <p className="dg-fixture__empty">No free lights yet. Add one to sculpt highlights.</p>
          ) : null}
        </div>

        {onStartDraw ? (
          <div className="dg-footer-actions">
            <button
              type="button"
              className="dg-footer-btn is-dashed is-grow"
              onClick={() => onStartDraw('lights')}
            >
              Draw string lights
            </button>
            <button
              type="button"
              className="dg-footer-btn is-dashed is-grow"
              onClick={() => onStartDraw('leaves')}
            >
              Draw leaves
            </button>
            <button
              type="button"
              className="dg-footer-btn is-dashed is-grow"
              onClick={() => onStartDraw('led-strip')}
            >
              Draw LED strip
            </button>
          </div>
        ) : null}

        {onAddLight ? (
          <button type="button" className="dg-footer-btn is-accent" style={{ width: '100%' }} onClick={onAddLight}>
            Add free light
          </button>
        ) : null}

      </PanelSection>
    </PanelShell>
  );
}
