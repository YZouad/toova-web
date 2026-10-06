import { useState, type MouseEvent } from 'react';
import type { GalleryRoom } from '../hooks/useGalleryRooms';
import { forkPublicRoom } from '../lib/profiles';
import { Button, Plate } from './kit';
import { RoomPreview } from './RoomPreview';

interface RoomGalleryCardProps {
  room: GalleryRoom;
  isOwner?: boolean;
  plateHeight?: number;
  onOpen: (room: GalleryRoom) => void;
  /** When set, show a Make a copy control on the card. */
  currentUserId?: string | null;
  onCopied?: (newRoomId: string) => void;
  onRequestAuth?: () => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function RoomGalleryCard({
  room,
  isOwner,
  plateHeight = 240,
  onOpen,
  currentUserId,
  onCopied,
  onRequestAuth,
}: RoomGalleryCardProps) {
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const creator = room.creatorHandle
    ? `@${room.creatorHandle}`
    : room.creatorDisplayName ?? 'Creator';
  const pieces = room.previewItems?.length ?? 0;
  const meta = `${pieces} piece${pieces === 1 ? '' : 's'} · ${formatCount(room.likesCount)} likes`;
  const filename = `${room.name.split(' ')[0]?.toLowerCase() ?? 'room'}.jpg`;
  const canCopy = Boolean(room.creatorHandle) && room.userId !== currentUserId;

  async function handleCopy(e: MouseEvent) {
    e.stopPropagation();
    if (!room.creatorHandle) return;
    if (!currentUserId) {
      onRequestAuth?.();
      return;
    }
    setCopyBusy(true);
    setCopyError(null);
    try {
      const newId = await forkPublicRoom(room.creatorHandle, room.id);
      onCopied?.(newId);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Could not copy');
    } finally {
      setCopyBusy(false);
    }
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
    <Plate height={plateHeight} topCaption={filename}>
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
    {canCopy ? (
      <div className="room-gallery-card__copy-btn" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="outline" disabled={copyBusy} onClick={(e) => void handleCopy(e)}>
          {copyBusy ? 'Copying…' : 'Make a copy'}
        </Button>
        {copyError ? (
          <span className="kit-mono-meta kit-mono-meta--sm" style={{ color: '#b44', display: 'block', marginTop: 4 }}>
            {copyError}
          </span>
        ) : null}
      </div>
    ) : null}
    </div>
  );
}
