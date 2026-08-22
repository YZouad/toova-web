import type { CSSProperties, ReactNode } from 'react';
import { MonoMeta } from './MonoMeta';

export interface PlateProps {
  height?: number;
  src?: string;
  alt?: string;
  placeholder?: ReactNode;
  captionLeft?: string;
  captionRight?: string;
  topCaption?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** `contain` shows the full image; default `cover` fills the frame. */
  fit?: 'cover' | 'contain';
  /** When set, used instead of a fixed pixel height. */
  aspectRatio?: string | number;
}

export function Plate({
  src,
  alt = '',
  height = 520,
  captionLeft,
  captionRight,
  topCaption,
  placeholder,
  children,
  className,
  style,
  fit = 'cover',
  aspectRatio,
}: PlateProps) {
  const classes = [
    'kit-plate',
    src ? 'kit-plate--image' : 'kit-plate--placeholder',
    fit === 'contain' ? 'kit-plate--contain' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{
        ...style,
        ...(aspectRatio != null ? { aspectRatio: String(aspectRatio) } : { height }),
      }}
    >
      {src ? (
        <img src={src} alt={alt} className="kit-plate__image" />
      ) : children ? null : (
        <div className="kit-plate__placeholder">{placeholder}</div>
      )}
      {children}
      {topCaption ? (
        <span className="kit-plate__caption kit-plate__caption--top">
          <MonoMeta size="xs" className="kit-plate__chip kit-plate__chip--top">
            {topCaption}
          </MonoMeta>
        </span>
      ) : null}
      {captionLeft ? (
        <span className="kit-plate__caption kit-plate__caption--left">
          <MonoMeta size="sm" className="kit-plate__chip">
            {captionLeft}
          </MonoMeta>
        </span>
      ) : null}
      {captionRight ? (
        <span className="kit-plate__caption kit-plate__caption--right">
          <MonoMeta size="sm" className="kit-plate__chip">
            {captionRight}
          </MonoMeta>
        </span>
      ) : null}
    </div>
  );
}
