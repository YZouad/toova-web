import { DEFAULT_MATTRESS_COLOR } from '../lib/furnitureFinish';
import { Item } from '../store';
import { BedBedding, beddingSelectionExtraHeight } from './BedBedding';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

const FRAME_COLOR = '#6b4f33';
const LEG_COLOR = '#3a2e22';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/**
 * Twin bed: 38" W × 75" L. item.size[1] is total height (legs + frame + mattress stack).
 * item.position[1] is the floor plane (bottom of legs). Local Y=0 meets the room floor.
 */
export function Bed({ item, selected, invalid }: Props) {
  const [w, totalH, d] = item.size;
  const legH = item.bedLegHeight ?? 8;
  const bodyH = Math.max(4, totalH - legH);
  const frameH = Math.min(6, Math.max(1.5, bodyH * 0.4));
  const mattressH = Math.max(1, bodyH - frameH);
  const legR = 1.5;
  const legInset = 2;
  const finish = useFurnitureFinish(item, FRAME_COLOR);
  const leg = finish.map ? finish.trim : item.tintColor ? finish.trim : LEG_COLOR;

  const legPositions: [number, number][] = [
    [-w / 2 + legInset, -d / 2 + legInset],
    [w / 2 - legInset, -d / 2 + legInset],
    [-w / 2 + legInset, d / 2 - legInset],
    [w / 2 - legInset, d / 2 - legInset],
  ];

  const yFrameMid = legH + frameH / 2;
  const yMattressMid = legH + frameH + mattressH / 2;
  const outlineH = totalH + beddingSelectionExtraHeight(item, w, d, totalH, legH);

  return (
    <group>
      {legPositions.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, legH / 2, lz]} castShadow>
          <cylinderGeometry args={[legR, legR, legH, 12]} />
          <meshStandardMaterial
            color={leg}
            map={finish.map ?? undefined}
            roughness={0.6}
          />
        </mesh>
      ))}

      <mesh position={[0, yFrameMid, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, frameH, d]} />
        <meshStandardMaterial
          color={finish.color}
          map={finish.map ?? undefined}
          roughness={0.7}
        />
      </mesh>

      <mesh position={[0, yMattressMid, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 2, mattressH, d - 2]} />
        <meshStandardMaterial
          color={item.mattressColor ?? DEFAULT_MATTRESS_COLOR}
          roughness={0.9}
        />
      </mesh>

      <BedBedding item={item} w={w} d={d} totalH={totalH} legH={legH} />

      {selected && (
        <SelectionOutline
          size={[w, outlineH, d]}
          color={invalid ? '#ff5555' : '#4f8cff'}
        />
      )}
    </group>
  );
}
