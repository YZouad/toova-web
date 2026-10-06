import { useStore } from '../store';
import {
  arrangeRoomItems,
  LAYOUT_VARIANT_COUNT,
  roomHasShuffleableFloorItems,
  type LayoutVariant,
} from './roomLayoutArrange';

/**
 * Command-palette action. Cycles three arrangements of the furniture already
 * in the room: bed on the longest wall with the desk at a window, bed on the
 * wall you face from the door, and a corner L. Selected pieces stay put.
 * Does not add, remove, or replace pieces, and does not edit the walls.
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
      { pinnedIds: state.selectedIds },
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
