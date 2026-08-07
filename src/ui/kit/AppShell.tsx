import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FeedbackModal, type FeedbackPageSource } from '../FeedbackModal';
import { AppRail, type AppRailItem, type AppRailItemId } from './AppRail';
import { Logo } from './Logo';
import { MonoMeta } from './MonoMeta';
import { SiteFooter } from './SiteFooter';

export type AppShellNavId = 'home' | 'rooms' | 'models' | 'gallery' | 'ar' | 'admin';

export interface AppShellProps {
  active: AppShellNavId;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  showAdmin?: boolean;
  profileInitials?: string;
  onNavigate: (id: AppShellNavId) => void;
  onProfile?: () => void;
  onLogout?: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
  feedbackPageSource?: FeedbackPageSource;
  /** Feedback modal user context when signed in. */
  feedbackEmail?: string;
  feedbackUserId?: string;
  className?: string;
  style?: CSSProperties;
}

const BASE_ITEMS: AppRailItem[] = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'rooms', label: 'Rooms', glyph: '▦' },
  { id: 'models', label: 'Models', glyph: '◇' },
  { id: 'gallery', label: 'Gallery', glyph: '◫' },
  { id: 'ar', label: 'AR', glyph: '◈' },
];

/** Authenticated product chrome: left AppRail (desktop) / hamburger drawer (phone). */
export function AppShell({
  active,
  title,
  meta,
  actions,
  children,
  showAdmin,
  profileInitials = '??',
  onNavigate,
  onProfile,
  onLogout,
  onContact,
  onPitchMadness,
  feedbackPageSource = 'dashboard',
  feedbackEmail,
  feedbackUserId,
  className,
  style,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const items: AppRailItem[] = showAdmin
    ? [...BASE_ITEMS, { id: 'admin', label: 'Admin', glyph: '⚙' }]
    : BASE_ITEMS;

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('nav-drawer-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('nav-drawer-open');
      toggleRef.current?.focus();
    };
  }, [menuOpen]);

  const handleNavigate = (id: AppRailItemId) => {
    onNavigate(id as AppShellNavId);
    closeMenu();
  };

  const railFooter = (
    <div className="kit-app-shell__rail-footer">
      <button
        type="button"
        className="kit-app-shell__avatar"
        onClick={() => {
          onProfile?.();
          closeMenu();
        }}
        title="Profile"
        disabled={!onProfile}
      >
        {profileInitials}
      </button>
      <Logo
        size={22}
        wordmark={false}
        onClick={() => handleNavigate('home')}
      />
      {onLogout ? (
        <button
          type="button"
          className="kit-app-shell__logout"
          onClick={() => {
            onLogout();
            closeMenu();
          }}
          title="Log out"
        >
          ⎋
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={['kit-app-shell', 'toova-page', className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className="toova-paper" aria-hidden />
      <div className="kit-app-shell__frame">
        <AppRail
          className="kit-app-rail--desktop"
          active={active}
          onNavigate={handleNavigate}
          items={items}
          footer={railFooter}
        />

        {menuOpen ? (
          <button
            type="button"
            className="kit-app-shell__drawer-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
        ) : null}

        <aside
          id={menuId}
          className={['kit-app-shell__drawer', menuOpen ? 'kit-app-shell__drawer--open' : '']
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!menuOpen}
        >
          <div className="kit-app-shell__drawer-head">
            <Logo size={28} onClick={() => handleNavigate('home')} />
            <button
              type="button"
              className="kit-app-shell__drawer-close"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              ×
            </button>
          </div>
          <AppRail
            className="kit-app-rail--drawer"
            active={active}
            onNavigate={handleNavigate}
            items={items}
            footer={railFooter}
          />
        </aside>

        <div className="kit-app-shell__body">
          <header className="kit-app-shell__header">
            <div className="kit-app-shell__title-row">
              <button
                ref={toggleRef}
                type="button"
                className="kit-app-shell__menu-btn"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span aria-hidden>☰</span>
              </button>
              <span className="kit-app-shell__title">{title}</span>
              {meta ? (
                <MonoMeta size="sm" upper tone="subtle">
                  {meta}
                </MonoMeta>
              ) : null}
            </div>
            {actions ? (
              <div className="kit-app-shell__actions">{actions}</div>
            ) : null}
          </header>
          <main className="kit-app-shell__main">{children}</main>
          <SiteFooter
            className="kit-app-shell__site-footer"
            onContact={onContact}
            onPitchMadness={onPitchMadness}
            onFeedback={() => setFeedbackOpen(true)}
            onAdmin={showAdmin ? () => onNavigate('admin') : undefined}
          />
        </div>
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource={feedbackPageSource}
        defaultEmail={feedbackEmail ?? ''}
        userId={feedbackUserId}
      />
    </div>
  );
}

export type { AppRailItemId };
