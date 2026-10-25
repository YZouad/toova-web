import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Item } from '../store';
import { isPosterItem, posterKindForItem } from './posterItem';

beforeAll(() => {
  vi.stubGlobal('window', {
    gtag: undefined,
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
});

function importedItem(partial: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    kind: 'imported',
    position: [0, 48, 0],
    rotationY: 0,
    size: [24, 36, 0.5],
    label: 'Poster',
    attachmentKey: 'ak-1',
    ...partial,
  };
}

describe('isPosterItem', () => {
  it('recognizes curated bank posters by catalog kind', () => {
    expect(
      isPosterItem(
        importedItem({
          catalogKind: 'poster-gothic-cathedral',
        }),
      ),
    ).toBe(true);
  });

  it('recognizes uploaded posters by catalog tag', () => {
    expect(
      isPosterItem(
        importedItem({
          catalogKind: 'custom-abc',
          catalogTags: ['poster'],
        }),
      ),
    ).toBe(true);
  });

  it('ignores non-poster imports', () => {
    expect(
      isPosterItem(
        importedItem({
          catalogKind: 'custom-rug',
          catalogTags: ['rug'],
        }),
      ),
    ).toBe(false);
  });
});

describe('swapPosterItem', () => {
  it('replaces one placement while preserving wall pose center', async () => {
    const { useStore } = await import('../store');
    useStore.getState().resetLayout();

    const id = useStore.getState().addItem('imported', {
      label: 'Coastal beach shoreline wall poster',
      catalogKind: 'poster-coastal-beach',
      catalogTags: ['poster'],
      storagePath: 'checklist-refs/glb/posters/poster-coastal-beach.glb',
      url: '/checklist-refs/glb/posters/poster-coastal-beach.glb',
      size: [24, 36, 0.5],
      catalogSizeIn: [24, 36, 0.5],
      wallMounted: true,
    });

    const before = useStore.getState().items[id]!;
    const centerY = before.position[1] + before.size[1] / 2;

    useStore.getState().swapPosterItem(id, {
      label: 'Gothic cathedral architecture wall poster',
      catalogKind: 'poster-gothic-cathedral',
      url: '/checklist-refs/glb/posters/poster-gothic-cathedral.glb',
      storagePath: 'checklist-refs/glb/posters/poster-gothic-cathedral.glb',
      size: [18, 24, 0.5],
      catalogTags: ['poster'],
    });

    const after = useStore.getState().items[id]!;
    expect(after.catalogKind).toBe('poster-gothic-cathedral');
    expect(after.importedStoragePath).toBe(
      'checklist-refs/glb/posters/poster-gothic-cathedral.glb',
    );
    expect(after.size).toEqual([18, 24, 0.5]);
    expect(after.position[0]).toBe(before.position[0]);
    expect(after.position[2]).toBe(before.position[2]);
    expect(after.rotationY).toBe(before.rotationY);
    expect(after.wallMounted).toBe(true);
    expect(after.importedNaturalSize).toBeUndefined();
    expect(after.position[1] + after.size[1] / 2).toBeCloseTo(centerY, 5);

    const otherId = useStore.getState().addItem('imported', {
      label: 'Second poster',
      catalogKind: 'poster-coastal-beach',
      catalogTags: ['poster'],
      storagePath: 'checklist-refs/glb/posters/poster-coastal-beach.glb',
      url: '/checklist-refs/glb/posters/poster-coastal-beach.glb',
      size: [24, 36, 0.5],
      catalogSizeIn: [24, 36, 0.5],
      wallMounted: true,
    });

    useStore.getState().swapPosterItem(id, {
      label: 'Minimalist geometric line art wall poster',
      catalogKind: 'poster-minimalist-lines',
      url: '/checklist-refs/glb/posters/poster-minimalist-lines.glb',
      storagePath: 'checklist-refs/glb/posters/poster-minimalist-lines.glb',
      size: [24, 36, 0.5],
      catalogTags: ['poster'],
    });

    expect(useStore.getState().items[otherId]?.catalogKind).toBe('poster-coastal-beach');
    expect(posterKindForItem(useStore.getState().items[id]!)).toBe('poster-minimalist-lines');
  });
});
