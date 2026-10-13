import { formatLength, type FloorPlanOpening } from '../../lib/floorPlanGeometry';
import { useStore } from '../../store';
import { WindowCurtainEditor } from './WindowCurtainEditor';

export function WindowOpeningInspector({
  opening,
  compact,
  onClose,
}: {
  opening: FloorPlanOpening;
  compact?: boolean;
  onClose: () => void;
}) {
  const patchOpening = useStore((s) => s.patchOpening);
  const sizeLabel = `${formatLength(opening.width, 'ft-in')} × ${formatLength(opening.height, 'ft-in')}`;

  const shellClass = compact
    ? 'dg-mobile-sheet dg-mobile-sheet--mid'
    : 'dg-sheet dg-sheet--inspect';

  return (
    <>
      {compact ? (
        <button type="button" className="dg-scrim" aria-label="Close inspector" onClick={onClose} />
      ) : null}
      <aside className={shellClass} role="dialog" aria-modal="true" aria-label="Window">
        {compact ? <div className="dg-mobile-sheet__handle" aria-hidden /> : null}
        <div className="dg-sheet-header">
          <div className="dg-sheet-header__copy">
            <div className="dg-sheet-header__title">Window</div>
            <div className="dg-sheet-header__meta">{sizeLabel}</div>
          </div>
          <button type="button" className="dg-sheet-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dg-sheet-body">
          <WindowCurtainEditor
            openingId={opening.id}
            curtains={opening.curtains}
            onChange={(curtains) => patchOpening(opening.id, { curtains })}
          />
          <p className="dg-finish-photo__hint">
            Curtains stay attached to this window when you move or resize it in the floor plan editor.
          </p>
        </div>
      </aside>
    </>
  );
}
