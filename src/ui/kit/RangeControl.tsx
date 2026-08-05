import type { CSSProperties } from 'react';

export interface RangeControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  className?: string;
  style?: CSSProperties;
}

export function RangeControl({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  formatValue,
  onChange,
  className,
  style,
}: RangeControlProps) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div className={['kit-range-control', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-range-control__header">
        <span className="kit-range-control__label">{label}</span>
        <span className="kit-range-control__value">{display}</span>
      </div>
      <div className="kit-range-control__track-wrap">
        <div className="kit-range-control__track" />
        <div className="kit-range-control__fill" style={{ width: `${pct}%` }} />
        <div className="kit-range-control__thumb" style={{ left: `calc(${pct}% - 1px)` }} />
        <input
          type="range"
          className="kit-range-control__input"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
      </div>
    </div>
  );
}
