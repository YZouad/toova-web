import { useStore } from '../../store';

export function DrawBanner() {
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
  const count = hangingDraft?.anchors.length ?? 0;
  const canFinish = count >= 2;
  const canUndo = count > 0;

  return (
    <div className="dg-draw-banner" role="status">
      <div className="dg-draw-banner__row">
        <span className="dg-draw-banner__title">{title}</span>
        <span className="dg-draw-banner__count">
          {count} {count === 1 ? 'anchor' : 'anchors'}
        </span>
      </div>
      <span className="dg-draw-banner__hint">
        Click walls or ceiling to place anchors. Drag to look around.
      </span>
      <div className="dg-draw-banner__actions">
        <span className="dg-draw-banner__meta">↵ finish · ⌫ undo point · esc cancel</span>
        <button
          type="button"
          className="dg-draw-banner__btn"
          disabled={!canUndo}
          onClick={() => popHangingAnchor()}
        >
          Undo point
        </button>
        <button
          type="button"
          className="dg-draw-banner__btn"
          onClick={() => cancelHangingDraft()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="dg-draw-banner__btn is-primary"
          disabled={!canFinish}
          onClick={() => finishHangingDraft()}
        >
          Finish
        </button>
      </div>
    </div>
  );
}
