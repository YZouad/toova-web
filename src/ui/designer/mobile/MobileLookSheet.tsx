import { WALL_COLOR_SWATCHES } from '../../../lib/roomAppearance';
import { FLOOR_PRESET_OPTIONS, materialLabel } from '../../../lib/roomMaterials';
import { useStore } from '../../../store';
import { MobileSheet } from './MobileSheet';

export interface MobileLookSheetProps {
  onClose: () => void;
}

export function MobileLookSheet({ onClose }: MobileLookSheetProps) {
  const appearance = useStore((s) => s.environment.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  return (
    <MobileSheet kind="look" title="Room look" onClose={onClose}>
      <section className="dgm-section">
        <h3 className="dgm-section-title">Wall paint</h3>
        <div className="dgm-swatch-row">
          {WALL_COLOR_SWATCHES.map((s) => (
            <button
              key={s.color}
              type="button"
              className={`dgm-swatch${appearance.wallColor.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
              style={{ background: s.color }}
              title={s.label}
              aria-label={s.label}
              aria-pressed={appearance.wallColor.toLowerCase() === s.color.toLowerCase()}
              onClick={() => setAppearance({ wallColor: s.color })}
            />
          ))}
        </div>
      </section>

      <section className="dgm-section">
        <div className="dgm-section-head">
          <h3 className="dgm-section-title">Flooring</h3>
          <span className="dgm-section-meta">{materialLabel(appearance.floorPreset)}</span>
        </div>
        <div className="dgm-mat-grid">
          {FLOOR_PRESET_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={`dgm-mat-card${appearance.floorPreset === id ? ' is-active' : ''}`}
              aria-pressed={appearance.floorPreset === id}
              onClick={() => setAppearance({ floorPreset: id })}
            >
              <span className={`dgm-mat-card__preview dgm-mat-card__preview--${id}`} />
              <span className="dgm-mat-card__label">{materialLabel(id)}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="dgm-note">Changing the look never moves your furniture.</p>
    </MobileSheet>
  );
}
