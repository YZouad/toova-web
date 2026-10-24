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
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  const accessibleName = ariaLabel ?? (typeof label === 'string' ? label : undefined);

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
      onClick={(e) => {
        // Whole row is clickable; ignore nested interactive targets.
        if ((e.target as HTMLElement).closest('a,button')) return;
        toggle();
      }}
    >
      <span
        className={['kit-checkbox__box', checked ? 'kit-checkbox__box--checked' : '']
          .filter(Boolean)
          .join(' ')}
        role="checkbox"
        aria-checked={checked}
        aria-label={accessibleName}
        tabIndex={disabled ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
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
