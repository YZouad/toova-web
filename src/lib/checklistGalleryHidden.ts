/** Checklist bank models removed from Add to the room + shopping checklist curation. */

export const CHECKLIST_HIDDEN_GALLERY_KINDS = new Set([
  'checklist-wallmirror',
  'checklist-largemirror',
  'checklist-clock2',
  'checklist-woodenclock',
]);

const HIDDEN_LABELS = new Set([
  'wooden clock',
  'clock',
  'digital clock',
  'wall mirror',
  'floor mirror',
]);

/** Hide legacy checklist clocks/mirrors (and duplicate custom-bank rows with the same labels). */
export function isHiddenChecklistGalleryModel(model: { kind: string; label: string }): boolean {
  if (CHECKLIST_HIDDEN_GALLERY_KINDS.has(model.kind)) return true;
  const label = model.label.trim().toLowerCase();
  if (!HIDDEN_LABELS.has(label)) return false;
  return model.kind.startsWith('checklist-') || model.kind.startsWith('custom-');
}
