import { describe, expect, it } from 'vitest';
import {
  catalogPreviewAccess,
  mapImportedPreviewUrls,
} from './catalogPreviewUrls';

describe('catalogPreviewAccess', () => {
  it('uses the public CDN only for public rows', () => {
    expect(catalogPreviewAccess('public')).toBe('public');
    expect(catalogPreviewAccess('unlisted')).toBe('private');
    expect(catalogPreviewAccess('private')).toBe('private');
    expect(catalogPreviewAccess(null)).toBe('private');
  });
});

describe('mapImportedPreviewUrls', () => {
  it('prefers a session snapshot, then model path, then catalog kind', () => {
    const byModelUrl = new Map([['u/a.glb', 'https://cdn/a.jpg']]);
    const byKind = new Map([['custom-1', 'https://cdn/kind.jpg']]);
    const session = (kind: string) => (kind === 'custom-1' ? 'blob:session' : undefined);

    expect(
      mapImportedPreviewUrls(
        [
          { id: 'i1', importedStoragePath: 'u/a.glb', catalogKind: 'custom-1' },
          { id: 'i2', importedStoragePath: 'u/missing.glb', catalogKind: 'custom-2' },
          { id: 'i3', catalogKind: 'custom-1' },
        ],
        { byModelUrl, byKind },
        session,
      ),
    ).toEqual({
      i1: 'blob:session',
      i3: 'blob:session',
    });
  });

  it('falls back to the catalog thumbnail when no session preview exists', () => {
    const byModelUrl = new Map([['u/a.glb', 'https://cdn/a.jpg']]);
    const byKind = new Map([['custom-2', 'https://cdn/kind.jpg']]);

    expect(
      mapImportedPreviewUrls(
        [
          { id: 'path', importedStoragePath: 'u/a.glb' },
          { id: 'kind', catalogKind: 'custom-2' },
          { id: 'none' },
        ],
        { byModelUrl, byKind },
        () => undefined,
      ),
    ).toEqual({
      path: 'https://cdn/a.jpg',
      kind: 'https://cdn/kind.jpg',
    });
  });
});
