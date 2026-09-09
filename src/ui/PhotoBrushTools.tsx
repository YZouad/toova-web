import type { BrushMode } from '../lib/maskBrush';

export const PAINT_COLOR_PRESETS = [
  { label: 'Red', value: '#e53935' },
  { label: 'Blue', value: '#1e88e5' },
  { label: 'Green', value: '#43a047' },
  { label: 'Black', value: '#212121' },
  { label: 'Yellow', value: '#fdd835' },
] as const;

export const DEFAULT_PAINT_COLOR = PAINT_COLOR_PRESETS[0].value;

export interface PhotoBrushToolsProps {
  mode: BrushMode;
  brushSize: number;
  paintColor: string;
  canUndo: boolean;
  disabled?: boolean;
  resetLabel?: string;
  onModeChange: (mode: BrushMode) => void;
  onBrushSizeChange: (size: number) => void;
  onPaintColorChange: (color: string) => void;
  onUndo: () => void;
  onReset: () => void;
}

export function PhotoBrushTools({
  mode,
  brushSize,
  paintColor,
  canUndo,
  disabled = false,
  resetLabel = 'Reset',
  onModeChange,
  onBrushSizeChange,
  onPaintColorChange,
  onUndo,
  onReset,
}: PhotoBrushToolsProps) {
  return (
    <div className="photo-prep__mask-tools">
      <div className="photo-prep__mask-modes">
        <button
          type="button"
          className={`photo-prep__btn${mode === 'erase' ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onModeChange('erase')}
          title="Remove areas (transparent on cutout, white on source)"
        >
          Erase
        </button>
        <button
          type="button"
          className={`photo-prep__btn${mode === 'paint' ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onModeChange('paint')}
          title="Paint with a chosen color"
        >
          Paint
        </button>
        <button
          type="button"
          className={`photo-prep__btn${mode === 'restore' ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onModeChange('restore')}
          title="Bring back original pixels"
        >
          Restore
        </button>
      </div>

      {mode === 'paint' ? (
        <div className="photo-prep__mask-colors">
          <label className="photo-prep__mask-color">
            <span>Color</span>
            <input
              type="color"
              value={paintColor}
              disabled={disabled}
              onChange={(e) => onPaintColorChange(e.target.value)}
            />
          </label>
          <div className="photo-prep__mask-swatches" role="list" aria-label="Paint color presets">
            {PAINT_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                role="listitem"
                className={`photo-prep__swatch${paintColor === preset.value ? ' is-active' : ''}`}
                disabled={disabled}
                title={preset.label}
                aria-label={preset.label}
                style={{ backgroundColor: preset.value }}
                onClick={() => onPaintColorChange(preset.value)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <label className="photo-prep__mask-brush">
        <span>Brush</span>
        <input
          type="range"
          min={8}
          max={64}
          step={1}
          value={brushSize}
          disabled={disabled}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
        />
        <span className="photo-prep__mask-brush-value">{brushSize}px</span>
      </label>

      <div className="photo-prep__mask-actions">
        <button
          type="button"
          className="photo-prep__btn photo-prep__btn--quiet"
          disabled={disabled || !canUndo}
          onClick={onUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="photo-prep__btn photo-prep__btn--quiet"
          disabled={disabled}
          onClick={onReset}
        >
          {resetLabel}
        </button>
      </div>
    </div>
  );
}
