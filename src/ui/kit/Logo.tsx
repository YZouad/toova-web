import type { CSSProperties, MouseEventHandler } from 'react';

const DEFAULT_LOGO_SRC = '/toova-logo-cropped.png';

export interface LogoProps {
  size?: number;
  wordmark?: boolean;
  inverse?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  src?: string;
  className?: string;
  style?: CSSProperties;
}

export function Logo({
  size = 21,
  wordmark = true,
  inverse = false,
  onClick,
  src = DEFAULT_LOGO_SRC,
  className,
  style,
}: LogoProps) {
  const Tag = onClick ? 'button' : 'div';
  const interactiveProps = onClick
    ? { type: 'button' as const, onClick }
    : {};

  return (
    <Tag
      className={['kit-logo', onClick ? 'kit-logo--interactive' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ ...style, '--kit-logo-size': `${size}px` } as CSSProperties}
      {...interactiveProps}
    >
      {src ? (
        <img
          src={src}
          alt="Toova"
          className="kit-logo__mark"
          width={size}
          height={size}
        />
      ) : (
        <div className="kit-logo__mark kit-logo__mark--fallback" />
      )}
      {wordmark ? (
        <span
          className={[
            'kit-logo__wordmark',
            inverse ? 'kit-logo__wordmark--inverse' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          Toova
        </span>
      ) : null}
    </Tag>
  );
}
