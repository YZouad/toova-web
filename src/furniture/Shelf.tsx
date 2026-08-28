import { Item } from '../store';
import { DEFAULT_SHELF_COLOR } from './registry';
import { SelectionOutline } from './SelectionOutline';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

function shadeHex(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) return hex;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, ((n >> shift) & 255) + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Wall-mounted floating shelf: a flat rectangle parallel to the ground.
 * Local +Z is the wall-facing edge (matches wall.rotationY).
 */
export function Shelf({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const thickness = Math.max(0.4, h);
  const board = item.tintColor ?? DEFAULT_SHELF_COLOR;
  const edge = shadeHex(board, -28);

  return (
    <group>
      <mesh position={[0, thickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, thickness, d]} />
        <meshStandardMaterial color={board} roughness={0.62} />
      </mesh>
      {/* Thin back strip so the wall-facing edge reads as a mounted board. */}
      <mesh position={[0, thickness / 2, d / 2 - 0.08]} castShadow>
        <boxGeometry args={[w, thickness, 0.16]} />
        <meshStandardMaterial color={edge} roughness={0.7} />
      </mesh>
      {selected && (
        <SelectionOutline size={[w, thickness, d]} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </group>
  );
}
