import { describe, expect, it } from 'vitest';
import { spawnMeasureDraft } from './measureDraftState';
import { measureBannerHint } from './measureInstruction';
import { rectanglePlan } from './floorPlanGeometry';

describe('measureBannerHint', () => {
  it('tells the user to drag and adjust height when a point is selected', () => {
    const draft = spawnMeasureDraft(rectanglePlan(120, 180), null);
    expect(measureBannerHint(draft)).toBe(
      'Drag points to measure · Adjust height on selected point · Done when ready',
    );
  });

  it('includes import-field context', () => {
    const draft = spawnMeasureDraft(rectanglePlan(120, 180), 'depth');
    expect(measureBannerHint(draft)).toBe(
      'Measuring Depth · Drag points front-to-back · Drag points to measure',
    );
  });

  it('shows drag hint while moving a point', () => {
    const draft = {
      ...spawnMeasureDraft(rectanglePlan(120, 180), null),
      draggingEndpoint: 'b' as const,
    };
    expect(measureBannerHint(draft)).toBe('Drag to move point · Release to place');
  });
});
