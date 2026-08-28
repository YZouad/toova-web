import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';

const BODY = '#a98662';
const INNER = '#8a6c4c';

interface Props { item: Item; selected: boolean; invalid: boolean; }

/** Open-front shelf unit: same wood as the dresser, three bays instead of drawers. */
export function Bookshelf({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const panelT = Math.max(0.7, Math.min(1.15, w * 0.035));
  const backT = Math.max(0.45, panelT * 0.7);
  const innerW = Math.max(1, w - panelT * 2);
  const bayCount = 3;
  const innerH = Math.max(panelT, h - panelT * 2);
  const bayH = innerH / bayCount;

  const shelves = [];
  for (let i = 1; i < bayCount; i++) {
    const y = panelT + i * bayH;
    shelves.push(
      <mesh key={i} position={[0, y, backT / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerW, panelT, d - backT]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>,
    );
  }

  return (
    <group>
      <mesh position={[-w / 2 + panelT / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, h, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      <mesh position={[w / 2 - panelT / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, h, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      <mesh position={[0, panelT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[innerW, panelT, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      <mesh position={[0, h - panelT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[innerW, panelT, d]} />
        <meshStandardMaterial color={BODY} roughness={0.7} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 + backT / 2]} castShadow receiveShadow>
        <boxGeometry args={[innerW, h - panelT, backT]} />
        <meshStandardMaterial color={INNER} roughness={0.82} />
      </mesh>
      {shelves}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
