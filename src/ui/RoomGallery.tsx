import { useGalleryRooms, type GalleryRoom } from '../hooks/useGalleryRooms';
import type { RoomGallerySortParam } from '../lib/galleryCatalog';
import { navigate, publicRoomPath } from '../hooks/useRoute';
import { Banner, Button, EmptyState, MonoMeta, Spinner } from './kit';
import { GalleryFilters } from './GalleryFilters';
import { RoomGalleryCard } from './RoomGalleryCard';

interface RoomGalleryProps {
  sort: RoomGallerySortParam;
  query: string;
  hideFilters?: boolean;
  showSearch?: boolean;
  onSortChange: (sort: RoomGallerySortParam) => void;
  onQueryChange: (query: string) => void;
}

export function RoomGallery({
  sort,
  query,
  hideFilters,
  showSearch,
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
      {hideFilters ? null : (
        <GalleryFilters
          entity="rooms"
          source="community"
          sort={sort}
          categories={[]}
          query={query}
          showSearch={showSearch}
          onSourceChange={() => {
            /* rooms are always community */
          }}
          onSortChange={(s) => onSortChange(s as RoomGallerySortParam)}
          onCategoriesChange={() => {
            /* rooms have no categories */
          }}
          onQueryChange={onQueryChange}
        />
      )}

      <MonoMeta size="sm" tone="dense" style={{ display: 'block', margin: '12px 0' }}>
        {loading ? 'Loading…' : `${total} room${total === 1 ? '' : 's'}`}
      </MonoMeta>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading && rooms.length === 0 ? (
        <Spinner label="Loading rooms…" style={{ padding: '32px 0' }} />
      ) : null}

      {!loading && rooms.length === 0 ? (
        <EmptyState
          label="No rooms"
          title="No public rooms match these filters."
        />
      ) : (
        <div className="gallery-shelf-grid">
          {rooms.map((room) => (
            <RoomGalleryCard key={room.id} room={room} onOpen={openRoom} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
