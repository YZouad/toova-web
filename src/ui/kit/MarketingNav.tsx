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
  return (
    <nav className={['kit-marketing-nav', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-marketing-nav__inner">
        <Logo onClick={brandOnClick} />
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
