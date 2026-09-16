import { Item } from '../store';
import { DEFAULT_SHELF_COLOR } from './registry';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/**
 * Wall-mounted floating shelf: a flat rectangle parallel to the ground.
 * Local +Z is the wall-facing edge (matches wall.rotationY).
 */
export function Shelf({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const thickness = Math.max(0.4, h);
  const finish = useFurnitureFinish(item, DEFAULT_SHELF_COLOR);

  return (
    <group>
      <mesh position={[0, thickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, thickness, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.62} />
      </mesh>
      <mesh position={[0, thickness / 2, d / 2 - 0.08]} castShadow>
        <boxGeometry args={[w, thickness, 0.16]} />
        <meshStandardMaterial color={finish.trim} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      {selected && (
        <SelectionOutline size={[w, thickness, d]} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </group>
  );
}
