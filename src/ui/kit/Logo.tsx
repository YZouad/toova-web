import type { CSSProperties, MouseEventHandler } from 'react';

/** Tight-crop wordmark PNG in /public (see scripts/crop_logo.py). */
export const TOOVA_LOGO_SRC = `${import.meta.env.BASE_URL}toova-logo-cropped.png`;

/** Square mark SVG in /public. */
export const TOOVA_LOGO_SQUARE_SRC = `${import.meta.env.BASE_URL}toova-logo-square.svg`;

/** Cropped wordmark aspect ratio — keep nav sizing in sync with the asset. */
const WORDMARK_ASPECT = 1903 / 541;

/** Square mark aspect ratio (viewBox 229×211). */
const MARK_ASPECT = 229 / 211;

export interface LogoProps {
  size?: number;
  /** When false, renders the square mark instead of the horizontal wordmark. */
  wordmark?: boolean;
  inverse?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  src?: string;
  /** Defaults to "Toova". Pass empty string for decorative use in a lockup. */
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export function Logo({
  size = 21,
  wordmark = true,
  inverse = false,
  onClick,
  src,
  alt = 'Toova',
  className,
  style,
}: LogoProps) {
  const Tag = onClick ? 'button' : 'div';
  const interactiveProps = onClick
    ? { type: 'button' as const, onClick }
    : {};
  const height = size;
  const aspect = wordmark ? WORDMARK_ASPECT : MARK_ASPECT;
  const width = Math.round(height * aspect);
  const imgSrc = src ?? (wordmark ? TOOVA_LOGO_SRC : TOOVA_LOGO_SQUARE_SRC);

  return (
    <Tag
      className={[
        'kit-logo',
        wordmark ? '' : 'kit-logo--mark',
        onClick ? 'kit-logo--interactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ...style, '--kit-logo-size': `${size}px` } as CSSProperties}
      {...interactiveProps}
    >
      <img
        src={imgSrc}
        alt={alt}
        className={[
          wordmark ? 'kit-logo__wordmark-img' : 'kit-logo__mark-img',
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
