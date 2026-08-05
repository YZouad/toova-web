import type { CSSProperties } from 'react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label. Omit for icon-only; pass `ariaLabel` for accessibility. */
  label?: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Checkbox({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className,
  style,
}: CheckboxProps) {
  return (
    <label
      className={[
        'kit-checkbox',
        !label ? 'kit-checkbox--icon-only' : '',
        disabled ? 'kit-checkbox--disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
    >
      <span
        className={['kit-checkbox__box', checked ? 'kit-checkbox__box--checked' : '']
          .filter(Boolean)
          .join(' ')}
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        {checked ? '✓' : ''}
      </span>
      {label != null && label !== '' ? (
        <span className="kit-checkbox__label">{label}</span>
      ) : null}
    </label>
  );
}
