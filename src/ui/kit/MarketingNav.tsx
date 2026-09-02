import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import { Logo } from './Logo';
import { usePhoneNav } from './usePhoneNav';

export { usePhoneNav, usePhoneLayout, PHONE_NAV_MQ, PHONE_LAYOUT_MQ } from './usePhoneNav';

export interface MarketingNavLink {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface MarketingNavProps {
  links?: MarketingNavLink[];
  cta?: ReactNode;
  brandOnClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  style?: CSSProperties;
}

/** Long + short label pair for nav CTAs that must fit narrow phone headers. */
export function NavCtaLabel({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="kit-marketing-nav__cta-long">{long}</span>
      <span className="kit-marketing-nav__cta-short">{short}</span>
    </>
  );
}

export interface MarketingNavAuthActionsProps {
  loggedIn?: boolean;
  onLogin?: () => void;
  onPrimary: () => void;
  primaryLong?: string;
  primaryShort?: string;
  loggedInPrimaryLong?: string;
  loggedInPrimaryShort?: string;
}

/** Standard sign-up / dashboard actions sized for phone headers. */
export function MarketingNavAuthActions({
  loggedIn = false,
  onLogin,
  onPrimary,
  primaryLong = 'Start designing, free',
  primaryShort = 'Start free',
  loggedInPrimaryLong = 'Go to dashboard',
  loggedInPrimaryShort = 'Dashboard',
}: MarketingNavAuthActionsProps) {
  const phone = usePhoneNav();
  const label = loggedIn
    ? phone
      ? loggedInPrimaryShort
      : loggedInPrimaryLong
    : phone
      ? primaryShort
      : primaryLong;

  return (
    <>
      {!loggedIn && onLogin ? (
        <Button size="sm" variant="mono" onClick={onLogin}>
          Log in
        </Button>
      ) : null}
      <Button size="sm" className="kit-marketing-nav__cta-primary" onClick={onPrimary}>
        {label}
      </Button>
    </>
  );
}

export function MarketingNav({
  links = [],
  cta,
  brandOnClick,
  className,
  style,
}: MarketingNavProps) {
  const phone = usePhoneNav();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const BrandTag = brandOnClick ? 'button' : 'div';
  const brandInteractive = Boolean(brandOnClick);
  const hasLinks = links.length > 0;

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open || !hasLinks) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('nav-drawer-open');
    const first = panelRef.current?.querySelector<HTMLElement>(
      'a, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('nav-drawer-open');
      toggleRef.current?.focus();
    };
  }, [open, hasLinks]);

  const runAndClose = (fn?: () => void) => {
    fn?.();
    close();
  };

  const renderLink = (link: MarketingNavLink) => {
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
                  runAndClose(link.onClick);
                }
              : () => close()
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
          onClick={() => runAndClose(link.onClick)}
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
  };

  return (
    <nav
      className={['kit-marketing-nav', phone ? 'is-phone' : '', className].filter(Boolean).join(' ')}
      style={style}
    >
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
            ? {
                type: 'button' as const,
                onClick: (e: MouseEvent<HTMLElement>) => {
                  close();
                  brandOnClick(e);
                },
              }
            : {})}
        >
          <Logo
            size={phone ? 30 : 34}
            wordmark={false}
            alt=""
            className="kit-marketing-nav__mark"
          />
          <Logo
            size={phone ? 22 : 28}
            alt={brandInteractive ? '' : 'Toova'}
            className="kit-marketing-nav__wordmark"
          />
        </BrandTag>

        <div className="kit-marketing-nav__end">
          {hasLinks ? (
            <>
              <button
                ref={toggleRef}
                type="button"
                className="kit-marketing-nav__toggle"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label={open ? 'Close menu' : 'Open menu'}
                onClick={() => setOpen((v) => !v)}
              >
                <span aria-hidden>{open ? '×' : '☰'}</span>
              </button>

              <div
                id={menuId}
                ref={panelRef}
                className={[
                  'kit-marketing-nav__links',
                  open ? 'kit-marketing-nav__links--open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {links.map(renderLink)}
              </div>
            </>
          ) : null}

          {cta ? <div className="kit-marketing-nav__cta">{cta}</div> : null}
        </div>
      </div>

      {open && hasLinks ? (
        <button
          type="button"
          className="kit-marketing-nav__backdrop"
          aria-label="Close menu"
          onClick={close}
        />
      ) : null}
    </nav>
  );
}
