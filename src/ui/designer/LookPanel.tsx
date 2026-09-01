import { WALL_COLOR_SWATCHES } from '../../lib/roomAppearance';
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
      <PanelSection title="Wall paint">
        <div className="dg-swatch-grid">
          {WALL_COLOR_SWATCHES.map((s) => (
            <button
              key={s.color}
              type="button"
              className={`dg-swatch${appearance.wallColor.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
              style={{ background: s.color }}
              title={s.label}
              aria-label={s.label}
              onClick={() => setAppearance({ wallColor: s.color })}
            />
          ))}
        </div>
      </PanelSection>

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
