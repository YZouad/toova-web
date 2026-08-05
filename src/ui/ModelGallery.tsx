import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGalleryCatalog, type GalleryModel } from '../hooks/useGalleryCatalog';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../hooks/useBuiltinPreviews';
import type { GallerySort, GallerySource } from '../lib/galleryCatalog';
import { GalleryFilters } from './GalleryFilters';
import { ModelCard } from './ModelCard';
import { ModelDetailModal } from './ModelDetailModal';

interface ModelGalleryProps {
  source: GallerySource;
  sort: GallerySort;
  category: string | null;
  query: string;
  showMine?: boolean;
  dense?: boolean;
  currentUserId?: string | null;
  placeLabel?: string;
  recentRail?: ReactNode;
  headerActions?: ReactNode;
  onSourceChange: (source: GallerySource) => void;
  onSortChange: (sort: GallerySort) => void;
  onCategoryChange: (category: string | null) => void;
  onQueryChange: (query: string) => void;
  onPlace: (model: GalleryModel) => void;
  onModelsChange?: (models: GalleryModel[]) => void;
}

export function ModelGallery({
  source,
  sort,
  category,
  query,
  showMine,
  dense,
  currentUserId,
  placeLabel,
  recentRail,
  headerActions,
  onSourceChange,
  onSortChange,
  onCategoryChange,
  onQueryChange,
  onPlace,
  onModelsChange,
}: ModelGalleryProps) {
  const builtinPreviews = useBuiltinPreviews();
  const {
    models,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    patchModel,
    removeModel,
  } = useGalleryCatalog({
    enabled: true,
    source,
    sort,
    category,
    query,
  });

  const [selected, setSelected] = useState<GalleryModel | null>(null);
  const [editStart, setEditStart] = useState(false);

  useEffect(() => {
    onModelsChange?.(models);
  }, [models, onModelsChange]);

  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return models.find((m) => m.kind === selected.kind) ?? selected;
  }, [models, selected]);

  return (
    <div className={`model-gallery${dense ? ' model-gallery--dense' : ''}`}>
      <GalleryFilters
        entity="models"
        source={source}
        sort={sort}
        category={category}
        query={query}
        showMine={showMine}
        dense={dense}
        onSourceChange={onSourceChange}
        onSortChange={(s) => onSortChange(s as GallerySort)}
        onCategoryChange={onCategoryChange}
        onQueryChange={onQueryChange}
      />

      {headerActions}

      {recentRail}

      <div className="model-gallery-status">
        {loading ? 'Loading…' : `${total} model${total === 1 ? '' : 's'}`}
      </div>

      {error ? (
        <div className="tv-banner-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && models.length === 0 ? (
        <div className="model-gallery-empty">
          {source === 'mine'
            ? 'You haven’t created any models yet. Upload one to get started.'
            : 'No models match these filters.'}
        </div>
      ) : (
        <div className={`model-gallery-grid${dense ? ' model-gallery-grid--dense' : ''}`}>
          {models.map((m) => (
            <ModelCard
              key={m.kind}
              model={m}
              dense={dense}
              isOwner={source === 'mine'}
              builtinPreviewUrl={
                m.isBuiltin ? getBuiltinPreviewUrl(m.kind, builtinPreviews) : null
              }
              onOpen={(model) => {
                setEditStart(false);
                setSelected(model);
              }}
              onEdit={(model) => {
                setEditStart(true);
                setSelected(model);
              }}
            />
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
          startInEdit={editStart}
          onClose={() => {
            setSelected(null);
            setEditStart(false);
          }}
          onPlace={(m) => {
            onPlace(m);
            setSelected(null);
          }}
          onModelPatched={patchModel}
          onModelDeleted={removeModel}
        />
      ) : null}
    </div>
  );
}
