import { LED_PALETTE_PRESETS, palettePresetBackground, toColorInputValue } from '../../lib/hangingDecorGeometry';

const MAX_PALETTE = 6;
const FALLBACK = '#fff4e0';

export function HangingPaletteEditor({
  palette,
  onChange,
}: {
  palette: string[];
  onChange: (colors: string[]) => void;
}) {
  const colors = palette.length > 0 ? palette : [FALLBACK];

  const setAt = (index: number, color: string) => {
    const next = colors.map((c, i) => (i === index ? color : c));
    onChange(next);
  };

  const removeAt = (index: number) => {
    if (colors.length <= 1) return;
    onChange(colors.filter((_, i) => i !== index));
  };

  const add = () => {
    if (colors.length >= MAX_PALETTE) return;
    onChange([...colors, colors[colors.length - 1] ?? FALLBACK]);
  };

  return (
    <div className="dg-hang-palette">
      <div className="dg-hang-palette__presets" role="group" aria-label="Color presets">
        {LED_PALETTE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            title={p.label}
            aria-label={p.label}
            className="dg-hang-palette__preset"
            style={{ background: palettePresetBackground(p.colors) }}
            onClick={() => onChange([...p.colors])}
          />
        ))}
      </div>
      <div className="dg-hang-palette__label">Your colors</div>
      <div className="dg-hang-palette__slots">
        {colors.map((c, i) => (
          <div key={i} className="dg-hang-palette__slot">
            <input
              type="color"
              value={toColorInputValue(c)}
              aria-label={`Color ${i + 1}`}
              onChange={(e) => setAt(i, e.target.value)}
            />
            {colors.length > 1 ? (
              <button
                type="button"
                className="dg-hang-palette__remove"
                aria-label={`Remove color ${i + 1}`}
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {colors.length < MAX_PALETTE ? (
          <button type="button" className="dg-hang-palette__add" onClick={add}>
            + Add
          </button>
        ) : null}
      </div>
    </div>
  );
}
