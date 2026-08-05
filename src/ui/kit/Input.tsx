import type { InputHTMLAttributes } from 'react';
import { useState } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  invalid?: boolean;
}

export function Input({
  mono = false,
  invalid = false,
  className,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const classes = [
    'kit-input',
    mono ? 'kit-input--mono' : '',
    invalid ? 'kit-input--invalid' : '',
    focused ? 'kit-input--focused' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      className={classes}
      style={style}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}
