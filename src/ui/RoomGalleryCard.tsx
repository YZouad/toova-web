import type { GalleryRoom } from '../hooks/useGalleryRooms';
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

  return (
    <article className="room-gallery-card">
      <button
        type="button"
        className="room-gallery-card-main"
        onClick={() => onOpen(room)}
      >
        <div className="room-gallery-card-preview">
          {room.thumbnailUrl ? (
            <img src={room.thumbnailUrl} alt="" className="room-gallery-card-thumb" />
          ) : (
            <RoomPreview geometry={room.roomGeometry} items={room.previewItems} />
          )}
          {isOwner && room.visibility ? (
            <span className={`model-card-vis model-card-vis--${room.visibility}`}>
              {room.visibility}
            </span>
          ) : null}
        </div>
        <div className="room-gallery-card-body">
          <div className="room-gallery-card-title">{room.name}</div>
          <div className="room-gallery-card-creator">{creator}</div>
          <div className="room-gallery-card-stats" aria-label="Engagement">
            <span title="Likes">♥ {formatCount(room.likesCount)}</span>
            <span title="Views">👁 {formatCount(room.viewsCount)}</span>
            <span title="Clones">⧉ {formatCount(room.forkCount)}</span>
          </div>
        </div>
      </button>
    </article>
  );
}
