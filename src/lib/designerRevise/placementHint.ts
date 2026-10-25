import type { Item } from '../../store';
import type { RoomGeometry } from '../roomGeometry';
import { openingWorldPlacement, planCentroid, windowOpenings } from '../roomGeometry';
import type { RevisePlacementHint } from './reviseSchema';

export function targetPositionForPlacement(
  hint: RevisePlacementHint,
  roomGeometry: RoomGeometry,
  items: Record<string, Item>,
  order: string[],
  selectedId: string | null,
  itemSize: [number, number, number],
): [number, number, number] {
  const [cx, cz] = planCentroid(roomGeometry);

  if (hint === 'selected' && selectedId && items[selectedId]) {
    const sel = items[selectedId];
    return [sel.position[0] + 12, 0, sel.position[2] + 12];
  }

  if (hint === 'bed') {
    const bed = order.map((id) => items[id]).find((it) => it?.kind === 'bed');
    if (bed) return [bed.position[0] + 24, 0, bed.position[2]];
  }

  if (hint === 'desk') {
    const desk = order.map((id) => items[id]).find((it) => it?.kind === 'desk');
    if (desk) return [desk.position[0], 0, desk.position[2] + 18];
  }

  if (hint === 'window') {
    const windows = windowOpenings(roomGeometry);
    const first = windows[0];
    if (first) {
      const placement = openingWorldPlacement(roomGeometry, first);
      if (placement) {
        const inward = 18;
        const [ox, , oz] = placement.outward;
        return [placement.cx - ox * inward, 0, placement.cz - oz * inward];
      }
    }
  }

  void itemSize;
  return [cx, 0, cz];
}
