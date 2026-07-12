import { useEffect } from 'react';
import { useStore } from '../store';

const STEP = (15 * Math.PI) / 180;
const STEP_LARGE = Math.PI / 2;

/**
 * R / Shift+R   rotate selected item (placement is revalidated + gravity applied in store)
 * Delete/Bksp   delete selected item
 * Escape        deselect
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const { selectedId, items, updateRotation, removeItem, select } = useStore.getState();
      if (!selectedId) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const item = items[selectedId];
        if (!item) return;
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
