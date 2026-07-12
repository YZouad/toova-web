import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const TOP = '#8a6440';
const LEG = '#2e261e';

interface Props { item: Item; selected: boolean; invalid: boolean; }

/**
 * Desk: 48 × 30 × 24. Tabletop 1.5" thick. Four square legs 28.5" tall offset 2" from corners.
 */
export function Desk({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const topT = 1.5;
  const legSize = 1.75;
  const legH = h - topT;
  const inset = 2;

  const legPositions: [number, number][] = [
    [-w / 2 + inset + legSize / 2, -d / 2 + inset + legSize / 2],
    [w / 2 - inset - legSize / 2, -d / 2 + inset + legSize / 2],
    [-w / 2 + inset + legSize / 2, d / 2 - inset - legSize / 2],
    [w / 2 - inset - legSize / 2, d / 2 - inset - legSize / 2],
  ];

  return (
    <group>
      {legPositions.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, legH / 2, lz]} castShadow>
          <boxGeometry args={[legSize, legH, legSize]} />
          <meshStandardMaterial color={LEG} roughness={0.6} />
        </mesh>
      ))}
      {/* tabletop */}
      <mesh position={[0, legH + topT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={TOP} roughness={0.6} />
      </mesh>
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
