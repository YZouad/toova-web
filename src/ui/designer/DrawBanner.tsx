import { useEffect } from 'react';
import { formatLength } from '../../lib/floorPlanGeometry';
import { activeMeasureEndpoint } from '../../lib/measureDraftState';
import { measureBannerHint, measureEndpointLabel } from '../../lib/measureInstruction';
import {
  measureDistances,
  measureFieldLabel,
  measureImportAcceptInches,
  type MeasureAcceptField,
  type MeasureVec3,
} from '../../lib/measureDistance';
import {
  hangingKindFromDesignerTool,
  isHangingDesignerTool,
  isMeasureDesignerTool,
  useStore,
} from '../../store';
import type { HangingDecorKind } from '../../lib/hangingDecorGeometry';

function drawTitle(kind: HangingDecorKind): string {
  if (kind === 'leaves') return 'Drawing hanging leaves';
  if (kind === 'led-strip') return 'Drawing LED strip';
  return 'Drawing fairy lights';
}

function importMeasurePreview(
  a: MeasureVec3,
  b: MeasureVec3,
  field: MeasureAcceptField,
): string {
  const inches = measureImportAcceptInches(a, b, field);
  return `${measureFieldLabel(field)} ${formatLength(inches, 'ft-in')}`;
}

export interface DrawBannerProps {
  importMeasuring?: boolean;
  onCancelMeasureFromImport?: () => void;
  onAcceptMeasureFromImport?: () => void;
}

export function DrawBanner({
  importMeasuring = false,
  onCancelMeasureFromImport,
  onAcceptMeasureFromImport,
}: DrawBannerProps) {
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
    const dist = measureDistances(measureDraft.a, measureDraft.b).diagonal3d;
    const liveValue = formatLength(dist, 'ft-in');
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
      <div className="dg-draw-banner" role="status">
        <div className="dg-draw-banner__row">
          <span className="dg-draw-banner__title">{title}</span>
          <span className="dg-draw-banner__count">2 points</span>
        </div>
        <span className="dg-draw-banner__hint">
          {hint}
          {!importMeasuring && liveValue ? ` · ${liveValue}` : ''}
          {importPreview ? ` · Will fill: ${importPreview}` : ''}
        </span>
        {activePoint && activeEndpoint ? (
          <label className="dg-measure-height">
            <span className="dg-measure-height__label">
              {measureEndpointLabel(activeEndpoint)} height · {Math.round(activePoint[1])}″
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
        <div className="dg-draw-banner__actions">
          <span className="dg-draw-banner__meta">
            {importMeasuring ? '↵ accept · esc cancel' : '↵ done · esc cancel'}
          </span>
          <button type="button" className="dg-draw-banner__btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dg-draw-banner__btn is-primary"
            disabled={!canAccept}
            onClick={onPrimary}
          >
            {importMeasuring ? 'Accept' : 'Done'}
          </button>
        </div>
      </div>
    );
  }

  const kind = hangingDraft?.kind ?? hangingKindFromDesignerTool(designerTool) ?? 'lights';
  const title = drawTitle(kind);
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
