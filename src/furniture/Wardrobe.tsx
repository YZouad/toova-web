import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const BODY = '#8a6f52';
const TRIM = '#5c4a38';
const HANDLE = '#2a221a';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

export function Wardrobe({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const crownH = 2;
  const totalH = h + crownH;
  const doorW = (w - 2) / 2;
  const dz = d / 2 + 0.04;

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={BODY} roughness={0.68} />
      </mesh>

      <mesh position={[0, h + crownH / 2, 0]} castShadow>
        <boxGeometry args={[w + 1.5, crownH, d + 1]} />
        <meshStandardMaterial color={TRIM} roughness={0.55} />
      </mesh>

      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * doorW) / 2, h / 2, dz]} castShadow>
            <boxGeometry args={[doorW - 0.5, h - 3, 0.35]} />
            <meshStandardMaterial color={BODY} roughness={0.72} />
          </mesh>
          <mesh position={[(side * doorW) / 2 + side * 2.5, h * 0.45, dz + 0.2]} castShadow>
            <boxGeometry args={[1.2, 10, 0.5]} />
            <meshStandardMaterial color={HANDLE} roughness={0.45} metalness={0.15} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, h / 2, dz]} castShadow>
        <boxGeometry args={[1.2, h - 3, 0.4]} />
        <meshStandardMaterial color={TRIM} roughness={0.6} />
      </mesh>

      {selected && <SelectionOutline size={[w, totalH, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
