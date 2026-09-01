import { proportionalSizesFromMaxSide } from '../../lib/uniformItemSize';
import { planBounds } from '../../lib/roomGeometry';
import { useStore } from '../../store';
import { IconDuplicate, IconTrash } from './icons';

export interface ContextBarProps {
  onEditDetails: () => void;
  detailLabel?: string;
}

export function ContextBar({ onEditDetails, detailLabel = 'Edit details' }: ContextBarProps) {
  const selectedId = useStore((s) => s.selectedId);
  const selectedIds = useStore((s) => s.selectedIds);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const updateRotation = useStore((s) => s.updateRotation);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);

  if (!item) return null;

  const multiCount = selectedIds.length;
  const displayName = multiCount > 1 ? `${multiCount} selected` : item.label;

  const isHanging = item.kind === 'hanging';
  const canSize = !isHanging && (item.kind !== 'imported' || !!item.importedNaturalSize);
  const maxSide = Math.max(item.size[0], item.size[1], item.size[2]);
  const maxFootprint = Math.max(planBounds(roomGeometry).width, planBounds(roomGeometry).depth, 200);
  const maxElevation = Math.max(0, roomGeometry.height - item.size[1]);
  const elev = Math.round(item.position[1]);
  const dims = `${Math.round(item.size[0])}×${Math.round(item.size[2])}×${Math.round(item.size[1])}″`;

  const nudgeRot = () => {
    const next = item.rotationY + (15 * Math.PI) / 180;
    updateRotation(item.id, next);
  };

  return (
    <div className="dg-context" data-tour-id="context" role="toolbar" aria-label="Selection actions">
      <div className="dg-context-id">
        <span
          className="dg-context-id__swatch"
          style={{ background: item.tintColor ?? '#C9B391' }}
        />
        <span className="dg-context-id__copy">
          <span className="dg-context-id__name">{displayName}</span>
          <span className="dg-context-id__meta">{dims}</span>
        </span>
      </div>

      {canSize ? (
        <>
          <div style={{ width: 1, height: 30, background: 'var(--rule-soft)', margin: '0 6px' }} />
          <div className="dg-context-group">
            <span className="dg-context-label">Size</span>
            <input
              type="range"
              min={4}
              max={maxFootprint}
              step={0.5}
              value={maxSide}
              onChange={(e) =>
                setItemSize(item.id, proportionalSizesFromMaxSide(item.size, Number(e.target.value)))
              }
              aria-label="Uniform size"
            />
            <span className="dg-context-stepper__value" style={{ minWidth: 36 }}>
              {Math.round(maxSide)}″
            </span>
          </div>
        </>
      ) : null}

      {!isHanging ? (
        <>
          <div style={{ width: 1, height: 30, background: 'var(--rule-soft)', margin: '0 6px' }} />
          <div className="dg-context-group">
            <span className="dg-context-label">Height</span>
            <div className="dg-context-stepper">
              <button
                type="button"
                aria-label="Lower 3 inches"
                disabled={elev <= 0}
                onClick={() => setItemElevation(item.id, Math.max(0, elev - 3))}
              >
                ↓
              </button>
              <span className="dg-context-stepper__value">{elev === 0 ? 'On floor' : `${elev}″ up`}</span>
              <button
                type="button"
                aria-label="Raise 3 inches"
                disabled={elev >= maxElevation}
                onClick={() => setItemElevation(item.id, Math.min(maxElevation, elev + 3))}
              >
                ↑
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div style={{ width: 1, height: 30, background: 'var(--rule-soft)', margin: '0 6px' }} />

      {!isHanging ? (
        <>
          <button type="button" className="dg-context-btn" onClick={nudgeRot}>
            Rotate
          </button>
          <button type="button" className="dg-context-btn" onClick={() => duplicateItem(item.id)}>
            <IconDuplicate />
            Duplicate
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="dg-context-btn is-danger"
        onClick={() => removeItem(item.id)}
      >
        <IconTrash />
        Remove
      </button>

      <div style={{ width: 1, height: 30, background: 'var(--rule-soft)', margin: '0 6px' }} />

      <button type="button" className="dg-context-btn is-primary" onClick={onEditDetails}>
        {detailLabel}
        <span className="dg-context-kbd">↵</span>
      </button>
    </div>
  );
}
