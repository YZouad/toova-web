import { useStore } from '../store';
import {
  arrangeRoomItems,
  LAYOUT_VARIANT_COUNT,
  roomHasShuffleableFloorItems,
  type LayoutVariant,
} from './roomLayoutArrange';

/**
 * Command-palette action. Cycles three preset arrangements of the furniture
 * already in the room (longest wall, next wall, corner). Does not add, remove,
 * or replace pieces, and does not edit the walls.
 * Returns false when nothing moved.
 */
export function shuffleRoomLayout(): boolean {
  const state = useStore.getState();
  const roomItems = state.order
    .map((id) => state.items[id])
    .filter((it): it is NonNullable<typeof it> => it != null);
  if (!roomHasShuffleableFloorItems(roomItems)) return false;

  const start = (state.layoutShuffleVariant + 1) % LAYOUT_VARIANT_COUNT;
  for (let attempt = 0; attempt < LAYOUT_VARIANT_COUNT; attempt++) {
    const variant = ((start + attempt) % LAYOUT_VARIANT_COUNT) as LayoutVariant;
    const { items: arranged, movedIds } = arrangeRoomItems(
      state.roomGeometry,
      roomItems,
      variant,
    );
    if (movedIds.length === 0) continue;
    state.applyItemPoses(
      arranged.map((it) => ({
        id: it.id,
        position: it.position,
        rotationY: it.rotationY,
        size: it.size,
      })),
    );
    useStore.setState({ layoutShuffleVariant: variant });
    return true;
  }
  return false;
}
