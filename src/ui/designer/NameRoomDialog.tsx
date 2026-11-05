import { useMemo, useState } from 'react';
import type { ApartmentRoom } from '../../lib/apartmentRooms';
import { defaultRoomName, resolveApartmentRooms } from '../../lib/apartmentRooms';
import { ROOM_TAGS, roomTagLabel, type RoomTag } from '../../lib/roomTags';
import { setZoneTag } from '../../lib/floorPlanGeometry';
import { useStore } from '../../store';

export interface NameRoomDialogProps {
  room: ApartmentRoom;
  onCancel: () => void;
  /** Called after the zone is written; receives the new zone id. */
  onNamed: (zoneId: string) => void;
}

export function NameRoomDialog({ room, onCancel, onNamed }: NameRoomDialogProps) {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setRoomGeometry = useStore((s) => s.setRoomGeometry);
  const existing = useMemo(() => resolveApartmentRooms(roomGeometry), [roomGeometry]);
  const [tag, setTag] = useState<RoomTag>('other');
  const [name, setName] = useState(() => defaultRoomName('other', existing));

  const submit = () => {
    const [ax, az] = room.labelAnchor;
    const next = setZoneTag(roomGeometry, ax, az, tag, name.trim() || undefined);
    setRoomGeometry(next);
    const zones = next.zones ?? [];
    const zone =
      zones.find((z) => Math.hypot(z.x - ax, z.z - az) < 1) ?? zones[zones.length - 1];
    if (zone) onNamed(zone.id);
    else onCancel();
  };

  return (
    <div
      className="dg-apt-name"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="dg-apt-name__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Name this room"
      >
        <div className="dg-apt-name__head">
          <h2 className="dg-apt-name__title">Name this room</h2>
          <p className="dg-apt-name__sub">
            Tag the area so it shows up in the apartment overview and checklist.
          </p>
        </div>
        <label className="dg-apt-name__field">
          <span>Type</span>
          <select
            value={tag}
            onChange={(e) => {
              const next = e.target.value as RoomTag;
              setTag(next);
              setName(defaultRoomName(next, existing));
            }}
          >
            {ROOM_TAGS.map((t) => (
              <option key={t} value={t}>
                {roomTagLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="dg-apt-name__field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={roomTagLabel(tag)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <div className="dg-apt-name__actions">
          <button type="button" className="dg-btn is-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dg-btn is-primary" onClick={submit}>
            Open room
          </button>
        </div>
      </div>
    </div>
  );
}
