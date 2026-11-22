import { describe, expect, it, vi } from 'vitest';
import { buildUChicagoDormStarters } from './uchicagoDormTemplates';
import { buildUChicagoCarouselLayout } from './uchicagoLandingLayout';
import type { StarterFloorSeed } from './roomStarterTemplates';

vi.mock('./starterTemplateOverrides', () => ({
  resolveStarterItemAssets: vi.fn(async () => undefined),
}));

describe('buildUChicagoCarouselLayout', () => {
  it('adds demo furniture when the starter has no floor items', async () => {
    const starter = buildUChicagoDormStarters().find((s) => s.id === 'uchicago-i-house-single');
    expect(starter).toBeDefined();
    const layout = await buildUChicagoCarouselLayout(starter!);
    expect(layout.items.length).toBeGreaterThan(0);
    expect(layout.order).toHaveLength(layout.items.length);
    expect(layout.plan.walls.length).toBeGreaterThan(0);
  });

  it('does not add demo items when the starter already has floor seeds', async () => {
    const starter = buildUChicagoDormStarters().find((s) => s.id === 'uchicago-woodlawn-single');
    expect(starter).toBeDefined();
    const withSeed = {
      ...starter!,
      floorItems: [
        {
          kind: 'chair' as const,
          position: [40, 0, 40] as [number, number, number],
          rotationY: 0,
        },
      ] satisfies StarterFloorSeed[],
    };
    const layout = await buildUChicagoCarouselLayout(withSeed);
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0]?.kind).toBe('chair');
  });
});