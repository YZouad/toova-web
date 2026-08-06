import type { CSSProperties, MouseEventHandler } from 'react';

/** Tight-crop wordmark PNG in /public (see scripts/crop_logo.py). */
export const TOOVA_LOGO_SRC = `${import.meta.env.BASE_URL}toova-logo-cropped.png`;

/** Cropped logo aspect ratio — keep nav/wordmark sizing in sync with the asset. */
const LOGO_ASPECT = 1903 / 541;

export interface LogoProps {
  size?: number;
  /** @deprecated Wordmark is baked into the logo image; kept for call-site compatibility. */
  wordmark?: boolean;
  inverse?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  src?: string;
  className?: string;
  style?: CSSProperties;
}

export function Logo({
  size = 21,
  inverse = false,
  onClick,
  src = TOOVA_LOGO_SRC,
  className,
  style,
}: LogoProps) {
  const Tag = onClick ? 'button' : 'div';
  const interactiveProps = onClick
    ? { type: 'button' as const, onClick }
    : {};
  const height = size;
  const width = Math.round(height * LOGO_ASPECT);

  return (
    <Tag
      className={['kit-logo', onClick ? 'kit-logo--interactive' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ ...style, '--kit-logo-size': `${size}px` } as CSSProperties}
      {...interactiveProps}
    >
      <img
        src={src}
        alt="Toova"
        className={[
          'kit-logo__wordmark-img',
          inverse ? 'kit-logo__wordmark-img--inverse' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        width={width}
        height={height}
      />
    </Tag>
  );
}
