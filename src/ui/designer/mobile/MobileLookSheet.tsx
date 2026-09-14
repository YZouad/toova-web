import { FLOOR_PRESET_OPTIONS, materialLabel } from '../../../lib/roomMaterials';
import { useStore } from '../../../store';
import { WallPaintControls } from '../LookPanel';
import { MobileSheet } from './MobileSheet';

export interface MobileLookSheetProps {
  onClose: () => void;
}

export function MobileLookSheet({ onClose }: MobileLookSheetProps) {
  const appearance = useStore((s) => s.environment.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  return (
    <MobileSheet kind="look" title="Room look" onClose={onClose}>
      <WallPaintControls compact />

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
              <span className={`dgm-mat-card__preview dg-mat-card__preview--${id}`} />
              <span className="dgm-mat-card__label">{materialLabel(id)}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="dgm-note">Changing the look never moves your furniture.</p>
    </MobileSheet>
  );
}
