import { parseFloorPlan } from '../../lib/roomGeometry';
import { formatRelativeTime } from '../../lib/userDisplay';
import { navigate } from '../../hooks/useRoute';
import { publicRoomPath, type ProfileRoomCard } from '../../lib/profiles';
import { SpotlightCard } from '../bits';
import { Badge, Banner, EmptyState, MonoMeta, Plate, SectionOpener } from '../kit';
import { RoomPreview, type RoomPreviewItem } from '../RoomPreview';
import {
  attributionLabel,
  formatSqft,
  toPreviewItems,
  visibilityLabel,
} from './profileHelpers';

export interface ProfileRoomsTabProps {
  rooms: ProfileRoomCard[];
  isOwner: boolean;
  profileHandle: string;
  profileIsPublic: boolean;
  roomPreviews: Record<string, RoomPreviewItem[]>;
}

export function ProfileRoomsTab({
  rooms,
  isOwner,
  profileHandle,
  profileIsPublic,
  roomPreviews,
}: ProfileRoomsTabProps) {
  const hasPrivate =
    isOwner && rooms.some((r) => r.visibility !== 'public' || !profileIsPublic);

  return (
    <section className="profile-ledger" aria-labelledby="tab-rooms">
      <SectionOpener
        level={5}
        title={isOwner ? 'Your rooms.' : 'Published rooms.'}
        note={`${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
      />

      {hasPrivate ? (
        <Banner tone="info" className="profile-rooms-banner">
          Private rooms are only visible to you. Publish from the dashboard to show visitors.
        </Banner>
      ) : null}

      {rooms.length === 0 ? (
        <EmptyState
          style={{ marginTop: 32 }}
          label="No rooms"
          title={isOwner ? 'No rooms yet.' : 'No published rooms yet.'}
          body={isOwner ? 'Publish a room from your dashboard to show it here.' : undefined}
        />
      ) : (
        <div className="profile-ledger-list">
          <div className="app-ledger-head">
            <span>Plan</span>
            <span>Room</span>
            <span>Engagement</span>
            <span>Floor area</span>
            <span>Updated</span>
            <span className="app-ledger-head__right">Visibility</span>
            <span aria-hidden />
          </div>
          {rooms.map((room) => {
            const items = roomPreviews[room.id] ?? toPreviewItems(room);
            const geometry = parseFloorPlan(room.room_geometry);
            const attr = attributionLabel(room);
            const canOpenPublic = room.visibility === 'public' && profileIsPublic;
            return (
              <SpotlightCard
                key={room.id}
                className={[
                  'app-ledger-row',
                  'profile-room-row',
                  canOpenPublic ? 'app-ledger-row--interactive' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={
                  canOpenPublic
                    ? () => navigate(publicRoomPath(profileHandle, room.id))
                    : undefined
                }
                role={canOpenPublic ? 'button' : undefined}
                tabIndex={canOpenPublic ? 0 : undefined}
              >
                <Plate height={84} topCaption={`${room.name.slice(0, 12).toLowerCase()}.jpg`}>
                  <div className="app-ledger-plate-preview">
                    <RoomPreview geometry={geometry} items={items} />
                  </div>
                </Plate>
                <div>
                  <div className="app-ledger-name">{room.name}</div>
                  {attr ? <div className="app-ledger-attribution">{attr}</div> : null}
                </div>
                <MonoMeta size="md" tone="default">
                  ♥ {Number(room.likes_count ?? 0)} · 👁 {Number(room.views_count ?? 0)}
                </MonoMeta>
                <MonoMeta size="md" tone="default">
                  {formatSqft(geometry)}
                </MonoMeta>
                <MonoMeta size="md" tone="default">
                  {formatRelativeTime(room.updated_at)}
                </MonoMeta>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Badge
                    tone={room.visibility === 'public' ? 'accent' : 'neutral'}
                    dot={room.visibility === 'public'}
                    title={
                      isOwner && !canOpenPublic
                        ? room.visibility === 'public'
                          ? 'Make your profile public to share this link.'
                          : 'Publish from the dashboard to show visitors.'
                        : undefined
                    }
                  >
                    {visibilityLabel(room.visibility)}
                  </Badge>
                </div>
                <span />
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </section>
  );
}
