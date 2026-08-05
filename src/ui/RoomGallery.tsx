import { useGalleryRooms, type GalleryRoom } from '../hooks/useGalleryRooms';
import type { RoomGallerySortParam } from '../lib/galleryCatalog';
import { navigate, publicRoomPath } from '../hooks/useRoute';
import { GalleryFilters } from './GalleryFilters';
import { RoomGalleryCard } from './RoomGalleryCard';

interface RoomGalleryProps {
  sort: RoomGallerySortParam;
  query: string;
  onSortChange: (sort: RoomGallerySortParam) => void;
  onQueryChange: (query: string) => void;
}

export function RoomGallery({
  sort,
  query,
  onSortChange,
  onQueryChange,
}: RoomGalleryProps) {
  const {
    rooms,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
  } = useGalleryRooms({
    enabled: true,
    source: 'community',
    sort,
    query,
  });

  function openRoom(room: GalleryRoom) {
    if (!room.creatorHandle) return;
    navigate(publicRoomPath(room.creatorHandle, room.id));
  }

  return (
    <div className="room-gallery">
      <GalleryFilters
        entity="rooms"
        source="community"
        sort={sort}
        category={null}
        query={query}
        onSourceChange={() => {
          /* rooms are always community */
        }}
        onSortChange={(s) => onSortChange(s as RoomGallerySortParam)}
        onCategoryChange={() => {
          /* rooms have no categories */
        }}
        onQueryChange={onQueryChange}
      />

      <div className="model-gallery-status">
        {loading ? 'Loading…' : `${total} room${total === 1 ? '' : 's'}`}
      </div>

      {error ? (
        <div className="tv-banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="model-gallery-empty">No public rooms match these filters.</div>
      ) : (
        <div className="room-gallery-grid">
          {rooms.map((room) => (
            <RoomGalleryCard key={room.id} room={room} onOpen={openRoom} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="model-gallery-more">
          <button
            type="button"
            className="shared-btn-secondary"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
