import { useCallback, useState } from 'react';
import {
  type FloorPlan,
  type FloorPlanUnderlay,
  defaultRectanglePlan,
  isValidFloorPlan,
  serializeFloorPlan,
  validateFloorPlan,
} from '../lib/floorPlanGeometry';
import type { Item } from '../store';
import { itemsFitPlan } from '../interaction/collision';
import {
  FloorPlanEditor,
  type FloorPlanIngestReview,
} from './FloorPlanEditor';

interface FloorPlanSetupProps {
  roomName: string;
  mode: 'create' | 'edit';
  initialPlan?: FloorPlan;
  furnitureItems?: Item[];
  underlay?: FloorPlanUnderlay | null;
  ingestReview?: FloorPlanIngestReview | null;
  onCancel: () => void;
  onContinue: (plan: FloorPlan) => void | Promise<void>;
  continuing?: boolean;
}

export function FloorPlanSetup({
  roomName,
  mode,
  initialPlan,
  furnitureItems,
  underlay: initialUnderlay = null,
  ingestReview = null,
  onCancel,
  onContinue,
  continuing = false,
}: FloorPlanSetupProps) {
  const [plan, setPlan] = useState<FloorPlan>(() => initialPlan ?? defaultRectanglePlan());
  const [underlay, setUnderlay] = useState<FloorPlanUnderlay | null>(initialUnderlay);
  const [scaleConfirmed, setScaleConfirmed] = useState(
    () => !ingestReview?.scaleNeedsConfirmation,
  );
  const [error, setError] = useState<string | null>(null);

  const handleContinue = useCallback(async () => {
    setError(null);
    if (ingestReview?.scaleNeedsConfirmation && !scaleConfirmed) {
      setError('Confirm the plan scale first: use Set scale, pick a wall, and enter its real length.');
      return;
    }
    const normalized = serializeFloorPlan(plan);
    if (!isValidFloorPlan(normalized)) {
      const issues = validateFloorPlan(normalized);
      setError(issues[0]?.message ?? 'Complete the floor plan before continuing.');
      return;
    }
    if (furnitureItems && furnitureItems.length > 0) {
      const outside = itemsFitPlan(furnitureItems, normalized);
      if (outside.length > 0) {
        setError(
          `${outside.length} piece(s) would be outside the new outline (${outside.map((i) => i.label).join(', ')}). Reposition them in 3D first.`,
        );
        return;
      }
    }
    try {
      await onContinue(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the floor plan.');
    }
  }, [furnitureItems, ingestReview?.scaleNeedsConfirmation, onContinue, plan, scaleConfirmed]);

  return (
    <div className="fp-setup-page">
      <header className="fp-setup-header">
        <button type="button" className="fp-setup-back" onClick={onCancel}>
          <span className="fp-setup-back-icon" aria-hidden>←</span>
          {mode === 'create' ? 'Back' : 'Cancel'}
        </button>
        <div className="fp-setup-heading">
          <h1 className="fp-setup-title">
            {mode === 'create'
              ? underlay
                ? 'Review imported floor plan'
                : 'Draw your floor plan'
              : 'Edit floor plan'}
          </h1>
          <p className="fp-setup-sub">{roomName}</p>
        </div>
        <button
          type="button"
          className="tv-btn-primary fp-setup-continue"
          disabled={continuing}
          onClick={() => void handleContinue()}
        >
          {continuing ? 'Saving…' : mode === 'create' ? 'Continue to 3D' : 'Save floor plan'}
        </button>
      </header>

      {error ? <div className="tv-banner-error fp-setup-error" role="alert">{error}</div> : null}

      <FloorPlanEditor
        plan={plan}
        onChange={setPlan}
        furnitureOverlay={furnitureItems}
        readOnlyFurniture
        underlay={underlay}
        onUnderlayChange={setUnderlay}
        ingestReview={ingestReview}
        scaleConfirmed={scaleConfirmed}
        onScaleConfirmedChange={setScaleConfirmed}
      />
    </div>
  );
}
