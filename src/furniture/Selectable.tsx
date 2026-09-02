import { ReactNode } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../store';

interface SelectableProps {
  id: string;
  children: ReactNode;
}

/**
 * Wraps a furniture group so clicking it selects the item in the store.
 * Shift-click toggles membership for multi-select. Plain click on an already
 * selected item keeps the current set so group drag still works.
 * Selection outline is rendered by the item component itself based on selectedIds.
 */
export function Selectable({ id, children }: SelectableProps) {
  const select = useStore((s) => s.select);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
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

  return (
    <group onPointerDown={handlePointerDown}>
      {children}
    </group>
  );
}
