import { useMemo } from 'react';
import {
  WALL_COLOR_SWATCHES,
  uniqueWallLabels,
  wallPaintColor,
} from '../../lib/roomAppearance';
import { allWallSegments } from '../../lib/roomGeometry';
import {
  FLOOR_PRESET_OPTIONS,
  MATERIAL_PRESETS,
  TRIM_PRESET_OPTIONS,
  materialLabel,
} from '../../lib/roomMaterials';
import { useStore } from '../../store';
import { PanelSection, PanelShell } from './PanelShell';

export interface LookPanelProps {
  compact?: boolean;
  onClose: () => void;
}

export function LookPanel({ compact, onClose }: LookPanelProps) {
  const appearance = useStore((s) => s.environment.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  return (
    <PanelShell
      compact={compact}
      mobileHeight="mid"
      title="Room look"
      onClose={onClose}
    >
      <WallPaintControls compact={false} />

      <PanelSection title="Flooring" meta={materialLabel(appearance.floorPreset)}>
        <div className="dg-mat-grid">
          {FLOOR_PRESET_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={`dg-mat-card${appearance.floorPreset === id ? ' is-active' : ''}`}
              onClick={() => setAppearance({ floorPreset: id })}
            >
              <span className={`dg-mat-card__preview dg-mat-card__preview--${id}`} />
              <span className="dg-mat-card__label">{materialLabel(id)}</span>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Trim & baseboards" meta={materialLabel(appearance.trimPreset)}>
        <div className="dg-swatch-grid">
          {TRIM_PRESET_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={`dg-swatch${appearance.trimPreset === id ? ' is-active' : ''}`}
              style={{ background: MATERIAL_PRESETS[id].color }}
              title={materialLabel(id)}
              aria-label={materialLabel(id)}
              onClick={() => setAppearance({ trimPreset: id })}
            />
          ))}
        </div>
        <div className="dg-row dg-row--between">
          <span className="dg-row__label">Show baseboards</span>
          <button
            type="button"
            className={`dg-toggle${appearance.showBaseboards ? ' is-on' : ''}`}
            aria-pressed={appearance.showBaseboards}
            aria-label="Show baseboards"
            onClick={() => setAppearance({ showBaseboards: !appearance.showBaseboards })}
          />
        </div>
      </PanelSection>

      <p className="dg-note">Changing the look never moves your furniture.</p>
    </PanelShell>
  );
}

export function WallPaintControls({ compact }: { compact: boolean }) {
  const appearance = useStore((s) => s.environment.appearance);
  const geom = useStore((s) => s.roomGeometry);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const setWallPaint = useStore((s) => s.setWallPaint);

  const walls = useMemo(
    () =>
      uniqueWallLabels(
        allWallSegments(geom).map((seg) => ({ id: seg.wall.id, outward: seg.outward })),
      ),
    [geom],
  );

  const paintWallId = selectedWallId && walls.some((w) => w.id === selectedWallId) ? selectedWallId : null;
  const current = paintWallId ? wallPaintColor(appearance, paintWallId) : appearance.wallColor;
  const currentHex = current.length === 7 ? current : '#d8d0c2';
  const activeWall = paintWallId ? walls.find((w) => w.id === paintWallId) : null;

  const apply = (color: string) => setWallPaint(color, paintWallId);

  const swatches = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {WALL_COLOR_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          aria-pressed={current.toLowerCase() === s.color.toLowerCase()}
          onClick={() => apply(s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : 'dg-color-input'}
        value={currentHex}
        onChange={(e) => apply(e.target.value)}
        aria-label="Custom wall color"
      />
    </div>
  );

  const chips =
    walls.length > 1 ? (
      <div className={compact ? 'dgm-chip-row' : 'dg-chip-row'} role="group" aria-label="Paint target">
        <button
          type="button"
          className={`${compact ? 'dgm-chip' : 'dg-chip'}${paintWallId === null ? ' is-active' : ''}`}
          aria-pressed={paintWallId === null}
          onClick={() => selectWall(null)}
        >
          All walls
        </button>
        {walls.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`${compact ? 'dgm-chip' : 'dg-chip'}${paintWallId === w.id ? ' is-active' : ''}`}
            aria-pressed={paintWallId === w.id}
            onClick={() => selectWall(w.id)}
          >
            <span
              className={compact ? 'dgm-wall-dot' : 'dg-wall-dot'}
              style={{ background: wallPaintColor(appearance, w.id) }}
              aria-hidden
            />
            {w.label}
          </button>
        ))}
      </div>
    ) : null;

  if (compact) {
    return (
      <section className="dgm-section">
        <div className="dgm-section-head">
          <h3 className="dgm-section-title">Wall paint</h3>
          <span className="dgm-section-meta">{activeWall?.label ?? 'All walls'}</span>
        </div>
        {chips}
        {swatches}
        {walls.length > 1 ? (
          <p className="dgm-note">Tap a wall in the room, or a chip, to paint just that one.</p>
        ) : null}
      </section>
    );
  }

  return (
    <PanelSection title="Wall paint" meta={activeWall?.label ?? 'All walls'}>
      {chips}
      {swatches}
      {walls.length > 1 ? (
        <p className="dg-look-hint">Click a wall in the room, or a chip, to paint just that one.</p>
      ) : null}
    </PanelSection>
  );
}
