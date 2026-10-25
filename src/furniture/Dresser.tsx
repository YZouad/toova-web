import { Item } from '../store';
import { furnitureDrawerColor, furnitureTopColor } from '../lib/furnitureFinish';
import { buildForRender } from '../lib/furnitureBuild';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';
import { DrawerFaces } from './cabinetGeometry';

const BODY = '#a98662';

interface Props { item: Item; selected: boolean; invalid: boolean; }

export function Dresser({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const topT = Math.min(1.5, Math.max(1.15, h * 0.07));
  const overhang = 0.55;
  const bodyH = Math.max(4, h - topT);
  const finish = useFurnitureFinish(item, BODY);
  const topHex = furnitureTopColor('dresser', item.topColor, finish.color);
  const build = buildForRender('dresser', item.build);
  const drawerHex = furnitureDrawerColor(item.drawerColor, finish.color);

  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <mesh position={[0, bodyH + topT / 2, overhang * 0.2]} castShadow receiveShadow>
        <boxGeometry args={[w + overhang, topT, d + overhang]} />
        <meshStandardMaterial color={topHex} roughness={0.62} />
      </mesh>
      <DrawerFaces w={w} bodyH={bodyH} d={d} build={build} finish={finish} drawerColor={drawerHex} />
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
