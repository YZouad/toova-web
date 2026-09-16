import { Item } from '../store';
import { dresserTopColor } from '../lib/furnitureFinish';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

const BODY = '#a98662';
const ACCENT = '#3a2e22';

interface Props { item: Item; selected: boolean; invalid: boolean; }

export function Dresser({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const topT = Math.min(1.5, Math.max(1.15, h * 0.07));
  const overhang = 0.55;
  const bodyH = Math.max(4, h - topT);
  const finish = useFurnitureFinish(item, BODY);
  const topHex = dresserTopColor(item.topColor, finish.color);
  const topMap = item.topColor ? undefined : finish.map ?? undefined;

  const drawerH = Math.max(0.6, (bodyH - 2.2) / 3);
  const drawers = [0, 1, 2].map((i) => {
    const cy = 1.1 + drawerH / 2 + i * drawerH;
    return (
      <group key={i}>
        <mesh position={[0, cy, d / 2 + 0.05]} castShadow>
          <boxGeometry args={[w - 2, drawerH - 0.5, 0.5]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
        </mesh>
        <mesh position={[0, cy, d / 2 + 0.4]} castShadow>
          <boxGeometry args={[6, 0.6, 0.6]} />
          <meshStandardMaterial color={ACCENT} roughness={0.5} metalness={0.2} />
        </mesh>
      </group>
    );
  });

  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, bodyH, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <mesh position={[0, bodyH + topT / 2, overhang * 0.2]} castShadow receiveShadow>
        <boxGeometry args={[w + overhang, topT, d + overhang]} />
        <meshStandardMaterial color={topHex} map={topMap} roughness={0.62} />
      </mesh>
      {drawers}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
