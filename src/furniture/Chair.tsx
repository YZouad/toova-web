import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const SEAT = '#4a5a6c';
const FRAME = '#1a1a1a';

interface Props { item: Item; selected: boolean; invalid: boolean; }

/**
 * Chair: 18 × 36 × 18. Seat at 18" high, backrest above.
 */
export function Chair({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const seatH = Math.max(2, Math.min(18, h * 0.5));
  const seatT = Math.min(1.5, Math.max(0.5, h * 0.12));
  const legSize = 1.2;
  const backH = Math.max(1, h - seatH);

  return (
    <group>
      {/* legs */}
      {[
        [-w / 2 + 1, -d / 2 + 1],
        [w / 2 - 1, -d / 2 + 1],
        [-w / 2 + 1, d / 2 - 1],
        [w / 2 - 1, d / 2 - 1],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, seatH / 2, lz]} castShadow>
          <boxGeometry args={[legSize, seatH, legSize]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} />
        </mesh>
      ))}
      {/* seat */}
      <mesh position={[0, seatH + seatT / 2, 0]} castShadow>
        <boxGeometry args={[w, seatT, d]} />
        <meshStandardMaterial color={SEAT} roughness={0.8} />
      </mesh>
      {/* backrest at +Z end */}
      <mesh position={[0, seatH + backH / 2, d / 2 - 1]} castShadow>
        <boxGeometry args={[w, backH, 1]} />
        <meshStandardMaterial color={SEAT} roughness={0.8} />
      </mesh>
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
