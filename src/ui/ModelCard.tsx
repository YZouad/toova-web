import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { catalogCategoryLabel } from '../lib/catalogCategories';
import { FurniturePreview } from './FurniturePreview';

interface ModelCardProps {
  model: GalleryModel;
  builtinPreviewUrl?: string | null;
  dense?: boolean;
  isOwner?: boolean;
  onOpen: (model: GalleryModel) => void;
  onEdit?: (model: GalleryModel) => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ModelCard({
  model,
  builtinPreviewUrl,
  dense,
  isOwner,
  onOpen,
  onEdit,
}: ModelCardProps) {
  const previewUrl = model.isBuiltin
    ? builtinPreviewUrl ?? model.previewUrl
    : model.previewUrl;
  const creatorLabel = model.isBuiltin
    ? 'Toova'
    : model.creatorHandle
      ? `@${model.creatorHandle}`
      : model.creatorDisplayName ?? 'Creator';

  return (
    <article className={`model-card${dense ? ' model-card--dense' : ''}`}>
      <button
        type="button"
        className="model-card-main"
        onClick={() => onOpen(model)}
      >
        <div className="model-card-preview">
          <FurniturePreview
            kind={model.isBuiltin ? model.kind : 'imported'}
            size={[model.width_in, model.height_in, model.depth_in]}
            previewUrl={previewUrl}
            className="model-card-preview-inner"
          />
          {isOwner ? (
            <span className={`model-card-vis model-card-vis--${model.visibility}`}>
              {model.visibility}
            </span>
          ) : null}
        </div>
        <div className="model-card-body">
          <div className="model-card-title">{model.label}</div>
          <div className="model-card-creator">{creatorLabel}</div>
          {model.categories.length > 0 ? (
            <div className="model-card-cats">
              {model.categories.slice(0, 3).map((c) => (
                <span key={c} className="model-card-cat">
                  {catalogCategoryLabel(c)}
                </span>
              ))}
            </div>
          ) : null}
          <div className="model-card-stats" aria-label="Engagement">
            <span title="Views">👁 {formatCount(model.viewsCount)}</span>
            <span title="Likes">♥ {formatCount(model.likesCount)}</span>
            <span title="Downloads">↓ {formatCount(model.downloadsCount)}</span>
          </div>
        </div>
      </button>
      {isOwner && onEdit ? (
        <button
          type="button"
          className="model-card-edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(model);
          }}
        >
          Edit
        </button>
      ) : null}
    </article>
  );
}
