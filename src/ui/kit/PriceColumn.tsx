import type { CSSProperties, ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

export interface PriceFeature {
  label: string;
  included: boolean;
}

export interface PriceColumnProps {
  name: ReactNode;
  price: ReactNode;
  period?: string;
  /** Struck price shown above the current figure, for a yearly discount. */
  compareAt?: ReactNode;
  /** Short line under the price, such as yearly savings. */
  priceNote?: ReactNode;
  blurb: ReactNode;
  features: Array<string | PriceFeature>;
  cta: ReactNode;
  ctaVariant?: ButtonVariant;
  ctaDisabled?: boolean;
  current?: boolean;
  onCta?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function PriceColumn({
  name,
  price,
  period = '/mo',
  compareAt,
  priceNote,
  blurb,
  features,
  cta,
  ctaVariant = 'outline',
  ctaDisabled = false,
  current = false,
  onCta,
  className,
  style,
}: PriceColumnProps) {
  return (
    <div
      className={[
        'kit-price-column',
        current ? 'kit-price-column--current' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="kit-price-column__header">
        <span className="kit-price-column__name">{name}</span>
        <span className="kit-price-column__price-block">
          {compareAt ? <span className="kit-price-column__compare">{compareAt}</span> : null}
          <span className="kit-price-column__price">
            {price}
            {period ? <span className="kit-price-column__period">{period}</span> : null}
          </span>
          {priceNote ? <span className="kit-price-column__note">{priceNote}</span> : null}
        </span>
      </div>
      <p className="kit-price-column__blurb">{blurb}</p>
      {features.map((feat, i) => {
        const row: PriceFeature = typeof feat === 'string' ? { label: feat, included: true } : feat;
        return (
          <div
            key={row.label}
            className={[
              'kit-price-column__feature',
              row.included ? '' : 'kit-price-column__feature--excluded',
              i === features.length - 1 ? 'kit-price-column__feature--last' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{row.label}</span>
            <span
              className={row.included ? 'kit-price-column__check' : 'kit-price-column__mark kit-price-column__mark--out'}
              aria-label={row.included ? 'Included' : 'Not included'}
            >
              {row.included ? '✓' : '–'}
            </span>
          </div>
        );
      })}
      <Button
        variant={ctaVariant}
        size="md"
        className="kit-price-column__cta"
        disabled={ctaDisabled}
        onClick={onCta}
      >
        {cta}
      </Button>
    </div>
  );
}
