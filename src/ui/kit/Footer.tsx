import type { CSSProperties } from 'react';
import { Logo } from './Logo';

export interface FooterLink {
  label: string;
  onClick?: () => void;
}

export interface FooterProps {
  links: FooterLink[];
  copyright?: string;
  className?: string;
  style?: CSSProperties;
}

export function Footer({
  links,
  copyright = '© 2026 Toova',
  className,
  style,
}: FooterProps) {
  return (
    <footer className={['kit-footer', className].filter(Boolean).join(' ')} style={style}>
      <div className="kit-footer__inner">
        <Logo size={18} />
        <div className="kit-footer__links">
          {links.map((link) =>
            link.onClick ? (
              <button
                key={link.label}
                type="button"
                className="kit-footer__link"
                onClick={link.onClick}
              >
                {link.label}
              </button>
            ) : (
              <span key={link.label} className="kit-footer__link">
                {link.label}
              </span>
            ),
          )}
          <span className="kit-footer__copyright">{copyright}</span>
        </div>
      </div>
    </footer>
  );
}
