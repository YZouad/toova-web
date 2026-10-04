import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  communityGallerySearchPath,
  fetchCommunityMatchesForQuery,
} from './agenticCommunityMatch';

vi.mock('./galleryCatalog', () => ({
  searchDesignerCatalog: vi.fn(),
}));

vi.mock('./modelStorage', () => ({
  resolveCatalogThumbnailUrl: vi.fn(async (path: string) => `https://cdn.test/${path}`),
}));

import { searchDesignerCatalog } from './galleryCatalog';

describe('agenticCommunityMatch', () => {
  afterEach(() => {
    vi.mocked(searchDesignerCatalog).mockReset();
  });

  it('builds community gallery search path', () => {
    expect(communityGallerySearchPath('student desk')).toContain('mode=models');
    expect(communityGallerySearchPath('student desk')).toContain('q=student');
  });

  it('returns only community-source hits with thumbnails', async () => {
    vi.mocked(searchDesignerCatalog).mockResolvedValue([
      {
        kind: 'comm-desk-1',
        label: 'Student Desk',
        source: 'community',
        relevance: 42,
        thumbnail_path: 'thumbs/desk.jpg',
        creator_handle: 'alex',
        creator_display_name: 'Alex',
      } as never,
      {
        kind: 'toova-desk',
        label: 'Toova Desk',
        source: 'toova',
        relevance: 50,
        thumbnail_path: null,
        creator_handle: null,
        creator_display_name: null,
      } as never,
    ]);

    const matches = await fetchCommunityMatchesForQuery('student desk');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.label).toBe('Student Desk');
    expect(matches[0]?.creatorHandle).toBe('alex');
    expect(matches[0]?.previewUrl).toContain('thumbs/desk.jpg');
  });

  it('returns empty for short queries', async () => {
    expect(await fetchCommunityMatchesForQuery('a')).toEqual([]);
    expect(searchDesignerCatalog).not.toHaveBeenCalled();
  });
});
