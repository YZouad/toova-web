import * as THREE from 'three';
import { Item } from '../store';
import { lampPartsFromSize } from './lampGeometry';
import { SelectionOutline } from './SelectionOutline';

const SHADE = '#f2e6d4';
const STEM = '#6b6357';
const BASE = '#3a2e22';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/** Simple procedural desk lamp for curated shopping products. */
export function Lamp({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const { baseH, stemH, shadeH, shadeW, stemR, baseR } = lampPartsFromSize(item.size);

  return (
    <group>
      <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[baseR * 0.85, baseR, baseH, 16]} />
        <meshStandardMaterial color={BASE} roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, baseH + stemH / 2, 0]} castShadow>
        <cylinderGeometry args={[stemR, stemR, stemH, 12]} />
        <meshStandardMaterial color={STEM} roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, baseH + stemH + shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[shadeW * 0.25, shadeW * 0.5, shadeH, 16, 1, true]} />
        <meshStandardMaterial color={SHADE} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </group>
  );
}
