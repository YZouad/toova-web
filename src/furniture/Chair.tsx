import { Item } from '../store';
import { buildForRender } from '../lib/furnitureBuild';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

const SEAT = '#4a5a6c';
const FRAME = '#1a1a1a';

interface Props { item: Item; selected: boolean; invalid: boolean; }

/**
 * Chair: seat height scales with size; style from build (side / armchair / stool).
 */
export function Chair({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const build = buildForRender('chair', item.build);
  const style = build.style ?? 'side';
  const backStyle = build.backStyle ?? 'solid';
  const finish = useFurnitureFinish(item, SEAT);

  if (style === 'stool') {
    const seatT = Math.min(1.5, Math.max(0.5, h * 0.08));
    const legH = Math.max(4, h - seatT);
    const legSize = 1.2;
    return (
      <group>
        {[
          [-w / 2 + 1, -d / 2 + 1],
          [w / 2 - 1, -d / 2 + 1],
          [-w / 2 + 1, d / 2 - 1],
          [w / 2 - 1, d / 2 - 1],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, legH / 2, lz]} castShadow>
            <boxGeometry args={[legSize, legH, legSize]} />
            <meshStandardMaterial color={FRAME} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, legH + seatT / 2, 0]} castShadow>
          <boxGeometry args={[w, seatT, d]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
        </mesh>
        {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
      </group>
    );
  }

  const seatH = Math.max(2, Math.min(18, h * 0.5));
  const seatT = Math.min(1.5, Math.max(0.5, h * 0.12));
  const legSize = 1.2;
  const backH = Math.max(1, h - seatH);
  const armW = style === 'armchair' ? 1.2 : 0;
  const armDepth = d * 0.55;

  const slats =
    backStyle === 'slats'
      ? Array.from({ length: 4 }, (_, i) => {
          const y = seatH + seatT + (backH * (i + 1)) / 5;
          return (
            <mesh key={i} position={[0, y, d / 2 - 1]} castShadow>
              <boxGeometry args={[w - 2, 0.35, 0.8]} />
              <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
            </mesh>
          );
        })
      : (
        <mesh position={[0, seatH + backH / 2, d / 2 - 1]} castShadow>
          <boxGeometry args={[w, backH, 1]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
        </mesh>
      );

  return (
    <group>
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
      <mesh position={[0, seatH + seatT / 2, 0]} castShadow>
        <boxGeometry args={[w, seatT, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
      </mesh>
      {slats}
      {style === 'armchair' ? (
        <>
          <mesh position={[-w / 2 + armW / 2, seatH + backH * 0.35, 0]} castShadow>
            <boxGeometry args={[armW, backH * 0.5, armDepth]} />
            <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
          </mesh>
          <mesh position={[w / 2 - armW / 2, seatH + backH * 0.35, 0]} castShadow>
            <boxGeometry args={[armW, backH * 0.5, armDepth]} />
            <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.8} />
          </mesh>
        </>
      ) : null}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
