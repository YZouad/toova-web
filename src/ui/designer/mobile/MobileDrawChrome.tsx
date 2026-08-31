import { useStore } from '../../../store';

/**
 * Phone draw mode — top instruction card + bottom Cancel / Undo / Finish bar (52px).
 * Hidden when not drawing hanging lights or leaves.
 */
export function MobileDrawChrome() {
  const hangingDraft = useStore((s) => s.hangingDraft);
  const designerTool = useStore((s) => s.designerTool);
  const popHangingAnchor = useStore((s) => s.popHangingAnchor);
  const cancelHangingDraft = useStore((s) => s.cancelHangingDraft);
  const finishHangingDraft = useStore((s) => s.finishHangingDraft);

  const drawing =
    hangingDraft != null ||
    designerTool === 'hanging-leaves' ||
    designerTool === 'hanging-lights';

  if (!drawing) return null;

  const kind =
    hangingDraft?.kind ?? (designerTool === 'hanging-leaves' ? 'leaves' : 'lights');
  const title =
    kind === 'leaves' ? 'Drawing hanging leaves' : 'Drawing hanging lights';
  const swatch = kind === 'leaves' ? '#8A8478' : '#E8C27A';
  const count = hangingDraft?.anchors.length ?? 0;
  const canFinish = count >= 2;
  const canUndo = count > 0;

  return (
    <>
      <div className="dgm-draw-card" role="status">
        <div className="dgm-draw-card__head">
          <span className="dgm-draw-card__swatch" style={{ background: swatch }} aria-hidden />
          <span className="dgm-draw-card__title">{title}</span>
          <span className="dgm-draw-card__count">
            {count} {count === 1 ? 'anchor' : 'anchors'}
          </span>
        </div>
        <p className="dgm-draw-card__hint">
          Tap walls or ceiling to place anchors. Drag with one finger to look around.
        </p>
      </div>

      <div className="dgm-draw-bar" role="toolbar" aria-label="Draw actions">
        <button type="button" className="dgm-draw-bar__btn" onClick={() => cancelHangingDraft()}>
          Cancel
        </button>
        <button
          type="button"
          className="dgm-draw-bar__btn"
          disabled={!canUndo}
          onClick={() => popHangingAnchor()}
        >
          Undo
        </button>
        <button
          type="button"
          className={`dgm-draw-bar__btn dgm-draw-bar__btn--primary${canFinish ? '' : ' is-disabled'}`}
          disabled={!canFinish}
          onClick={() => finishHangingDraft()}
        >
          Finish
        </button>
      </div>
    </>
  );
}
