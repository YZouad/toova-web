import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/** Small pickable bulb gizmo for free-floating light sources. */
export function LightSource({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const r = Math.min(w, h, d) * 0.42;
  const color = item.emitter?.color ?? '#fff4e0';
  const on = item.emitter?.enabled !== false;
  // Bulb surface brightness tracks light intensity so it reads as "on".
  const intensity = item.emitter?.intensity ?? 2.2;
  const emissiveIntensity = on ? 0.7 + Math.min(2.4, intensity * 0.35) : 0;

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow={false}>
        <sphereGeometry args={[r, 24, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={on ? color : '#000000'}
          emissiveIntensity={emissiveIntensity}
          roughness={0.35}
          metalness={0.05}
          toneMapped={false}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[0, h / 2 - r * 0.85, 0]} castShadow={false}>
        <cylinderGeometry args={[r * 0.28, r * 0.38, r * 0.35, 12]} />
        <meshStandardMaterial color="#5a5248" roughness={0.55} metalness={0.25} />
      </mesh>
      {selected ? (
        <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />
      ) : null}
    </group>
  );
}
