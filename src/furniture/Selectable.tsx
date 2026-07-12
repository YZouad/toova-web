import { ReactNode } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../store';

interface SelectableProps {
  id: string;
  children: ReactNode;
}

/**
 * Wraps a furniture group so clicking it selects the item in the store.
 * Selection outline is rendered by the item component itself based on selectedId.
 */
export function Selectable({ id, children }: SelectableProps) {
  const select = useStore((s) => s.select);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    select(id);
  };

  return (
    <group onPointerDown={handlePointerDown}>
      {children}
    </group>
  );
}
