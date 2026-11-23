import type { FloorPlan } from './floorPlanGeometry';
import {
  activeGeometryFor,
  apartmentModeFor,
  itemBelongsToRoom,
  itemPlanPoint,
} from './apartmentRooms';
import { useStore, type Item } from '../store';
import {
  arrangeRoomItems,
  LAYOUT_VARIANT_COUNT,
  roomHasShuffleableFloorItems,
  type LayoutVariant,
} from './roomLayoutArrange';

export interface ShuffleScope {
  geometry: FloorPlan;
  items: Item[];
  pinnedIds: string[];
}

/** Items and geometry to rearrange; null when shuffle should not run (overview or nothing to move). */
export function resolveShuffleScope(
  state: Pick<
    ReturnType<typeof useStore.getState>,
    'order' | 'items' | 'roomGeometry' | 'focusedRoomId' | 'selectedIds'
  >,
): ShuffleScope | null {
  const allItems = state.order
    .map((id) => state.items[id])
    .filter((it): it is Item => it != null);

  const mode = apartmentModeFor(state.roomGeometry, state.focusedRoomId);
  if (mode === 'overview') return null;

  const geometry = activeGeometryFor(state.roomGeometry, state.focusedRoomId);

  let items = allItems;
  if (mode === 'focused' && state.focusedRoomId) {
    const roomId = state.focusedRoomId;
    items = allItems.filter((it) => {
      const [x, z] = itemPlanPoint(it);
      return itemBelongsToRoom(state.roomGeometry, { id: it.id, x, z }, roomId);
    });
  }

  if (!roomHasShuffleableFloorItems(items)) return null;

  const itemIds = new Set(items.map((i) => i.id));
  const pinnedIds = state.selectedIds.filter((id) => itemIds.has(id));

  return { geometry, items, pinnedIds };
}

/**
 * Command-palette action. Cycles three arrangements of the furniture already
 * in the room: bed on the longest wall with the desk at a window, bed on the
 * wall you face from the door, and a corner L. Selected pieces stay put.
 * Does not add, remove, or replace pieces, and does not edit the walls.
 * In a multi-room apartment, only runs while one room is focused.
 * Returns false when nothing moved.
 */
export function shuffleRoomLayout(): boolean {
  const state = useStore.getState();
  const scope = resolveShuffleScope(state);
  if (!scope) return false;

  const start = (state.layoutShuffleVariant + 1) % LAYOUT_VARIANT_COUNT;
  for (let attempt = 0; attempt < LAYOUT_VARIANT_COUNT; attempt++) {
    const variant = ((start + attempt) % LAYOUT_VARIANT_COUNT) as LayoutVariant;
    const { items: arranged, movedIds } = arrangeRoomItems(
      scope.geometry,
      scope.items,
      variant,
      { pinnedIds: scope.pinnedIds },
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
