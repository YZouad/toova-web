import { useMemo } from 'react';
import {
  UNPLACED_ROOM_KEY,
  groupItemsByRoom,
  resolveApartmentRooms,
  roomSpawnPoint,
} from '../../lib/apartmentRooms';
import { getApartmentMode, useStore } from '../../store';

/** Shows when furniture sits outside every room face after a wall edit. */
export function UnplacedBadge() {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const mode = getApartmentMode({ roomGeometry, focusedRoomId });

  const unplacedIds = useMemo(() => {
    if (mode === 'single') return [];
    const points = order
      .map((id) => items[id])
      .filter((it): it is NonNullable<typeof it> => !!it && it.kind !== 'hanging')
      .map((it) => ({ id: it.id, x: it.position[0], z: it.position[2] }));
    return groupItemsByRoom(roomGeometry, points).get(UNPLACED_ROOM_KEY) ?? [];
  }, [mode, order, items, roomGeometry]);

  const rooms = useMemo(
    () => resolveApartmentRooms(roomGeometry).filter((r) => r.tagged),
    [roomGeometry],
  );

  if (unplacedIds.length === 0 || rooms.length === 0) return null;

  const moveTo = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const [x, z] = roomSpawnPoint(room);
    const poses = unplacedIds
      .map((id) => {
        const it = items[id];
        if (!it) return null;
        return {
          id,
          position: [x, it.position[1], z] as [number, number, number],
          rotationY: it.rotationY,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
    useStore.getState().applyItemPoses(poses);
  };

  return (
    <div className="dg-apt-unplaced" role="status">
      <span>
        {unplacedIds.length} piece{unplacedIds.length === 1 ? '' : 's'} outside every room
      </span>
      <label>
        Move to
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) moveTo(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="" disabled>
            Choose room…
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
