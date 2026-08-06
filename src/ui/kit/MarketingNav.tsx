import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Logo } from './Logo';

export interface MarketingNavLink {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface MarketingNavProps {
  links: MarketingNavLink[];
  cta?: ReactNode;
  brandOnClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  style?: CSSProperties;
}

export function MarketingNav({
  links,
  cta,
  brandOnClick,
  className,
  style,
}: MarketingNavProps) {
  const BrandTag = brandOnClick ? 'button' : 'div';
  const brandInteractive = Boolean(brandOnClick);

  return (
    <nav className={['kit-marketing-nav', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-marketing-nav__inner">
        <BrandTag
          className={[
            'kit-marketing-nav__brand',
            brandInteractive ? 'kit-marketing-nav__brand--interactive' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={brandInteractive ? 'Toova' : undefined}
          {...(brandOnClick
            ? { type: 'button' as const, onClick: brandOnClick }
            : {})}
        >
          <Logo size={34} wordmark={false} alt="" className="kit-marketing-nav__mark" />
          <Logo
            size={28}
            alt={brandInteractive ? '' : 'Toova'}
            className="kit-marketing-nav__wordmark"
          />
        </BrandTag>
        <div className="kit-marketing-nav__links">
          {links.map((link) => {
            const isActive = link.active;
            const classNames = [
              'kit-marketing-nav__link',
              isActive ? 'kit-marketing-nav__link--active' : '',
            ]
              .filter(Boolean)
              .join(' ');

            if (link.href) {
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className={classNames}
                  onClick={
                    link.onClick
                      ? (e) => {
                          e.preventDefault();
                          link.onClick?.();
                        }
                      : undefined
                  }
                >
                  {link.label}
                </a>
              );
            }

            if (link.onClick) {
              return (
                <button
                  key={link.label}
                  type="button"
                  className={classNames}
                  onClick={link.onClick}
                >
                  {link.label}
                </button>
              );
            }

            return (
              <span key={link.label} className={classNames}>
                {link.label}
              </span>
            );
          })}
          {cta}
        </div>
      </div>
    </nav>
  );
}
