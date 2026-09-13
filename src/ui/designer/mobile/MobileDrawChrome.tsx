import { useEffect } from 'react';
import { formatLength } from '../../../lib/floorPlanGeometry';
import { activeMeasureEndpoint } from '../../../lib/measureDraftState';
import { measureBannerHint, measureEndpointLabel } from '../../../lib/measureInstruction';
import {
  measureFieldLabel,
  measureImportAcceptInches,
  type MeasureAcceptField,
  type MeasureVec3,
} from '../../../lib/measureDistance';
import {
  hangingKindFromDesignerTool,
  isHangingDesignerTool,
  isMeasureDesignerTool,
  useStore,
} from '../../../store';
import type { HangingDecorKind } from '../../../lib/hangingDecorGeometry';

function drawMeta(kind: HangingDecorKind): { title: string; swatch: string } {
  if (kind === 'leaves') return { title: 'Drawing hanging leaves', swatch: '#8A8478' };
  if (kind === 'led-strip') return { title: 'Drawing LED strip', swatch: '#4d96ff' };
  return { title: 'Drawing fairy lights', swatch: '#E8C27A' };
}

function importMeasurePreview(
  a: MeasureVec3,
  b: MeasureVec3,
  field: MeasureAcceptField,
): string {
  const inches = measureImportAcceptInches(a, b, field, true);
  return `${measureFieldLabel(field)} ${formatLength(inches, 'ft-in')}`;
}

export interface MobileDrawChromeProps {
  importMeasuring?: boolean;
  onCancelMeasureFromImport?: () => void;
  onAcceptMeasureFromImport?: () => void;
}

/**
 * Phone draw mode — top instruction card + bottom Cancel / Undo / Finish bar (52px).
 */
export function MobileDrawChrome({
  importMeasuring = false,
  onCancelMeasureFromImport,
  onAcceptMeasureFromImport,
}: MobileDrawChromeProps) {
  const hangingDraft = useStore((s) => s.hangingDraft);
  const measureDraft = useStore((s) => s.measureDraft);
  const roomHeight = useStore((s) => s.roomGeometry.height);
  const designerTool = useStore((s) => s.designerTool);
  const popHangingAnchor = useStore((s) => s.popHangingAnchor);
  const cancelHangingDraft = useStore((s) => s.cancelHangingDraft);
  const finishHangingDraft = useStore((s) => s.finishHangingDraft);
  const cancelMeasure = useStore((s) => s.cancelMeasure);
  const finishMeasure = useStore((s) => s.finishMeasure);
  const setMeasureEndpoint = useStore((s) => s.setMeasureEndpoint);

  const measuring = isMeasureDesignerTool(designerTool);
  const drawing =
    hangingDraft != null || isHangingDesignerTool(designerTool) || measuring;

  const canAccept = measureDraft != null && !measureDraft.draggingEndpoint;

  useEffect(() => {
    if (!importMeasuring || !canAccept) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onAcceptMeasureFromImport?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [importMeasuring, canAccept, onAcceptMeasureFromImport]);

  if (!drawing) return null;

  if (measuring && measureDraft) {
    const field = measureDraft.acceptField;
    const importPreview =
      importMeasuring && field
        ? importMeasurePreview(measureDraft.a, measureDraft.b, field)
        : null;
    const hint = measureBannerHint(measureDraft);
    const activePoint = activeMeasureEndpoint(measureDraft);
    const activeEndpoint = measureDraft.activeEndpoint;

    const onCancel = () => {
      if (importMeasuring) onCancelMeasureFromImport?.();
      else cancelMeasure();
    };

    const onPrimary = () => {
      if (importMeasuring) onAcceptMeasureFromImport?.();
      else finishMeasure();
    };

    const title = field
      ? `Measuring ${measureFieldLabel(field).toLowerCase()}`
      : 'Measuring in the room';

    return (
      <>
        <div className="dgm-draw-card" role="status">
          <div className="dgm-draw-card__head">
            <span className="dgm-draw-card__swatch" style={{ background: '#e8a84a' }} aria-hidden />
            <span className="dgm-draw-card__title">{title}</span>
            <span className="dgm-draw-card__count">2</span>
          </div>
          <p className="dgm-draw-card__hint">
            {hint}
            {importPreview ? ` · Will fill: ${importPreview}` : ''}
          </p>
          {activePoint && activeEndpoint ? (
            <label className="dgm-measure-height">
              <span className="dgm-measure-height__label">
                {measureEndpointLabel(activeEndpoint)} · {Math.round(activePoint[1])}″
              </span>
              <input
                type="range"
                min={0}
                max={roomHeight}
                step={1}
                value={Math.round(activePoint[1])}
                onChange={(e) =>
                  setMeasureEndpoint(activeEndpoint, [
                    activePoint[0],
                    Number(e.target.value),
                    activePoint[2],
                  ])
                }
              />
            </label>
          ) : null}
        </div>

        <div className="dgm-draw-bar" role="toolbar" aria-label="Measure actions">
          <button type="button" className="dgm-draw-bar__btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`dgm-draw-bar__btn dgm-draw-bar__btn--primary${canAccept ? '' : ' is-disabled'}`}
            disabled={!canAccept}
            onClick={onPrimary}
          >
            {importMeasuring ? 'Accept' : 'Done'}
          </button>
        </div>
      </>
    );
  }

  const kind = hangingDraft?.kind ?? hangingKindFromDesignerTool(designerTool) ?? 'lights';
  const { title, swatch } = drawMeta(kind);
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
