import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const BODY = '#a98662';
const ACCENT = '#3a2e22';

interface Props { item: Item; selected: boolean; invalid: boolean; }

export function Nightstand({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      {/* drawer face */}
      <mesh position={[0, h * 0.7, d / 2 + 0.05]} castShadow>
        <boxGeometry args={[w - 2, h * 0.25, 0.5]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      {/* handle */}
      <mesh position={[0, h * 0.7, d / 2 + 0.4]} castShadow>
        <boxGeometry args={[5, 0.6, 0.6]} />
        <meshStandardMaterial color={ACCENT} roughness={0.5} metalness={0.2} />
      </mesh>
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
