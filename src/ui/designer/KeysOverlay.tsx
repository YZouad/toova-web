export interface KeysOverlayProps {
  open: boolean;
  onClose: () => void;
}

const MOVE_ROWS: { label: string; kbd: string }[] = [
  { label: 'Move around', kbd: 'WASD' },
  { label: 'Orbit the room', kbd: 'drag' },
  { label: 'Zoom', kbd: 'scroll' },
  { label: 'Pan', kbd: 'space + drag' },
  { label: 'Reset the view', kbd: '0' },
];

const PIECE_ROWS: { label: string; kbd: string }[] = [
  { label: 'Add a piece', kbd: 'N' },
  { label: 'Turn lamps on / off', kbd: 'L' },
  { label: 'Edit details', kbd: '↵' },
  { label: 'Rotate 15°', kbd: 'R' },
  { label: 'Duplicate / delete', kbd: '⌘D / ⌫' },
  { label: 'Command palette', kbd: '⌘K' },
  { label: 'Present mode', kbd: 'P' },
  { label: 'Keyboard shortcuts', kbd: '?' },
];

const APARTMENT_ROWS: { label: string; kbd: string }[] = [
  { label: 'Back to apartment', kbd: 'esc' },
  { label: 'Open room 1–9', kbd: '1-9' },
  { label: 'Previous / next room', kbd: '[ / ]' },
];

function KeysRow({ label, kbd }: { label: string; kbd: string }) {
  return (
    <div className="dg-keys-row">
      <span className="dg-keys-row__label">{label}</span>
      <span className="dg-keys-row__kbd">{kbd}</span>
    </div>
  );
}

function KeysColumn({ title, rows }: { title: string; rows: { label: string; kbd: string }[] }) {
  return (
    <div className="dg-keys-col">
      <span className="dg-keys-col__title">{title}</span>
      {rows.map((row) => (
        <KeysRow key={row.label} label={row.label} kbd={row.kbd} />
      ))}
    </div>
  );
}

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
          <KeysColumn title="Moving around" rows={MOVE_ROWS} />
          <KeysColumn title="Working with pieces" rows={PIECE_ROWS} />
        </div>
        <div className="dg-keys-band">
          <span className="dg-keys-col__title">Apartment</span>
          <div className="dg-keys-grid">
            <div className="dg-keys-col">
              {APARTMENT_ROWS.slice(0, 2).map((row) => (
                <KeysRow key={row.label} label={row.label} kbd={row.kbd} />
              ))}
            </div>
            <div className="dg-keys-col">
              {APARTMENT_ROWS.slice(2).map((row) => (
                <KeysRow key={row.label} label={row.label} kbd={row.kbd} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
