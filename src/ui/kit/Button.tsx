import {
  forwardRef,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from 'react';

export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'inverse'
  | 'inverseOutline'
  | 'mono';

export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends HTMLAttributes<HTMLElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  as?: ElementType;
  disabled?: boolean;
  full?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLElement>;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'lg',
    as: Tag = 'button',
    disabled = false,
    full = false,
    type = 'button',
    children,
    className,
    style,
    onClick,
    ...rest
  },
  ref,
) {
  const classes = [
    'kit-btn',
    `kit-btn--${variant}`,
    `kit-btn--${size}`,
    full ? 'kit-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const tagProps =
    Tag === 'button'
      ? { type, disabled, onClick }
      : { onClick, 'aria-disabled': disabled || undefined };

  return (
    <Tag ref={ref} className={classes} style={style} {...tagProps} {...rest}>
      {children}
    </Tag>
  );
});
