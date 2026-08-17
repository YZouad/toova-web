import type { BeddingColor } from '../lib/bedding/types';
import { findColor } from '../lib/bedding/catalog';
import { MonoMeta } from './kit/MonoMeta';

interface Props {
  label: string;
  colors: BeddingColor[];
  value: string;
  fallbackColorId: string;
  onChange: (colorId: string) => void;
}

export function BeddingColorPicker({
  label,
  colors,
  value,
  fallbackColorId,
  onChange,
}: Props) {
  const active = findColor(colors, value, fallbackColorId);

  return (
    <div className="bedding-color-picker">
      <MonoMeta size="xs" tone="dense" className="bedding-color-picker__label">
        {label}
      </MonoMeta>
      <div className="look-swatches bedding-color-picker__swatches">
        {colors.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            aria-label={c.label}
            aria-pressed={value === c.id}
            className={`look-swatch${value === c.id ? ' active' : ''}`}
            style={{ background: c.hex }}
            onClick={() => onChange(c.id)}
          />
        ))}
      </div>
      <MonoMeta size="xs" tone="dense" className="bedding-color-picker__active">
        {active.label}
      </MonoMeta>
    </div>
  );
}
