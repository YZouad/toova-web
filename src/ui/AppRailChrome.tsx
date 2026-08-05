import { AppRail, Logo, type AppShellNavId } from './kit';

const BASE = [
  { id: 'home' as const, label: 'Home', glyph: '⌂' },
  { id: 'rooms' as const, label: 'Rooms', glyph: '▦' },
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

/** Fixed left rail for marketing surfaces when the user is signed in. */
export function AppRailChrome({
  active,
  showAdmin,
  profileInitials,
  onNavigate,
  onProfile,
  onLogout,
}: AppRailChromeProps) {
  const items = showAdmin
    ? [...BASE, { id: 'admin' as const, label: 'Admin', glyph: '⚙' }]
    : BASE;

  return (
    <AppRail
      className="kit-app-rail--overlay"
      active={active}
      items={items}
      onNavigate={(id) => onNavigate(id as AppShellNavId)}
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
          <Logo size={16} wordmark={false} onClick={() => onNavigate('home')} />
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
  );
}
