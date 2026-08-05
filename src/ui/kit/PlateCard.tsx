import type { CSSProperties, KeyboardEvent, MouseEventHandler } from 'react';
import { MonoMeta } from './MonoMeta';
import { Plate } from './Plate';

export interface PlateCardProps {
  name: React.ReactNode;
  author?: React.ReactNode;
  meta?: React.ReactNode;
  filename?: string;
  height?: number;
  src?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}

export function PlateCard({
  src,
  name,
  author,
  meta,
  height = 420,
  filename,
  onClick,
  className,
  style,
}: PlateCardProps) {
  return (
    <div
      className={[
        'kit-plate-card',
        onClick ? 'kit-plate-card--interactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e as unknown as Parameters<MouseEventHandler<HTMLDivElement>>[0]);
              }
            }
          : undefined
      }
    >
      <Plate src={src} height={height} topCaption={filename} />
      <div className="kit-plate-card__caption">
        <div>
          <div className="kit-plate-card__name">{name}</div>
          {author ? <div className="kit-plate-card__author">{author}</div> : null}
        </div>
        {meta ? (
          <MonoMeta size="sm" tone="dense">
            {meta}
          </MonoMeta>
        ) : null}
      </div>
    </div>
  );
}
