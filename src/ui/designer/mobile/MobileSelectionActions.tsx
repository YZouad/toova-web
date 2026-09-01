import { proportionalSizesFromMaxSide } from '../../../lib/uniformItemSize';
import { planBounds } from '../../../lib/roomGeometry';
import { useStore } from '../../../store';
import { IconDuplicate, IconTrash } from '../icons';

export interface MobileSelectionActionsProps {
  onEditDetails: () => void;
  onDismiss?: () => void;
  detailLabel?: string;
}

/**
 * Bottom action sheet when a piece is selected on phone.
 * Rotate lives on the in-scene HUD; height stepper sits in the action row.
 */
export function MobileSelectionActions({
  onEditDetails,
  onDismiss,
  detailLabel = 'Edit details',
}: MobileSelectionActionsProps) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
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
  const liftText = elev === 0 ? 'On floor' : `${elev}″ up`;

  const dismiss = () => {
    onDismiss?.();
    select(null);
  };

  return (
    <div
      className="dgm-action-sheet"
      role="region"
      aria-label="Piece actions"
      data-tour-id="context"
    >
      <div className="dgm-action-sheet__handle" aria-hidden />
      <div className="dgm-action-sheet__head">
        <span
          className="dgm-action-sheet__swatch"
          style={{ background: item.tintColor ?? '#C9B391' }}
          aria-hidden
        />
        <div className="dgm-action-sheet__id">
          <div className="dgm-action-sheet__name">{item.label}</div>
          <div className="dgm-action-sheet__meta">
            {dims} · {liftText}
          </div>
        </div>
        <button type="button" className="dgm-icon-btn" aria-label="Close" onClick={dismiss}>
          ×
        </button>
      </div>

      <div className="dgm-action-sheet__body">
        {canSize ? (
          <div className="dgm-action-sheet__size-row">
            <span className="dgm-action-sheet__size-label">Size</span>
            <input
              type="range"
              className="dgm-range dgm-range--inline"
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
            <span className="dgm-action-sheet__size-value">{Math.round(maxSide)}″</span>
          </div>
        ) : null}

        <div className="dgm-action-sheet__actions">
          {!isHanging ? (
            <>
              <div className="dgm-elev-stepper dgm-elev-stepper--action">
                <button
                  type="button"
                  className="dgm-elev-stepper__btn"
                  aria-label="Lower 3 inches"
                  disabled={elev <= 0}
                  onClick={() => setItemElevation(item.id, Math.max(0, elev - 3))}
                >
                  ↓
                </button>
                <span className="dgm-elev-stepper__value">{liftText}</span>
                <button
                  type="button"
                  className="dgm-elev-stepper__btn"
                  aria-label="Raise 3 inches"
                  disabled={elev >= maxElevation}
                  onClick={() => setItemElevation(item.id, Math.min(maxElevation, elev + 3))}
                >
                  ↑
                </button>
              </div>
              <button type="button" className="dgm-action-btn" onClick={() => duplicateItem(item.id)}>
                <IconDuplicate />
                <span>Copy</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="dgm-action-btn dgm-action-btn--danger"
            onClick={() => {
              removeItem(item.id);
              onDismiss?.();
            }}
          >
            <IconTrash />
            <span>Remove</span>
          </button>
        </div>

        <button type="button" className="dgm-action-sheet__primary" onClick={onEditDetails}>
          {detailLabel}
        </button>
      </div>
    </div>
  );
}
