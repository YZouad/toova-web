import type { CSSProperties, SelectHTMLAttributes } from 'react';

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}

function normalizeOption(option: SelectOption): { value: string; label: string } {
  if (typeof option === 'string') {
    return { value: option, label: option };
  }
  return option;
}

export function Select({
  options,
  value,
  onChange,
  className,
  style,
  ...rest
}: SelectProps) {
  return (
    <div className={['kit-select', className].filter(Boolean).join(' ')} style={style}>
      <select
        className="kit-select__control"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {options.map((option) => {
          const { value: optValue, label } = normalizeOption(option);
          return (
            <option key={optValue} value={optValue}>
              {label}
            </option>
          );
        })}
      </select>
      <span className="kit-select__caret" aria-hidden>
        ▾
      </span>
    </div>
  );
}
