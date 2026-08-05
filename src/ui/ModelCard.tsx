import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { catalogCategoryLabel } from '../lib/catalogCategories';
import { MonoMeta, Plate, PlateCard } from './kit';
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

function formatDims(w: number, h: number, d: number): string {
  return `${Math.round(w)} × ${Math.round(h)} × ${Math.round(d)}`;
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
  const category = model.categories[0]
    ? catalogCategoryLabel(model.categories[0])
    : 'Model';
  const stats = `♥ ${formatCount(model.likesCount)} · ↓ ${formatCount(model.downloadsCount)}`;
  const filename = `${model.kind.split('-')[0]}.glb`;

  const previewPlate = previewUrl ? (
    <PlateCard
      name={model.label}
      author={creatorLabel}
      meta={dense ? undefined : stats}
      height={dense ? 150 : 240}
      filename={filename}
      src={previewUrl}
      onClick={() => onOpen(model)}
    />
  ) : (
    <div>
      <div
        className="kit-plate-card kit-plate-card--interactive"
        onClick={() => onOpen(model)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(model);
          }
        }}
      >
        <Plate height={dense ? 150 : 240} topCaption={filename}>
          <FurniturePreview
            kind={model.isBuiltin ? model.kind : 'imported'}
            className="furniture-preview-fill"
          />
          {isOwner ? (
            <span className={`gallery-vis-badge gallery-vis-badge--${model.visibility}`}>
              {model.visibility}
            </span>
          ) : null}
        </Plate>
        <div className="kit-plate-card__caption">
          <div>
            <div className="kit-plate-card__name">{model.label}</div>
            <div className="kit-plate-card__author">{creatorLabel}</div>
          </div>
          {!dense && stats ? (
            <MonoMeta size="sm" tone="dense">
              {stats}
            </MonoMeta>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (dense) {
    return (
      <article className="gallery-model-dense">
        {previewPlate}
        <div className="gallery-model-meta-row">
          <MonoMeta size="xs" tone="dense" upper>
            {category}
          </MonoMeta>
          <MonoMeta size="xs" tone="dense">
            {formatDims(model.width_in, model.height_in, model.depth_in)}
          </MonoMeta>
        </div>
        {isOwner && onEdit ? (
          <button type="button" className="gallery-model-edit" onClick={() => onEdit(model)}>
            Edit
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <article className="gallery-model-card">
      {previewPlate}
      {isOwner && onEdit ? (
        <button type="button" className="gallery-model-edit" onClick={() => onEdit(model)}>
          Edit
        </button>
      ) : null}
    </article>
  );
}
