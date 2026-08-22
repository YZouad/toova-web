import type { CSSProperties, ReactNode } from 'react';
import { Plate } from './Plate';

export type NumberedStepEdge = 'first' | 'last';

export interface NumberedStepProps {
  numeral: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  plateCaption?: string;
  plateSrc?: string;
  plateAlt?: string;
  plateHeight?: number;
  plateChildren?: ReactNode;
  edge?: NumberedStepEdge;
  divider?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function NumberedStep({
  numeral,
  title,
  body,
  plateCaption,
  plateSrc,
  plateAlt,
  plateHeight = 130,
  plateChildren,
  edge,
  divider = true,
  className,
  style,
}: NumberedStepProps) {
  const edgeClass =
    edge === 'first'
      ? 'kit-numbered-step--first'
      : edge === 'last'
        ? 'kit-numbered-step--last'
        : '';

  return (
    <div
      className={[
        'kit-numbered-step',
        edgeClass,
        divider ? 'kit-numbered-step--divider' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="kit-numbered-step__numeral">{numeral}</div>
      <h3 className="kit-numbered-step__title">{title}</h3>
      <p className="kit-numbered-step__body">{body}</p>
      <Plate
        src={plateChildren ? undefined : plateSrc}
        alt={plateAlt}
        height={plateHeight}
        fit="contain"
        aspectRatio="1"
        topCaption={plateCaption}
      >
        {plateChildren}
      </Plate>
    </div>
  );
}
