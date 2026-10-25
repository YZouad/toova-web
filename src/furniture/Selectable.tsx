import { ReactNode } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { isPosterItem } from '../lib/posterItem';
import { useStore } from '../store';

interface SelectableProps {
  id: string;
  children: ReactNode;
  /** Opens the poster bank on double-click (single click selects / drags). */
  onPosterActivate?: (id: string) => void;
}

/**
 * Wraps a furniture group so clicking it selects the item in the store.
 * Shift-click toggles membership for multi-select. Plain click on an already
 * selected item keeps the current set so group drag still works.
 * Selection outline is rendered by the item component itself based on selectedIds.
 */
export function Selectable({ id, children, onPosterActivate }: SelectableProps) {
  const select = useStore((s) => s.select);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (useStore.getState().designerTool === 'measure') return;
    // Phone tap-to-select is handled by MobileObjectGestureController so drags orbit
    // the camera without opening the inspector on every touch.
    const pt = e.nativeEvent.pointerType;
    if (pt === 'touch' || pt === 'pen') return;

    e.stopPropagation();
    if (e.shiftKey) {
      select(id, { additive: true });
      return;
    }
    const { selectedIds } = useStore.getState();
    if (selectedIds.includes(id)) return;
    select(id);
  };

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    if (useStore.getState().designerTool === 'measure') return;
    e.stopPropagation();
    const item = useStore.getState().items[id];
    if (isPosterItem(item)) onPosterActivate?.(id);
  };

  return (
    <group onPointerDown={handlePointerDown} onDoubleClick={handleDoubleClick}>
      {children}
    </group>
  );
}
