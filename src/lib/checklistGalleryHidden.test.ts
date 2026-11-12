import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_HIDDEN_GALLERY_KINDS,
  isHiddenChecklistGalleryModel,
} from './checklistGalleryHidden';

describe('isHiddenChecklistGalleryModel', () => {
  it('hides known checklist kinds', () => {
    for (const kind of CHECKLIST_HIDDEN_GALLERY_KINDS) {
      expect(isHiddenChecklistGalleryModel({ kind, label: 'Any' })).toBe(true);
    }
  });

  it('hides duplicate custom rows that reuse checklist labels', () => {
    expect(
      isHiddenChecklistGalleryModel({ kind: 'custom-abc', label: 'Wooden clock' }),
    ).toBe(true);
    expect(
      isHiddenChecklistGalleryModel({ kind: 'custom-abc', label: 'Floor mirror' }),
    ).toBe(true);
  });

  it('does not hide unrelated models', () => {
    expect(isHiddenChecklistGalleryModel({ kind: 'desk', label: 'Desk' })).toBe(false);
    expect(
      isHiddenChecklistGalleryModel({ kind: 'checklist-pan1', label: 'Frying pan' }),
    ).toBe(false);
  });
});
