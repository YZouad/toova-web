import type { CSSProperties, ReactNode } from 'react';

export type AppRailItemId = string;

export interface AppRailItem {
  id: AppRailItemId;
  label: string;
  glyph: string;
}

export interface AppRailProps {
  items?: AppRailItem[];
  active?: AppRailItemId | null;
  onNavigate?: (id: AppRailItemId) => void;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Vertical 64px app rail — mono glyphs + labels; active item has accent edge. */
export function AppRail({
  items = [],
  active,
  onNavigate,
  footer,
  className,
  style,
}: AppRailProps) {
  return (
    <nav
      className={['kit-app-rail', className].filter(Boolean).join(' ')}
      style={style}
      aria-label="App"
    >
      {items.map((it) => {
        const on = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            className={['kit-app-rail__item', on ? 'kit-app-rail__item--active' : '']
              .filter(Boolean)
              .join(' ')}
            title={it.label}
            onClick={() => onNavigate?.(it.id)}
          >
            <span className="kit-app-rail__glyph">{it.glyph}</span>
            <span className="kit-app-rail__label">{it.label}</span>
          </button>
        );
      })}
      {footer ? <div className="kit-app-rail__footer">{footer}</div> : null}
    </nav>
  );
}
