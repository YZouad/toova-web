import { useMemo } from 'react';
import { useStore } from '../../store';
import { PanelShell } from './PanelShell';

export interface PiecesPanelProps {
  compact?: boolean;
  onClose: () => void;
}

function kindMeta(kind: string): string {
  switch (kind) {
    case 'hanging':
      return 'hanging';
    case 'light':
      return 'light';
    case 'imported':
      return 'imported';
    case 'bed':
      return 'bed';
    default:
      return kind;
  }
}

export function PiecesPanel({ compact, onClose }: PiecesPanelProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const removeItem = useStore((s) => s.removeItem);

  const list = useMemo(
    () => order.map((id) => items[id]).filter((it): it is NonNullable<typeof it> => !!it),
    [items, order],
  );

  return (
    <PanelShell
      compact={compact}
      sheetClass="dg-sheet--pieces"
      mobileHeight="short"
      eyebrow={list.length === 0 ? 'Empty room' : `${list.length} piece${list.length === 1 ? '' : 's'} in this room`}
      title="Pieces"
      onClose={onClose}
    >
      {list.length === 0 ? (
        <div style={{ padding: '28px 8px', textAlign: 'center' }}>
          <p style={{ font: '500 17px/1.2 var(--font-serif)', color: 'var(--ink-0)', margin: '0 0 8px' }}>
            Nothing placed yet
          </p>
          <p style={{ font: '400 13px/1.5 var(--font-sans)', color: 'var(--ink-4)', margin: 0 }}>
            Open Add to bring furniture into the room.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.map((it) => {
            const active = selectedId === it.id;
            const dims = `${Math.round(it.size[0])}×${Math.round(it.size[2])}×${Math.round(it.size[1])}″`;
            return (
              <div
                key={it.id}
                className={`dg-row${active ? ' is-selected' : ''}`}
                style={{ gap: 4, padding: 0, minHeight: 0, borderRadius: 9 }}
              >
                <button
                  type="button"
                  className="dg-row dg-row--interactive"
                  style={{ flex: 1, minWidth: 0, background: 'transparent' }}
                  onClick={() => {
                    select(it.id);
                    onClose();
                  }}
                >
                  <span
                    className="dg-row__swatch"
                    style={{ background: it.tintColor ?? '#C9B391' }}
                    aria-hidden
                  />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span
                      className="dg-row__label"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {it.label?.trim() || it.kind}
                    </span>
                    <span className="dg-row__meta">
                      {dims} · {kindMeta(it.kind)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="dg-footer-btn is-ghost"
                  style={{
                    minHeight: 32,
                    padding: '6px 10px',
                    marginRight: 4,
                    color: 'var(--danger)',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                  aria-label={`Remove ${it.label}`}
                  onClick={() => removeItem(it.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
