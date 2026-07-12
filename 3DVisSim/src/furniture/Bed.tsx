import { Item } from '../store';
import { BedBedding } from './BedBedding';
import { SelectionOutline } from './SelectionOutline';

const FRAME_COLOR = '#6b4f33';
const MATTRESS_COLOR = '#f1ece1';
const SHEET_COLOR = '#dadfe6';
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

  const legPositions: [number, number][] = [
    [-w / 2 + legInset, -d / 2 + legInset],
    [w / 2 - legInset, -d / 2 + legInset],
    [-w / 2 + legInset, d / 2 - legInset],
    [w / 2 - legInset, d / 2 - legInset],
  ];

  const yFrameMid = legH + frameH / 2;
  const yMattressMid = legH + frameH + mattressH / 2;

  return (
    <group>
      {legPositions.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, legH / 2, lz]} castShadow>
          <cylinderGeometry args={[legR, legR, legH, 12]} />
          <meshStandardMaterial color={LEG_COLOR} roughness={0.6} />
        </mesh>
      ))}

      <mesh position={[0, yFrameMid, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, frameH, d]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>

      <mesh position={[0, yMattressMid, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 2, mattressH, d - 2]} />
        <meshStandardMaterial color={MATTRESS_COLOR} roughness={0.9} />
      </mesh>

      {!item.beddingEnabled && (
        <mesh position={[0, yMattressMid + mattressH / 2 + 0.5, -d / 2 + 7]} castShadow>
          <boxGeometry args={[w - 4, 2, 12]} />
          <meshStandardMaterial color={SHEET_COLOR} roughness={0.95} />
        </mesh>
      )}

      <BedBedding
        item={item}
        w={w}
        d={d}
        yMattressMid={yMattressMid}
        mattressH={mattressH}
      />

      {selected && (
        <SelectionOutline
          size={[w, totalH, d]}
          color={invalid ? '#ff5555' : '#4f8cff'}
        />
      )}
    </group>
  );
}
