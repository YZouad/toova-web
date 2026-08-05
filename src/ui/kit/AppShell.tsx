import type { CSSProperties, ReactNode } from 'react';
import { AppRail, type AppRailItem, type AppRailItemId } from './AppRail';
import { Logo } from './Logo';
import { MonoMeta } from './MonoMeta';

export type AppShellNavId = 'home' | 'rooms' | 'gallery' | 'ar' | 'admin';

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
  className?: string;
  style?: CSSProperties;
}

const BASE_ITEMS: AppRailItem[] = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'rooms', label: 'Rooms', glyph: '▦' },
  { id: 'gallery', label: 'Gallery', glyph: '◫' },
  { id: 'ar', label: 'AR', glyph: '◈' },
];

/** Authenticated product chrome: left AppRail + header strip + main. */
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
  className,
  style,
}: AppShellProps) {
  const items: AppRailItem[] = showAdmin
    ? [...BASE_ITEMS, { id: 'admin', label: 'Admin', glyph: '⚙' }]
    : BASE_ITEMS;

  return (
    <div
      className={['kit-app-shell', 'toova-page', className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className="toova-paper" aria-hidden />
      <div className="kit-app-shell__frame">
        <AppRail
          active={active}
          onNavigate={(id) => onNavigate(id as AppShellNavId)}
          items={items}
          footer={
            <div className="kit-app-shell__rail-footer">
              <button
                type="button"
                className="kit-app-shell__avatar"
                onClick={onProfile}
                title="Profile"
                disabled={!onProfile}
              >
                {profileInitials}
              </button>
              <Logo
                size={16}
                wordmark={false}
                onClick={() => onNavigate('home')}
              />
              {onLogout ? (
                <button
                  type="button"
                  className="kit-app-shell__logout"
                  onClick={onLogout}
                  title="Log out"
                >
                  ⎋
                </button>
              ) : null}
            </div>
          }
        />
        <div className="kit-app-shell__body">
          <header className="kit-app-shell__header">
            <div className="kit-app-shell__title-row">
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
        </div>
      </div>
    </div>
  );
}

export type { AppRailItemId };
