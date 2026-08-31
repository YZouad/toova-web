import { useEffect } from 'react';
import { useStore } from '../store';

const STEP = (15 * Math.PI) / 180;
const STEP_LARGE = Math.PI / 2;
const LIFT_STEP = 3;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * R / Shift+R   rotate selected item(s) (placement is revalidated + gravity applied in store)
 * Delete/Bksp   delete selected item(s)
 * Escape        deselect
 * ⌘/Ctrl+D      duplicate selected item(s)
 * Alt+↑/↓       raise / lower selected item(s) by 3″
 *
 * Skipped while a hanging-decoration draft is active (placement controller owns keys).
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const state = useStore.getState();
      if (state.hangingDraft) return;
      if (state.designerTool !== 'select') return;

      const { selectedIds, items, updateRotation, removeItem, select, duplicateItem, setItemElevation } =
        state;
      if (selectedIds.length === 0) return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        for (const id of [...selectedIds]) {
          if (items[id]) duplicateItem(id);
        }
        return;
      }

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? LIFT_STEP : -LIFT_STEP;
        for (const id of selectedIds) {
          const item = items[id];
          if (!item || item.kind === 'hanging') continue;
          setItemElevation(id, item.position[1] + delta);
        }
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (mod || e.altKey) return;
        e.preventDefault();
        const delta = e.shiftKey ? STEP_LARGE : STEP;
        for (const id of selectedIds) {
          const item = items[id];
          if (!item || item.kind === 'hanging' || item.kind === 'light') continue;
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
