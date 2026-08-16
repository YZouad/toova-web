import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { GallerySort, GallerySource } from '../lib/galleryCatalog';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../hooks/useBuiltinPreviews';
import { FurniturePreview } from './FurniturePreview';
import { ModelGallery } from './ModelGallery';
import { Button } from './kit/Button';

const RECENT_KEY = 'toova-recent-kinds';
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentKind(kind: string) {
  const prev = loadRecent().filter((k) => k !== kind);
  const next = [kind, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

interface DesignerGalleryPanelProps {
  open: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onPlace: (model: GalleryModel) => void;
  onOpenImport: (tab: 'upload' | 'generate' | 'poster') => void;
}

export function DesignerGalleryPanel({
  open,
  currentUserId,
  onClose,
  onPlace,
  onOpenImport,
}: DesignerGalleryPanelProps) {
  const [source, setSource] = useState<GallerySource>('toova');
  const [sort, setSort] = useState<GallerySort>('hot');
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [recentKinds, setRecentKinds] = useState<string[]>(loadRecent);
  const [knownModels, setKnownModels] = useState<GalleryModel[]>([]);
  const builtinPreviews = useBuiltinPreviews();

  useEffect(() => {
    if (open) setRecentKinds(loadRecent());
  }, [open]);

  const mergeKnownModels = useCallback((models: GalleryModel[]) => {
    setKnownModels((prev) => {
      const map = new Map(prev.map((m) => [m.kind, m]));
      for (const m of models) map.set(m.kind, m);
      return [...map.values()];
    });
  }, []);

  const recentModels = useMemo(
    () =>
      recentKinds
        .map((k) => knownModels.find((m) => m.kind === k))
        .filter(Boolean) as GalleryModel[],
    [recentKinds, knownModels],
  );

  const handlePlace = useCallback(
    (model: GalleryModel) => {
      pushRecentKind(model.kind);
      setRecentKinds(loadRecent());
      onPlace(model);
    },
    [onPlace],
  );

  if (!open) return null;

  return (
    <div className="designer-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="designer-palette designer-gallery-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Furniture gallery"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-head">
          <div className="palette-head-row" style={{ marginBottom: 0 }}>
            <div className="palette-title">Add furniture</div>
            <button type="button" className="palette-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="palette-promo">
          <div className="palette-promo-copy">
            <strong>Create a model</strong>
            <span>Generate from a photo or upload a GLB</span>
          </div>
          <div className="palette-promo-actions">
            <Button size="sm" onClick={() => onOpenImport('generate')}>
              Upload
            </Button>
          </div>
        </div>

        <ModelGallery
          source={source}
          sort={sort}
          categories={categories}
          query={query}
          showMine={!!currentUserId}
          dense
          showSearch
          hideSortAndCategory={false}
          currentUserId={currentUserId}
          placeLabel="Add to room"
          onSourceChange={(s) => {
            setSource(s);
            if (s === 'mine' && sort === 'hot') setSort('newest');
            else if (s !== 'mine' && sort === 'newest') setSort('hot');
          }}
          onSortChange={setSort}
          onCategoriesChange={setCategories}
          onQueryChange={setQuery}
          onPlace={handlePlace}
          onModelsChange={mergeKnownModels}
          recentRail={
            recentModels.length > 0 ? (
              <div className="palette-recent-block">
                <div className="palette-section-label">Recently used</div>
                <div className="palette-recent tv-scroll">
                  {recentModels.map((r) => (
                    <button
                      key={r.kind}
                      type="button"
                      className="palette-recent-chip"
                      onClick={() => handlePlace(r)}
                    >
                      <FurniturePreview
                        kind={r.isBuiltin ? r.kind : 'imported'}
                        size={[r.width_in, r.height_in, r.depth_in]}
                        previewUrl={
                          r.isBuiltin
                            ? getBuiltinPreviewUrl(r.kind, builtinPreviews)
                            : r.previewUrl
                        }
                        className="palette-recent-preview"
                      />
                      <span className="palette-recent-label">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
