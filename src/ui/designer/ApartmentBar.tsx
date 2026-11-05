import { useMemo, useState } from 'react';
import {
  resolveApartmentRooms,
  type ApartmentRoom,
} from '../../lib/apartmentRooms';
import { roomTagDef } from '../../lib/roomTags';
import { getApartmentMode, useStore } from '../../store';

export interface ApartmentBarProps {
  apartmentName: string;
  onFocusRoom: (roomId: string) => void;
  onBackToOverview: () => void;
}

function roomChipStyle(room: ApartmentRoom): React.CSSProperties | undefined {
  if (!room.tag) return undefined;
  const def = roomTagDef(room.tag);
  return { ['--apt-chip-color' as string]: def.stroke };
}

export function ApartmentBar({
  apartmentName,
  onFocusRoom,
  onBackToOverview,
}: ApartmentBarProps) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = getApartmentMode({ roomGeometry, focusedRoomId });
  const rooms = useMemo(() => resolveApartmentRooms(roomGeometry), [roomGeometry]);
  const focused = rooms.find((r) => r.id === focusedRoomId) ?? null;
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (mode === 'single') return null;

  if (mode === 'overview') {
    return (
      <div className="dg-apt-bar" role="status">
        <span className="dg-apt-bar__crumb">{apartmentName}</span>
        <span className="dg-apt-bar__sep" aria-hidden>
          ·
        </span>
        <span className="dg-apt-bar__meta">
          {rooms.length} room{rooms.length === 1 ? '' : 's'} · pick a room to design
        </span>
      </div>
    );
  }

  return (
    <div className="dg-apt-bar">
      <button type="button" className="dg-apt-bar__link" onClick={onBackToOverview}>
        {apartmentName}
      </button>
      <span className="dg-apt-bar__sep" aria-hidden>
        ›
      </span>
      <div className="dg-apt-bar__switcher">
        <button
          type="button"
          className="dg-apt-bar__current"
          aria-expanded={switcherOpen}
          aria-haspopup="listbox"
          onClick={() => setSwitcherOpen((v) => !v)}
        >
          {focused?.label ?? 'Room'}
        </button>
        {switcherOpen ? (
          <ul className="dg-apt-bar__menu" role="listbox" aria-label="Rooms">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={room.id === focusedRoomId}
                  className={
                    room.id === focusedRoomId
                      ? 'dg-apt-bar__option is-active'
                      : 'dg-apt-bar__option'
                  }
                  style={roomChipStyle(room)}
                  disabled={!room.tagged}
                  onClick={() => {
                    setSwitcherOpen(false);
                    if (room.tagged) onFocusRoom(room.id);
                  }}
                >
                  {room.label}
                  {!room.tagged ? ' (name first)' : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export interface ApartmentRoomListProps {
  onFocusRoom: (roomId: string) => void;
  onNameRoom: (room: ApartmentRoom) => void;
  highlightedId?: string | null;
  onHighlight?: (roomId: string | null) => void;
}

/** Phase-1 overview: accessible room list (3D dollhouse comes in phase 2). */
export function ApartmentRoomList({
  onFocusRoom,
  onNameRoom,
  highlightedId,
  onHighlight,
}: ApartmentRoomListProps) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const rooms = useMemo(() => resolveApartmentRooms(roomGeometry), [roomGeometry]);

  return (
    <aside className="dg-apt-list" aria-label="Apartment rooms">
      <div className="dg-apt-list__head">Rooms</div>
      <ul className="dg-apt-list__items" role="listbox">
        {rooms.map((room, index) => {
          const areaSqFt = Math.round(room.areaSqIn / 144);
          const active = highlightedId === room.id;
          return (
            <li key={room.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'dg-apt-list__item is-active' : 'dg-apt-list__item'}
                style={roomChipStyle(room)}
                onMouseEnter={() => onHighlight?.(room.id)}
                onMouseLeave={() => onHighlight?.(null)}
                onFocus={() => onHighlight?.(room.id)}
                onClick={() => {
                  if (room.tagged) onFocusRoom(room.id);
                  else onNameRoom(room);
                }}
              >
                <span className="dg-apt-list__index" aria-hidden>
                  {index + 1}
                </span>
                <span className="dg-apt-list__body">
                  <span className="dg-apt-list__label">{room.label}</span>
                  <span className="dg-apt-list__meta">
                    {areaSqFt} sq ft
                    {!room.tagged ? ' · tap to name' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="dg-apt-list__hint">Click a room to furnish it · Esc returns here</p>
    </aside>
  );
}
