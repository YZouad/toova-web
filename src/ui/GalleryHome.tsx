import { useMemo, useState } from 'react';
import { useGalleryHome } from '../hooks/useGalleryHome';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { GalleryRoom } from '../hooks/useGalleryRooms';
import {
  buildGallerySearchParams,
  type GallerySort,
  type RoomGallerySortParam,
} from '../lib/galleryCatalog';
import { galleryPath, navigate, publicRoomPath } from '../hooks/useRoute';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../hooks/useBuiltinPreviews';
import { GalleryShelf } from './GalleryShelf';
import { ModelCard } from './ModelCard';
import { ModelDetailModal } from './ModelDetailModal';
import { RoomGalleryCard } from './RoomGalleryCard';

interface GalleryHomeProps {
  currentUserId?: string | null;
  placeLabel?: string;
  onPlace: (model: GalleryModel) => void;
  onRequestAuth?: () => void;
}

function seeAllModels(sort: GallerySort): string {
  return galleryPath(
    buildGallerySearchParams({
      mode: 'models',
      source: 'community',
      sort,
      category: null,
      query: '',
    }),
  );
}

function seeAllRooms(sort: RoomGallerySortParam): string {
  return galleryPath(
    buildGallerySearchParams({
      mode: 'rooms',
      roomSort: sort,
      query: '',
    }),
  );
}

export function GalleryHome({
  currentUserId,
  placeLabel = 'Use in a room',
  onPlace,
}: GalleryHomeProps) {
  const builtinPreviews = useBuiltinPreviews();
  const { data, loading, error, patchModel } = useGalleryHome(true);
  const [selected, setSelected] = useState<GalleryModel | null>(null);

  const selectedLive = useMemo(() => {
    if (!selected || !data) return selected;
    const all = [...data.modelsHot, ...data.modelsLiked];
    return all.find((m) => m.kind === selected.kind) ?? selected;
  }, [selected, data]);

  function openRoom(room: GalleryRoom) {
    if (!room.creatorHandle) return;
    navigate(publicRoomPath(room.creatorHandle, room.id));
  }

  if (loading && !data) {
    return <div className="gallery-home-status">Loading…</div>;
  }

  if (error && !data) {
    return (
      <div className="tv-banner-error" role="alert">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="gallery-home">
      <GalleryShelf
        title="Trending rooms"
        onSeeAll={() => navigate(seeAllRooms('hot'))}
        empty={data.roomsHot.length === 0}
      >
        {data.roomsHot.map((room) => (
          <div key={room.id} className="gallery-shelf-item">
            <RoomGalleryCard room={room} onOpen={openRoom} />
          </div>
        ))}
      </GalleryShelf>

      <GalleryShelf
        title="Most liked rooms"
        onSeeAll={() => navigate(seeAllRooms('likes'))}
        empty={data.roomsLiked.length === 0}
      >
        {data.roomsLiked.map((room) => (
          <div key={room.id} className="gallery-shelf-item">
            <RoomGalleryCard room={room} onOpen={openRoom} />
          </div>
        ))}
      </GalleryShelf>

      <GalleryShelf
        title="Trending models"
        onSeeAll={() => navigate(seeAllModels('hot'))}
        empty={data.modelsHot.length === 0}
      >
        {data.modelsHot.map((model) => (
          <div key={model.kind} className="gallery-shelf-item">
            <ModelCard
              model={model}
              builtinPreviewUrl={
                model.isBuiltin
                  ? getBuiltinPreviewUrl(model.kind, builtinPreviews)
                  : null
              }
              onOpen={setSelected}
            />
          </div>
        ))}
      </GalleryShelf>

      <GalleryShelf
        title="Most liked models"
        onSeeAll={() => navigate(seeAllModels('likes'))}
        empty={data.modelsLiked.length === 0}
      >
        {data.modelsLiked.map((model) => (
          <div key={model.kind} className="gallery-shelf-item">
            <ModelCard
              model={model}
              builtinPreviewUrl={
                model.isBuiltin
                  ? getBuiltinPreviewUrl(model.kind, builtinPreviews)
                  : null
              }
              onOpen={setSelected}
            />
          </div>
        ))}
      </GalleryShelf>

      {!loading &&
      data.roomsHot.length === 0 &&
      data.roomsLiked.length === 0 &&
      data.modelsHot.length === 0 &&
      data.modelsLiked.length === 0 ? (
        <div className="model-gallery-empty">
          Nothing to discover yet. Publish a room or model to get started.
        </div>
      ) : null}

      {selectedLive ? (
        <ModelDetailModal
          model={selectedLive}
          builtinPreviewUrl={
            selectedLive.isBuiltin
              ? getBuiltinPreviewUrl(selectedLive.kind, builtinPreviews)
              : null
          }
          currentUserId={currentUserId}
          placeLabel={placeLabel}
          onClose={() => setSelected(null)}
          onPlace={(m) => {
            onPlace(m);
            setSelected(null);
          }}
          onModelPatched={patchModel}
          onModelDeleted={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
