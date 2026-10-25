import { Item } from '../store';
import { buildForRender } from '../lib/furnitureBuild';
import { DEFAULT_SHELF_COLOR } from './registry';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/**
 * Wall-mounted floating shelf: flat boards parallel to the ground.
 */
export function Shelf({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const build = buildForRender('shelf', item.build);
  const boardCount = build.boards ?? 1;
  const gap = build.gap ?? 8;
  const finish = useFurnitureFinish(item, DEFAULT_SHELF_COLOR);

  const boards = [];
  if (boardCount <= 1) {
    const thickness = Math.max(0.4, h);
    boards.push(
      <group key={0}>
        <mesh position={[0, thickness / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, thickness, d]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.62} />
        </mesh>
        <mesh position={[0, thickness / 2, d / 2 - 0.08]} castShadow>
          <boxGeometry args={[w, thickness, 0.16]} />
          <meshStandardMaterial color={finish.trim} map={finish.map ?? undefined} roughness={0.7} />
        </mesh>
      </group>,
    );
  } else {
    const thickness = Math.max(0.4, (h - gap * (boardCount - 1)) / boardCount);
    for (let i = 0; i < boardCount; i++) {
      const y = i * (thickness + gap) + thickness / 2;
      boards.push(
        <group key={i}>
          <mesh position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, thickness, d]} />
            <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.62} />
          </mesh>
          <mesh position={[0, y, d / 2 - 0.08]} castShadow>
            <boxGeometry args={[w, thickness, 0.16]} />
            <meshStandardMaterial color={finish.trim} map={finish.map ?? undefined} roughness={0.7} />
          </mesh>
        </group>,
      );
    }
  }

  return (
    <group>
      {boards}
      {selected && (
        <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </group>
  );
}
