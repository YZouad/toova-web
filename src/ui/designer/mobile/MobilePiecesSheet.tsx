import { useMemo } from 'react';
import { useStore } from '../../../store';
import { MobileSheet } from './MobileSheet';

export interface MobilePiecesSheetProps {
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

function pieceMeta(it: { kind: string; position: [number, number, number]; size: [number, number, number] }): string {
  const dims = `${Math.round(it.size[0])}×${Math.round(it.size[2])}×${Math.round(it.size[1])}″`;
  const elev = Math.round(it.position[1]);
  const elevLabel = elev > 0 ? `${elev}″ up` : 'floor';
  return `${dims} · ${elevLabel} · ${kindMeta(it.kind)}`;
}

export function MobilePiecesSheet({ onClose }: MobilePiecesSheetProps) {
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
    <MobileSheet
      kind="pieces"
      title="Pieces"
      onClose={onClose}
      headerEnd={
        <span className="dgm-sheet-count">
          {list.length === 0 ? 'Empty' : `${list.length} in room`}
        </span>
      }
    >
      {list.length === 0 ? (
        <div className="dgm-empty">
          <p className="dgm-empty__title">Nothing placed yet</p>
          <p className="dgm-empty__hint">Open Add to bring furniture into the room.</p>
        </div>
      ) : (
        <ul className="dgm-piece-list">
          {list.map((it) => {
            const active = selectedId === it.id;
            return (
              <li key={it.id} className={`dgm-piece-row${active ? ' is-selected' : ''}`}>
                <button
                  type="button"
                  className="dgm-piece-row__main"
                  onClick={() => {
                    select(it.id);
                    onClose();
                  }}
                >
                  <span
                    className="dgm-piece-row__swatch"
                    style={{ background: it.tintColor ?? '#C9B391' }}
                    aria-hidden
                  />
                  <span className="dgm-piece-row__copy">
                    <span className="dgm-piece-row__name">{it.label?.trim() || it.kind}</span>
                    <span className="dgm-piece-row__meta">{pieceMeta(it)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="dgm-piece-row__remove"
                  aria-label={`Remove ${it.label}`}
                  onClick={() => removeItem(it.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </MobileSheet>
  );
}
