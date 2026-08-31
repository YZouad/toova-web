import { proportionalSizesFromMaxSide } from '../../lib/uniformItemSize';
import { planBounds } from '../../lib/roomGeometry';
import { useStore } from '../../store';

export interface ActionSheetProps {
  onEditDetails: () => void;
  onDismiss?: () => void;
  detailLabel?: string;
}

export function ActionSheet({
  onEditDetails,
  onDismiss,
  detailLabel = 'Edit details',
}: ActionSheetProps) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const updateRotation = useStore((s) => s.updateRotation);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);
  const select = useStore((s) => s.select);

  if (!item) return null;

  const isHanging = item.kind === 'hanging';
  const canSize = !isHanging && (item.kind !== 'imported' || !!item.importedNaturalSize);
  const maxSide = Math.max(item.size[0], item.size[1], item.size[2]);
  const maxFootprint = Math.max(planBounds(roomGeometry).width, planBounds(roomGeometry).depth, 200);
  const maxElevation = Math.max(0, roomGeometry.height - item.size[1]);
  const elev = Math.round(item.position[1]);
  const dims = `${Math.round(item.size[0])}×${Math.round(item.size[2])}×${Math.round(item.size[1])}″`;

  return (
    <>
      <button
        type="button"
        className="dg-scrim"
        aria-label="Dismiss"
        onClick={() => {
          onDismiss?.();
          select(null);
        }}
      />
      <div className="dg-action-sheet" role="dialog" aria-label="Piece actions">
        <div className="dg-action-sheet__handle" aria-hidden />
        <div className="dg-action-sheet__head">
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: item.tintColor ?? '#C9B391',
              flex: 'none',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '600 15px/1.1 var(--font-sans)', color: 'var(--ink-0)' }}>
              {item.label}
            </div>
            <div className="dg-row__meta">{dims}</div>
          </div>
        </div>

        <div className="dg-action-sheet__body">
          {canSize ? (
            <div>
              <div className="dg-row dg-row--between" style={{ padding: '0 0 6px', minHeight: 0 }}>
                <span className="dg-row__label">Size</span>
                <span className="dg-row__meta">{Math.round(maxSide)}″</span>
              </div>
              <input
                type="range"
                min={4}
                max={maxFootprint}
                step={0.5}
                value={maxSide}
                onChange={(e) =>
                  setItemSize(
                    item.id,
                    proportionalSizesFromMaxSide(item.size, Number(e.target.value)),
                  )
                }
                aria-label="Uniform size"
              />
            </div>
          ) : null}

          {!isHanging ? (
            <div>
              <div className="dg-row dg-row--between" style={{ padding: '0 0 6px', minHeight: 0 }}>
                <span className="dg-row__label">Height</span>
                <span className="dg-row__meta">{elev === 0 ? 'On floor' : `${elev}″`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={maxElevation}
                step={1}
                value={elev}
                onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
                aria-label="Height off floor"
              />
            </div>
          ) : null}

          <div className="dg-action-sheet__row">
            {!isHanging ? (
              <>
                <button
                  type="button"
                  onClick={() => updateRotation(item.id, item.rotationY + (15 * Math.PI) / 180)}
                >
                  Rotate
                </button>
                <button type="button" onClick={() => duplicateItem(item.id)}>
                  Duplicate
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                removeItem(item.id);
                onDismiss?.();
              }}
            >
              Remove
            </button>
          </div>

          <button type="button" className="dg-action-sheet__primary" onClick={onEditDetails}>
            {detailLabel}
          </button>
        </div>
      </div>
    </>
  );
}
