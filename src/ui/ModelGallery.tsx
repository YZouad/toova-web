import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGalleryCatalog, type GalleryModel } from '../hooks/useGalleryCatalog';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../hooks/useBuiltinPreviews';
import type { GallerySort, GallerySource } from '../lib/galleryCatalog';
import { Banner, Button, EmptyState, MonoMeta, Spinner } from './kit';
import { GalleryFilters } from './GalleryFilters';
import { ModelCard } from './ModelCard';
import { ModelDetailModal } from './ModelDetailModal';

interface ModelGalleryProps {
  source: GallerySource;
  sort: GallerySort;
  categories: string[];
  query: string;
  showMine?: boolean;
  hideSourceTabs?: boolean;
  dense?: boolean;
  /** Embed search in the filters row (designer panel). */
  showSearch?: boolean;
  /** When true, parent owns sort/category (gallery page header). */
  hideSortAndCategory?: boolean;
  currentUserId?: string | null;
  placeLabel?: string;
  recentRail?: ReactNode;
  headerActions?: ReactNode;
  onSourceChange: (source: GallerySource) => void;
  onSortChange: (sort: GallerySort) => void;
  onCategoriesChange: (categories: string[]) => void;
  onQueryChange: (query: string) => void;
  onPlace: (model: GalleryModel) => void;
  onModelsChange?: (models: GalleryModel[]) => void;
}

export function ModelGallery({
  source,
  sort,
  categories,
  query,
  showMine,
  hideSourceTabs = false,
  dense,
  showSearch = false,
  hideSortAndCategory = true,
  currentUserId,
  placeLabel,
  recentRail,
  headerActions,
  onSourceChange,
  onSortChange,
  onCategoriesChange,
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
    categories,
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
        categories={categories}
        query={query}
        showMine={showMine}
        hideSourceTabs={hideSourceTabs}
        dense={dense}
        showSearch={showSearch}
        hideSortAndCategory={hideSortAndCategory}
        onSourceChange={onSourceChange}
        onSortChange={(s) => onSortChange(s as GallerySort)}
        onCategoriesChange={onCategoriesChange}
        onQueryChange={onQueryChange}
      />

      {headerActions}
      {recentRail}

      <MonoMeta size="sm" tone="dense" style={{ display: 'block', margin: '12px 0' }}>
        {loading
          ? models.length > 0
            ? 'Loading…'
            : null
          : `${total} model${total === 1 ? '' : 's'}`}
      </MonoMeta>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading && models.length === 0 ? (
        <Spinner label="Loading models…" style={{ padding: '32px 0' }} />
      ) : null}

      {!loading && models.length === 0 ? (
        <EmptyState
          label="No models"
          title={
            source === 'mine'
              ? 'You haven’t created any models yet.'
              : 'No models match these filters.'
          }
          body={source === 'mine' ? 'Upload one to get started.' : undefined}
        />
      ) : (
        <div className={`gallery-plate-grid${dense ? ' gallery-plate-grid--models' : ''}`}>
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
