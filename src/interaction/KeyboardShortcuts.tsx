import { useEffect } from 'react';
import { useStore } from '../store';

const STEP = (15 * Math.PI) / 180;
const STEP_LARGE = Math.PI / 2;

/**
 * R / Shift+R   rotate selected item(s) (placement is revalidated + gravity applied in store)
 * Delete/Bksp   delete selected item(s)
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

      const { selectedIds, items, updateRotation, removeItem, select } = state;
      if (selectedIds.length === 0) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const delta = e.shiftKey ? STEP_LARGE : STEP;
        for (const id of selectedIds) {
          const item = items[id];
          if (!item || item.kind === 'hanging') continue;
          updateRotation(id, item.rotationY + delta);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        for (const id of [...selectedIds]) {
          removeItem(id);
        }
      } else if (e.key === 'Escape') {
        select(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return null;
}
