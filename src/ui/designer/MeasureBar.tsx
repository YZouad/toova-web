import { useEffect } from 'react';
import { formatLength } from '../../lib/floorPlanGeometry';
import {
  measureDistances,
  measureFieldLabel,
  measureImportAcceptInches,
  type MeasureAcceptField,
  type MeasureVec3,
} from '../../lib/measureDistance';
import { measureBannerHint } from '../../lib/measureInstruction';
import { isMeasureDesignerTool, useStore } from '../../store';

function importMeasurePreview(
  a: MeasureVec3,
  b: MeasureVec3,
  field: MeasureAcceptField,
): string {
  const inches = measureImportAcceptInches(a, b, field);
  return `${measureFieldLabel(field)} ${formatLength(inches, 'ft-in')}`;
}

export interface MeasureBarProps {
  importMeasuring?: boolean;
  onCancelMeasureFromImport?: () => void;
  onAcceptMeasureFromImport?: () => void;
}

export function MeasureBar({
  importMeasuring = false,
  onCancelMeasureFromImport,
  onAcceptMeasureFromImport,
}: MeasureBarProps) {
  const designerTool = useStore((s) => s.designerTool);
  const measurements = useStore((s) => s.measurements);
  const pending = useStore((s) => s.measurePending);
  const measureSnap = useStore((s) => s.measureSnap);
  const importField = useStore((s) => s.measureImportField);
  const cancelMeasure = useStore((s) => s.cancelMeasure);
  const finishMeasure = useStore((s) => s.finishMeasure);
  const cancelMeasurePending = useStore((s) => s.cancelMeasurePending);
  const clearMeasurements = useStore((s) => s.clearMeasurements);
  const toggleMeasureSnap = useStore((s) => s.toggleMeasureSnap);

  const measuring = isMeasureDesignerTool(designerTool);
  const last = measurements[measurements.length - 1];
  const canAcceptImport = importMeasuring && last != null && !pending;

  useEffect(() => {
    if (!importMeasuring || !canAcceptImport) return;
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
  }, [importMeasuring, canAcceptImport, onAcceptMeasureFromImport]);

  if (!measuring && !importMeasuring) return null;

  const importPreview =
    importMeasuring && importField && last
      ? importMeasurePreview(last.a, last.b, importField)
      : null;
  const hint = measureBannerHint({
    hasPending: pending != null,
    acceptField: importField,
    count: measurements.length,
  });

  const onCancel = () => {
    if (importMeasuring) onCancelMeasureFromImport?.();
    else cancelMeasure();
  };

  const onDone = () => {
    if (importMeasuring) onAcceptMeasureFromImport?.();
    else finishMeasure();
  };

  const livePending = last
    ? formatLength(measureDistances(last.a, last.b).diagonal3d, 'ft-in')
    : null;

  return (
    <div className="dg-measure-bar" role="status">
      <div className="dg-measure-bar__row">
        <span className="dg-measure-bar__title">
          {importField
            ? `Measuring ${measureFieldLabel(importField).toLowerCase()}`
            : 'Measure'}
        </span>
        <span className="dg-measure-bar__count">
          {measurements.length} {measurements.length === 1 ? 'tape' : 'tapes'}
        </span>
      </div>
      <span className="dg-measure-bar__hint">
        {hint}
        {!importMeasuring && livePending ? ` · ${livePending}` : ''}
        {importPreview ? ` · Will fill: ${importPreview}` : ''}
      </span>
      <div className="dg-measure-bar__actions">
        <button
          type="button"
          className={`dg-measure-bar__chip${measureSnap ? ' is-active' : ''}`}
          aria-pressed={measureSnap}
          onClick={() => toggleMeasureSnap()}
        >
          Snap{measureSnap ? ' on' : ' off'}
        </button>
        {pending ? (
          <button
            type="button"
            className="dg-measure-bar__btn"
            onClick={() => cancelMeasurePending()}
          >
            Undo point
          </button>
        ) : null}
        {measurements.length > 0 && !importMeasuring ? (
          <button
            type="button"
            className="dg-measure-bar__btn"
            onClick={() => clearMeasurements()}
          >
            Clear all
          </button>
        ) : null}
        <span className="dg-measure-bar__meta">
          {importMeasuring ? '↵ accept · esc cancel' : '↵ done · esc cancel'}
        </span>
        <button type="button" className="dg-measure-bar__btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="dg-measure-bar__btn is-primary"
          disabled={importMeasuring ? !canAcceptImport : false}
          onClick={onDone}
        >
          {importMeasuring ? 'Accept' : 'Done'}
        </button>
      </div>
    </div>
  );
}
