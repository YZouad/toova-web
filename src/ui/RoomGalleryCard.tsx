import type { GalleryRoom } from '../hooks/useGalleryRooms';
import { Plate, PlateCard } from './kit';
import { RoomPreview } from './RoomPreview';

interface RoomGalleryCardProps {
  room: GalleryRoom;
  isOwner?: boolean;
  onOpen: (room: GalleryRoom) => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function RoomGalleryCard({ room, isOwner, onOpen }: RoomGalleryCardProps) {
  const creator = room.creatorHandle
    ? `@${room.creatorHandle}`
    : room.creatorDisplayName ?? 'Creator';
  const pieces = room.previewItems?.length ?? 0;
  const meta = `${pieces} piece${pieces === 1 ? '' : 's'} · ${formatCount(room.likesCount)} likes`;
  const filename = `${room.name.split(' ')[0]?.toLowerCase() ?? 'room'}.jpg`;

  if (room.thumbnailUrl) {
    return (
      <PlateCard
        name={room.name}
        author={creator}
        meta={meta}
        height={240}
        filename={filename}
        src={room.thumbnailUrl}
        onClick={() => onOpen(room)}
      />
    );
  }

  return (
    <div
      className="kit-plate-card kit-plate-card--interactive"
      onClick={() => onOpen(room)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(room);
        }
      }}
    >
      <Plate height={240} topCaption={filename}>
        <div className="app-ledger-plate-preview">
          <RoomPreview geometry={room.roomGeometry} items={room.previewItems} />
        </div>
        {isOwner && room.visibility ? (
          <span className={`gallery-vis-badge gallery-vis-badge--${room.visibility}`}>
            {room.visibility}
          </span>
        ) : null}
      </Plate>
      <div className="kit-plate-card__caption">
        <div>
          <div className="kit-plate-card__name">{room.name}</div>
          <div className="kit-plate-card__author">{creator}</div>
        </div>
        <span className="kit-mono-meta kit-mono-meta--sm kit-mono-meta--dense">{meta}</span>
      </div>
    </div>
  );
}
