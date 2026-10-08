import { describe, expect, it } from 'vitest';
import {
  galleryModelToCommunityPick,
  mergePendingPicksIntoSession,
} from './agenticChecklistSession';

describe('agenticChecklistSession', () => {
  it('maps gallery models to pending checklist picks', () => {
    const pick = galleryModelToCommunityPick({
      kind: 'comm-desk-1',
      label: 'Student desk',
      storagePath: 'models/comm-desk-1.glb',
      signedUrl: null,
      width_in: 48,
      height_in: 30,
      depth_in: 24,
    });
    expect(pick.query).toBe('Student desk');
    expect(pick.communityModel.kind).toBe('comm-desk-1');
    expect(pick.communityModel.modelUrl).toBe('models/comm-desk-1.glb');
  });

  it('merges gallery picks into a saved session', () => {
    const merged = mergePendingPicksIntoSession(
      {
        prompt: '',
        result: { items: [{ query: 'desk', qty: 1 }], warnings: [], source: 'manual' },
        items: [{ query: 'desk', qty: 1 }],
      },
      [
        galleryModelToCommunityPick({
          kind: 'comm-chair-1',
          label: 'Desk chair',
          storagePath: 'models/comm-chair-1.glb',
          signedUrl: null,
          width_in: 18,
          height_in: 36,
          depth_in: 18,
        }),
      ],
    );
    expect(merged.items.map((item) => item.query)).toEqual(['desk', 'Desk chair']);
    expect(merged.savedPicks?.[0]?.communityModel?.kind).toBe('comm-chair-1');
  });
});
