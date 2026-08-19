import { describe, expect, it } from 'vitest';
import { R2_PUBLIC_BASE_URL, publicModelsUrl } from './modelStorage';

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
