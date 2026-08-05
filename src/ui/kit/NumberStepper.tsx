import type { CSSProperties } from 'react';
import { Button } from './Button';

export interface NumberStepperProps {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
  style?: CSSProperties;
}

export function NumberStepper({
  label,
  value,
  unit = 'in',
  step = 0.5,
  min = 1,
  max,
  onChange,
  className,
  style,
}: NumberStepperProps) {
  const dec = () => {
    const next = Math.max(min, value - step);
    onChange(max != null ? Math.min(max, next) : next);
  };
  const inc = () => {
    const next = value + step;
    onChange(max != null ? Math.min(max, next) : next);
  };

  return (
    <div className={['kit-number-stepper', className].filter(Boolean).join(' ')} style={style}>
      <span className="kit-number-stepper__label">{label}</span>
      <button type="button" className="kit-number-stepper__btn" onClick={dec} aria-label={`Decrease ${label}`}>
        −
      </button>
      <span className="kit-number-stepper__value">
        {value}
        <span className="kit-number-stepper__unit">{unit}</span>
      </span>
      <button type="button" className="kit-number-stepper__btn" onClick={inc} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}
