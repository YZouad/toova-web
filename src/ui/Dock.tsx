/** @deprecated Replaced by AppRail / AppShell. Kept for reference only. */
export type DockNav = 'home' | 'rooms' | 'gallery' | 'admin' | 'ar';

interface DockProps {
  active: DockNav | null;
  showAdmin: boolean;
  onNavigate: (nav: DockNav) => void;
  onLogout: () => void;
}

const ITEMS: { id: DockNav; label: string; glyph: string }[] = [
  { id: 'home', label: 'Home', glyph: '⌂' },
  { id: 'rooms', label: 'Rooms', glyph: '▦' },
  { id: 'gallery', label: 'Gallery', glyph: '◫' },
  { id: 'ar', label: 'AR', glyph: '◈' },
];

/** Floating nav — no magnifying scale; square tiles + mono labels. */
export function Dock({ active, showAdmin, onNavigate, onLogout }: DockProps) {
  return (
    <div className="tv-dock tv-dock--poster" role="navigation" aria-label="App">
      {ITEMS.map((d) => {
        const on = active === d.id;
        return (
          <button
            key={d.id}
            type="button"
            className={`tv-dock-item${on ? ' tv-dock-item--active' : ''}`}
            title={d.label}
            onClick={() => onNavigate(d.id)}
          >
            <div className="tv-dock-icon">{d.glyph}</div>
            <span className="tv-dock-label">{d.label}</span>
          </button>
        );
      })}

      {showAdmin ? (
        <button
          type="button"
          className={`tv-dock-item${active === 'admin' ? ' tv-dock-item--active' : ''}`}
          title="Admin"
          onClick={() => onNavigate('admin')}
        >
          <div className="tv-dock-icon">⚙</div>
          <span className="tv-dock-label">Admin</span>
        </button>
      ) : null}

      <div className="tv-dock-divider" />

      <button type="button" className="tv-dock-item" title="Log out" onClick={onLogout}>
        <div className="tv-dock-icon tv-dock-icon--ink">⎋</div>
        <span className="tv-dock-label">Log out</span>
      </button>
    </div>
  );
}
