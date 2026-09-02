import { describe, expect, it } from 'vitest';
import { getBuiltinPreviewUrl, withBuiltinPreview } from './useBuiltinPreviews';

describe('getBuiltinPreviewUrl', () => {
  it('reads from the passed map', () => {
    expect(getBuiltinPreviewUrl('nightstand', { nightstand: 'blob:n' })).toBe('blob:n');
  });

  it('ignores imported kinds', () => {
    expect(getBuiltinPreviewUrl('imported', { imported: 'blob:x' })).toBeUndefined();
  });
});

describe('withBuiltinPreview', () => {
  it('keeps an existing previewUrl', () => {
    const model = { kind: 'nightstand', isBuiltin: true, previewUrl: 'https://x/a.jpg' };
    expect(withBuiltinPreview(model, { nightstand: 'blob:1' }).previewUrl).toBe(
      'https://x/a.jpg',
    );
  });

  it('fills a builtin from the preview map', () => {
    const model = { kind: 'nightstand', isBuiltin: true, previewUrl: null };
    expect(withBuiltinPreview(model, { nightstand: 'blob:1' }).previewUrl).toBe('blob:1');
  });

  it('leaves community models unchanged', () => {
    const model = { kind: 'custom-1', isBuiltin: false, previewUrl: null };
    expect(withBuiltinPreview(model, { 'custom-1': 'blob:1' }).previewUrl).toBeNull();
  });
});
