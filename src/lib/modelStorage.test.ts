import { describe, expect, it } from 'vitest';
import { R2_PUBLIC_BASE_URL, publicModelsUrl, resolveCatalogThumbnailUrl } from './modelStorage';

describe('publicModelsUrl', () => {
  it('builds an R2 custom-domain URL from a storage key', () => {
    expect(publicModelsUrl('abc/chair.glb')).toBe(
      `${R2_PUBLIC_BASE_URL}/abc/chair.glb`,
    );
  });

  it('returns absolute URLs unchanged', () => {
    expect(publicModelsUrl('https://cdn.example/x.glb')).toBe(
      'https://cdn.example/x.glb',
    );
  });

  it('returns null for blank paths', () => {
    expect(publicModelsUrl('')).toBeNull();
    expect(publicModelsUrl('   ')).toBeNull();
  });
});

describe('resolveCatalogThumbnailUrl', () => {
  it('returns null for a blank path', async () => {
    expect(await resolveCatalogThumbnailUrl('')).toBeNull();
    expect(await resolveCatalogThumbnailUrl('   ')).toBeNull();
  });

  it('returns absolute URLs unchanged', async () => {
    expect(await resolveCatalogThumbnailUrl('https://cdn.example/a.jpg')).toBe(
      'https://cdn.example/a.jpg',
    );
  });
});
