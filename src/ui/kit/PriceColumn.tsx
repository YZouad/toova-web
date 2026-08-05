import type { CSSProperties } from 'react';
import { Button, type ButtonVariant } from './Button';

export interface PriceColumnProps {
  name: React.ReactNode;
  price: React.ReactNode;
  period?: string;
  blurb: React.ReactNode;
  features: string[];
  cta: React.ReactNode;
  ctaVariant?: ButtonVariant;
  onCta?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function PriceColumn({
  name,
  price,
  period = '/mo',
  blurb,
  features,
  cta,
  ctaVariant = 'outline',
  onCta,
  className,
  style,
}: PriceColumnProps) {
  return (
    <div className={['kit-price-column', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-price-column__header">
        <span className="kit-price-column__name">{name}</span>
        <span className="kit-price-column__price">
          {price}
          <span className="kit-price-column__period">{period}</span>
        </span>
      </div>
      <p className="kit-price-column__blurb">{blurb}</p>
      {features.map((feat, i) => (
        <div
          key={feat}
          className={[
            'kit-price-column__feature',
            i === features.length - 1 ? 'kit-price-column__feature--last' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span>{feat}</span>
          <span className="kit-price-column__check">✓</span>
        </div>
      ))}
      <Button variant={ctaVariant} size="md" className="kit-price-column__cta" onClick={onCta}>
        {cta}
      </Button>
    </div>
  );
}
