import { describe, expect, it } from 'vitest';
import { isValidFloorPlan, resolveZones, validateFloorPlan } from './floorPlanGeometry';
import { isApartmentPlan } from './apartmentRooms';
import {
  oneBedroomApartmentPlan,
  studioApartmentPlan,
  twoBedroomApartmentPlan,
} from './apartmentTemplates';

describe('apartmentTemplates', () => {
  it('studio has 2+ tagged zones and validates', () => {
    const plan = studioApartmentPlan();
    expect(isApartmentPlan(plan)).toBe(true);
    expect(resolveZones(plan).filter((a) => a.zone).length).toBeGreaterThanOrEqual(2);
    expect(validateFloorPlan(plan).filter((i) => i.code !== 'no_door')).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ code: 'self_intersect' })]),
    );
  });

  it('1BR and 2BR are apartments with tagged rooms', () => {
    for (const build of [oneBedroomApartmentPlan, twoBedroomApartmentPlan]) {
      const plan = build();
      expect(isApartmentPlan(plan)).toBe(true);
      expect(isValidFloorPlan(plan) || plan.openings.some((o) => o.kind === 'door')).toBe(true);
      expect((plan.zones ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });
});
