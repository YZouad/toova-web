import { useEffect } from 'react';
import { useStore } from '../store';

const STEP = (15 * Math.PI) / 180;
const STEP_LARGE = Math.PI / 2;

/**
 * R / Shift+R   rotate selected item (placement is revalidated + gravity applied in store)
 * Delete/Bksp   delete selected item
 * Escape        deselect
 *
 * Skipped while a hanging-decoration draft is active (placement controller owns keys).
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const state = useStore.getState();
      if (state.hangingDraft) return;
      if (state.designerTool !== 'select') return;

      const { selectedId, items, updateRotation, removeItem, select } = state;
      if (!selectedId) return;

      if (e.key === 'r' || e.key === 'R') {
        const item = items[selectedId];
        if (!item || item.kind === 'hanging') return;
        e.preventDefault();
        const delta = e.shiftKey ? STEP_LARGE : STEP;
        updateRotation(selectedId, item.rotationY + delta);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeItem(selectedId);
      } else if (e.key === 'Escape') {
        select(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return null;
}
