import { useCallback, useRef, type MouseEvent } from 'react';

export type DockNav = 'home' | 'rooms' | 'admin' | 'ar';

interface DockProps {
  active: DockNav | null;
  showAdmin: boolean;
  onNavigate: (nav: DockNav) => void;
  onLogout: () => void;
}

const ITEMS: { id: DockNav; label: string; glyph: string; bg: string; color: string }[] = [
  { id: 'home', label: 'Home', glyph: '⌂', bg: 'var(--accent-bg)', color: 'var(--accent)' },
  { id: 'rooms', label: 'Rooms', glyph: '▦', bg: '#EDE5D8', color: 'var(--text-dark)' },
  { id: 'ar', label: 'AR', glyph: '◈', bg: '#EDE5D8', color: 'var(--text-dark)' },
];

export function Dock({ active, showAdmin, onNavigate, onLogout }: DockProps) {
  const dockRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const dock = dockRef.current;
    if (!dock) return;
    const items = dock.querySelectorAll<HTMLElement>('[data-dockitem]');
    const rect = dock.getBoundingClientRect();
    const x = e.clientX - rect.left;
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - rect.left;
      const dist = Math.abs(x - cx);
      const scale = Math.max(1, 1.6 - dist / 80);
      el.style.transform = `scale(${scale})`;
    });
  }, []);

  const handleLeave = useCallback(() => {
    const dock = dockRef.current;
    if (!dock) return;
    dock.querySelectorAll<HTMLElement>('[data-dockitem]').forEach((el) => {
      el.style.transform = 'scale(1)';
    });
  }, []);

  return (
    <div
      ref={dockRef}
      className="tv-dock"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {ITEMS.map((d) => (
        <button
          key={d.id}
          type="button"
          data-dockitem
          className="tv-dock-item"
          title={d.label}
          onClick={() => onNavigate(d.id)}
        >
          <div
            className="tv-dock-icon"
            style={{
              background: active === d.id ? 'var(--accent)' : d.bg,
              color: active === d.id ? '#fff' : d.color,
            }}
          >
            {d.glyph}
          </div>
          <span className="tv-dock-label" style={{ color: active === d.id ? 'var(--accent)' : undefined }}>
            {d.label}
          </span>
        </button>
      ))}

      {showAdmin ? (
        <button
          type="button"
          data-dockitem
          className="tv-dock-item"
          title="Admin"
          onClick={() => onNavigate('admin')}
        >
          <div
            className="tv-dock-icon"
            style={{
              background: active === 'admin' ? 'var(--accent)' : '#EDE5D8',
              color: active === 'admin' ? '#fff' : 'var(--text-dark)',
            }}
          >
            ⚙
          </div>
          <span className="tv-dock-label" style={{ color: active === 'admin' ? 'var(--accent)' : undefined }}>Admin</span>
        </button>
      ) : null}

      <div className="tv-dock-divider" />

      <button type="button" data-dockitem className="tv-dock-item" title="Log out" onClick={onLogout}>
        <div className="tv-dock-icon" style={{ background: '#2B2620', color: '#F4EEE4' }}>⎋</div>
        <span className="tv-dock-label">Log out</span>
      </button>
    </div>
  );
}
