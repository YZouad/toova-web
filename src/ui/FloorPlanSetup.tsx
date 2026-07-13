import { useCallback, useState } from 'react';
import {
  type FloorPlan,
  defaultRectanglePlan,
  isValidFloorPlan,
  serializeFloorPlan,
  validateFloorPlan,
} from '../lib/floorPlanGeometry';
import type { Item } from '../store';
import { itemsFitPlan } from '../interaction/collision';
import { FloorPlanEditor } from './FloorPlanEditor';

interface FloorPlanSetupProps {
  roomName: string;
  mode: 'create' | 'edit';
  initialPlan?: FloorPlan;
  furnitureItems?: Item[];
  onCancel: () => void;
  onContinue: (plan: FloorPlan) => void | Promise<void>;
  continuing?: boolean;
}

export function FloorPlanSetup({
  roomName,
  mode,
  initialPlan,
  furnitureItems,
  onCancel,
  onContinue,
  continuing = false,
}: FloorPlanSetupProps) {
  const [plan, setPlan] = useState<FloorPlan>(() => initialPlan ?? defaultRectanglePlan());
  const [error, setError] = useState<string | null>(null);

  const handleContinue = useCallback(async () => {
    setError(null);
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
  }, [furnitureItems, onContinue, plan]);

  return (
    <div className="fp-setup-page">
      <header className="fp-setup-header">
        <button type="button" className="fp-setup-back" onClick={onCancel}>
          ← {mode === 'create' ? 'Back' : 'Cancel'}
        </button>
        <div>
          <h1 className="fp-setup-title">{mode === 'create' ? 'Draw your floor plan' : 'Edit floor plan'}</h1>
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

      <p className="fp-setup-hint">
        Draw on the fixed canvas (about 8′×15′). Each square is 6″. Windows: click start, then end along a wall.
        Select a wall or opening and press Delete to remove it.
      </p>

      <FloorPlanEditor
        plan={plan}
        onChange={setPlan}
        furnitureOverlay={furnitureItems}
        readOnlyFurniture
      />
    </div>
  );
}
