import { useEffect, useId, useRef, useState } from 'react';
import { AppRail, Logo, type AppShellNavId } from './kit';

const BASE = [
  { id: 'home' as const, label: 'Home', glyph: '⌂' },
  { id: 'rooms' as const, label: 'Rooms', glyph: '▦' },
  { id: 'models' as const, label: 'Models', glyph: '◇' },
  { id: 'gallery' as const, label: 'Gallery', glyph: '◫' },
  { id: 'ar' as const, label: 'AR', glyph: '◈' },
];

interface AppRailChromeProps {
  active: AppShellNavId | null;
  showAdmin?: boolean;
  profileInitials: string;
  onNavigate: (id: AppShellNavId) => void;
  onProfile?: () => void;
  onLogout?: () => void;
}

/** Fixed left rail (desktop) / hamburger drawer (phone) for marketing surfaces when signed in. */
export function AppRailChrome({
  active,
  showAdmin,
  profileInitials,
  onNavigate,
  onProfile,
  onLogout,
}: AppRailChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const items = showAdmin
    ? [...BASE, { id: 'admin' as const, label: 'Admin', glyph: '⚙' }]
    : BASE;

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

  const handleNavigate = (id: string) => {
    onNavigate(id as AppShellNavId);
    closeMenu();
  };

  const footer = (
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
      <Logo size={22} wordmark={false} onClick={() => handleNavigate('home')} />
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
    <>
      <AppRail
        className="kit-app-rail--overlay kit-app-rail--desktop"
        active={active}
        items={items}
        onNavigate={handleNavigate}
        footer={footer}
      />

      <button
        ref={toggleRef}
        type="button"
        className="kit-app-rail-chrome__menu-btn"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span aria-hidden>☰</span>
      </button>

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
        className={['kit-app-shell__drawer', 'kit-app-shell__drawer--overlay', menuOpen ? 'kit-app-shell__drawer--open' : '']
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
          items={items}
          onNavigate={handleNavigate}
          footer={footer}
        />
      </aside>
    </>
  );
}
