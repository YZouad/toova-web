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
import { Banner, EmptyState, Spinner } from './kit';
import { GalleryShelf } from './GalleryShelf';
import { ModelCard } from './ModelCard';
import { ModelDetailModal } from './ModelDetailModal';
import { RoomGalleryCard } from './RoomGalleryCard';

interface GalleryHomeProps {
  currentUserId?: string | null;
  placeLabel?: string;
  /** Which shelves to render. Default shows rooms + models (legacy discover). */
  scope?: 'all' | 'rooms' | 'models';
  onPlace: (model: GalleryModel) => void;
  onRequestAuth?: () => void;
  onSeeAllRooms?: () => void;
  onSeeAllModels?: () => void;
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
  scope = 'all',
  onPlace,
  onSeeAllRooms,
  onSeeAllModels,
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
    return <Spinner label="Loading gallery…" style={{ padding: '48px 0' }} />;
  }

  if (error && !data) {
    return <Banner tone="error">{error}</Banner>;
  }

  if (!data) return null;

  const showRooms = scope === 'all' || scope === 'rooms';
  const showModels = scope === 'all' || scope === 'models';

  return (
    <div className="gallery-home">
      {showRooms ? (
        <>
          <GalleryShelf
            title="Trending rooms"
            note={`${data.roomsHot.length} rooms · updated hourly`}
            onSeeAll={onSeeAllRooms ?? (() => navigate(seeAllRooms('hot')))}
            empty={data.roomsHot.length === 0}
          >
            <div className="gallery-shelf-grid">
              {data.roomsHot.map((room) => (
                <RoomGalleryCard key={room.id} room={room} onOpen={openRoom} />
              ))}
            </div>
          </GalleryShelf>

          <GalleryShelf
            title="Most liked"
            note="All time"
            onSeeAll={onSeeAllRooms ?? (() => navigate(seeAllRooms('likes')))}
            empty={data.roomsLiked.length === 0}
          >
            <div className="gallery-shelf-grid">
              {data.roomsLiked.map((room) => (
                <RoomGalleryCard key={room.id} room={room} onOpen={openRoom} />
              ))}
            </div>
          </GalleryShelf>
        </>
      ) : null}

      {showModels ? (
        <>
          <GalleryShelf
            title="Trending models"
            note={`${data.modelsHot.length} models · community`}
            onSeeAll={onSeeAllModels ?? (() => navigate(seeAllModels('hot')))}
            empty={data.modelsHot.length === 0}
          >
            <div className="gallery-plate-grid gallery-plate-grid--models">
              {data.modelsHot.map((model) => (
                <ModelCard
                  key={model.kind}
                  model={model}
                  dense
                  builtinPreviewUrl={
                    model.isBuiltin
                      ? getBuiltinPreviewUrl(model.kind, builtinPreviews)
                      : null
                  }
                  onOpen={setSelected}
                />
              ))}
            </div>
          </GalleryShelf>

          {scope === 'all' ? (
            <GalleryShelf
              title="Most liked models"
              note="All time"
              onSeeAll={onSeeAllModels ?? (() => navigate(seeAllModels('likes')))}
              empty={data.modelsLiked.length === 0}
            >
              <div className="gallery-plate-grid gallery-plate-grid--models">
                {data.modelsLiked.map((model) => (
                  <ModelCard
                    key={model.kind}
                    model={model}
                    dense
                    builtinPreviewUrl={
                      model.isBuiltin
                        ? getBuiltinPreviewUrl(model.kind, builtinPreviews)
                        : null
                    }
                    onOpen={setSelected}
                  />
                ))}
              </div>
            </GalleryShelf>
          ) : null}
        </>
      ) : null}

      {!loading &&
      ((showRooms && data.roomsHot.length === 0 && data.roomsLiked.length === 0) ||
        !showRooms) &&
      ((showModels && data.modelsHot.length === 0 && data.modelsLiked.length === 0) ||
        !showModels) ? (
        <EmptyState
          label="Empty gallery"
          title="Nothing to discover yet."
          body="Publish a room or model to get started."
        />
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
