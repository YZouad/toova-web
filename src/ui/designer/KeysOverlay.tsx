export interface KeysOverlayProps {
  open: boolean;
  onClose: () => void;
}

const MOVE_ROWS: { label: string; kbd: string }[] = [
  { label: 'Orbit the room', kbd: 'drag' },
  { label: 'Zoom', kbd: 'scroll' },
  { label: 'Pan', kbd: 'space + drag' },
  { label: 'Reset the view', kbd: '0' },
];

const PIECE_ROWS: { label: string; kbd: string }[] = [
  { label: 'Add a piece', kbd: 'A' },
  { label: 'Turn lamps on / off', kbd: 'L' },
  { label: 'Edit details', kbd: '↵' },
  { label: 'Rotate 15°', kbd: 'R' },
  { label: 'Duplicate / delete', kbd: '⌘D / ⌫' },
  { label: 'Command palette', kbd: '⌘K' },
  { label: 'Present mode', kbd: 'P' },
  { label: 'Keyboard shortcuts', kbd: '?' },
];

export function KeysOverlay({ open, onClose }: KeysOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="dg-keys"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dg-keys-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="dg-keys-header">
          <span className="dg-keys-header__title">Keyboard & mouse</span>
          <button type="button" className="dg-keys-esc" onClick={onClose}>
            ESC
          </button>
        </div>
        <div className="dg-keys-grid">
          <div className="dg-keys-col">
            <span
              style={{
                font: 'var(--type-mono-xs)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-6)',
              }}
            >
              Moving around
            </span>
            {MOVE_ROWS.map((row) => (
              <div key={row.label} className="dg-keys-row">
                <span className="dg-keys-row__label">{row.label}</span>
                <span className="dg-keys-row__kbd">{row.kbd}</span>
              </div>
            ))}
          </div>
          <div className="dg-keys-col">
            <span
              style={{
                font: 'var(--type-mono-xs)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-6)',
              }}
            >
              Working with pieces
            </span>
            {PIECE_ROWS.map((row) => (
              <div key={row.label} className="dg-keys-row">
                <span className="dg-keys-row__label">{row.label}</span>
                <span className="dg-keys-row__kbd">{row.kbd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
