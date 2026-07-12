import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const BODY = '#a98662';
const ACCENT = '#3a2e22';

interface Props { item: Item; selected: boolean; invalid: boolean; }

export function Dresser({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;

  // Three drawers
  const drawerH = Math.max(0.6, (h - 3) / 3);
  const drawers = [0, 1, 2].map((i) => {
    const cy = 1.5 + drawerH / 2 + i * drawerH;
    return (
      <group key={i}>
        <mesh position={[0, cy, d / 2 + 0.05]} castShadow>
          <boxGeometry args={[w - 2, drawerH - 0.5, 0.5]} />
          <meshStandardMaterial color={BODY} roughness={0.7} />
        </mesh>
        {/* handle */}
        <mesh position={[0, cy, d / 2 + 0.4]} castShadow>
          <boxGeometry args={[6, 0.6, 0.6]} />
          <meshStandardMaterial color={ACCENT} roughness={0.5} metalness={0.2} />
        </mesh>
      </group>
    );
  });

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      {drawers}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
