import { Item } from '../store';
import { buildForRender } from '../lib/furnitureBuild';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';

const BODY = '#a98662';

interface Props { item: Item; selected: boolean; invalid: boolean; }

/** Open-front shelf unit with configurable bays and columns. */
export function Bookshelf({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const build = buildForRender('bookshelf', item.build);
  const bayCount = build.shelves ?? 3;
  const columnCount = build.bookshelfColumns ?? 1;
  const showBack = item.build?.back !== false;

  const panelT = Math.max(0.7, Math.min(1.15, w * 0.035));
  const backT = Math.max(0.45, panelT * 0.7);
  const innerW = Math.max(1, w - panelT * 2);
  const colW = innerW / columnCount;
  const innerH = Math.max(panelT, h - panelT * 2);
  const bayH = innerH / bayCount;
  const finish = useFurnitureFinish(item, BODY);
  const inner = finish.trim;

  const shelves = [];
  for (let bay = 1; bay < bayCount; bay++) {
    const y = panelT + bay * bayH;
    for (let col = 0; col < columnCount; col++) {
      const cx = -innerW / 2 + colW * (col + 0.5);
      shelves.push(
        <mesh key={`${bay}-${col}`} position={[cx, y, backT / 2]} castShadow receiveShadow>
          <boxGeometry args={[colW - 0.15, panelT, d - backT]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
        </mesh>,
      );
    }
  }

  const verticalDividers = [];
  for (let col = 1; col < columnCount; col++) {
    const x = -innerW / 2 + colW * col;
    verticalDividers.push(
      <mesh key={`div-${col}`} position={[x, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, h - panelT, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>,
    );
  }

  return (
    <group>
      <mesh position={[-w / 2 + panelT / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, h, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <mesh position={[w / 2 - panelT / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, h, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <mesh position={[0, panelT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[innerW, panelT, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      <mesh position={[0, h - panelT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[innerW, panelT, d]} />
        <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.7} />
      </mesh>
      {showBack ? (
        <mesh position={[0, panelT + innerH / 2, -d / 2 + backT / 2]} castShadow receiveShadow>
          <boxGeometry args={[innerW, innerH, backT]} />
          <meshStandardMaterial color={inner} map={finish.map ?? undefined} roughness={0.82} />
        </mesh>
      ) : null}
      {verticalDividers}
      {shelves}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
