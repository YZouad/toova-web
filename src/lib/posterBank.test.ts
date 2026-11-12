import { describe, expect, it } from 'vitest';
import { posterOptionToGalleryModel, type PosterBankOption } from './posterBank';

function option(partial: Partial<PosterBankOption> = {}): PosterBankOption {
  return {
    kind: 'poster-coastal-beach',
    label: 'Coastal beach shoreline wall poster',
    modelPath: 'checklist-refs/glb/posters/poster-coastal-beach.glb',
    thumbnailPath: 'checklist-refs/images/posters/poster-coastal-beach.jpg',
    widthIn: 24,
    heightIn: 36,
    depthIn: 0.5,
    tags: ['coastal', 'poster'],
    isCurated: true,
    signedUrl: 'https://example.test/poster.glb',
    previewUrl: 'https://example.test/poster.jpg',
    ...partial,
  };
}

describe('posterOptionToGalleryModel', () => {
  it('maps option fields and ensures poster tag', () => {
    const model = posterOptionToGalleryModel(option());
    expect(model.kind).toBe('poster-coastal-beach');
    expect(model.tags).toContain('poster');
    expect(model.signedUrl).toBe('https://example.test/poster.glb');
    expect(model.storagePath).toBe('checklist-refs/glb/posters/poster-coastal-beach.glb');
    expect(model.width_in).toBe(24);
    expect(model.isBuiltin).toBe(true);
  });

  it('adds poster tag when missing', () => {
    const model = posterOptionToGalleryModel(option({ tags: ['coastal'] }));
    expect(model.tags).toEqual(['coastal', 'poster']);
  });
});
