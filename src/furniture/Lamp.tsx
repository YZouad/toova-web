import * as THREE from 'three';
import { Item } from '../store';
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
  const baseH = Math.max(1.2, h * 0.08);
  const stemH = h * 0.55;
  const shadeH = h * 0.32;
  const shadeW = Math.min(w, d) * 0.95;
  const stemR = Math.min(w, d) * 0.08;

  return (
    <group>
      <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[Math.min(w, d) * 0.35, Math.min(w, d) * 0.42, baseH, 16]} />
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
