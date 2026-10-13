import { Item } from '../store';
import { furnitureDrawerColor } from '../lib/furnitureFinish';
import { buildForRender } from '../lib/furnitureBuild';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';
import { DrawerFaces } from './cabinetGeometry';

const BODY = '#a98662';

interface Props { item: Item; selected: boolean; invalid: boolean; }

export function Nightstand({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const finish = useFurnitureFinish(item, BODY);
  const build = buildForRender('nightstand', item.build);
  const drawers = build.drawers ?? 1;
  const drawerHex = furnitureDrawerColor(item.drawerColor, finish.color);

  if (drawers <= 1 && (build.columns ?? 1) <= 1 && !item.build) {
    return (
      <group>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
        </mesh>
        <mesh position={[0, h * 0.7, d / 2 + 0.05]} castShadow>
          <boxGeometry args={[w - 2, h * 0.25, 0.5]} />
          <meshStandardMaterial
            color={drawerHex}
            map={item.drawerColor ? undefined : finish.map ?? undefined}
            roughness={0.7}
          />
        </mesh>
        <mesh position={[0, h * 0.7, d / 2 + 0.4]} castShadow>
          <boxGeometry args={[5, 0.6, 0.6]} />
          <meshStandardMaterial color="#3a2e22" roughness={0.5} metalness={0.2} />
        </mesh>
        {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
      </group>
    );
  }

  const bodyH = h;
  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <DrawerFaces w={w} bodyH={bodyH} d={d} build={build} finish={finish} drawerColor={drawerHex} />
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
