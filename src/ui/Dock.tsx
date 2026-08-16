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
        <div className="tv-dock-icon tv-dock-icon--ink" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
            <path d="M15 16l4-4-4-4" />
            <path d="M19 12H10" />
          </svg>
        </div>
        <span className="tv-dock-label">Log out</span>
      </button>
    </div>
  );
}
