import { useMemo } from 'react';
import {
  resolveApartmentRooms,
  type ApartmentRoom,
} from '../../../lib/apartmentRooms';
import { getApartmentMode, useStore } from '../../../store';

export interface MobileApartmentChromeProps {
  apartmentName: string;
  onFocusRoom: (roomId: string) => void;
  onNameRoom: (room: ApartmentRoom) => void;
  onBackToOverview: () => void;
}

export function MobileApartmentChrome({
  apartmentName,
  onFocusRoom,
  onNameRoom,
  onBackToOverview,
}: MobileApartmentChromeProps) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = getApartmentMode({ roomGeometry, focusedRoomId });
  const rooms = useMemo(() => resolveApartmentRooms(roomGeometry), [roomGeometry]);
  const focused = rooms.find((r) => r.id === focusedRoomId) ?? null;

  if (mode === 'single') return null;

  if (mode === 'overview') {
    return (
      <div className="dgm-apt" aria-label="Apartment rooms">
        <div className="dgm-apt__title">{apartmentName}</div>
        <div className="dgm-apt__chips" role="list">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              role="listitem"
              className="dgm-apt__chip"
              onClick={() => {
                if (room.tagged) onFocusRoom(room.id);
                else onNameRoom(room);
              }}
            >
              {room.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dgm-apt is-focused" aria-label="Focused room">
      <button type="button" className="dgm-apt__back" onClick={onBackToOverview}>
        ← {apartmentName}
      </button>
      <span className="dgm-apt__focused">{focused?.label ?? 'Room'}</span>
    </div>
  );
}
