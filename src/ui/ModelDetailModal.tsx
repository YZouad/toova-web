import { useEffect, useId, useRef, useState } from 'react';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import {
  hasReportedCatalogKind,
  recordCatalogView,
  reportCatalogModel,
  setCatalogVisibility,
  toggleCatalogLike,
  type CatalogReportReason,
  type CatalogVisibility,
} from '../lib/catalogEngagement';
import {
  catalogCategoryLabel,
} from '../lib/catalogCategories';
import { deleteCatalogModel, updateCatalogModel } from '../lib/galleryCatalog';
import {
  MODEL_FILES_BUCKET,
  catalogModelDownloadFilename,
  downloadModelFile,
  resolveBrowsableModelUrl,
} from '../lib/modelStorage';
import { removePublicModelMirrors } from '../lib/publicModelsMirror';
import { supabase } from '../lib/supabase';
import { profilePath, navigate } from '../hooks/useRoute';
import { Banner, Button, Field, Input, MonoMeta } from './kit';
import { FurniturePreview } from './FurniturePreview';

interface ModelDetailModalProps {
  model: GalleryModel;
  builtinPreviewUrl?: string | null;
  currentUserId?: string | null;
  placeLabel?: string;
  onClose: () => void;
  onPlace: (model: GalleryModel) => void;
  onModelPatched: (kind: string, patch: Partial<GalleryModel>) => void;
  onModelDeleted: (kind: string) => void;
  /** When true, open directly in edit mode (owner). */
  startInEdit?: boolean;
}

const REPORT_REASONS: { value: CatalogReportReason; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'spam', label: 'Spam' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'other', label: 'Other' },
];

function formatCount(n: number): string {
  return n.toLocaleString();
}

export function ModelDetailModal({
  model,
  builtinPreviewUrl,
  currentUserId,
  placeLabel = 'Add to room',
  onClose,
  onPlace,
  onModelPatched,
  onModelDeleted,
  startInEdit = false,
}: ModelDetailModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const isOwner =
    !!currentUserId && !!model.userId && currentUserId === model.userId && !model.isBuiltin;
  const canLike = model.visibility === 'public' && !isOwner;
  const canReport =
    !!currentUserId &&
    !isOwner &&
    !model.isBuiltin &&
    model.visibility === 'public';

  const [editing, setEditing] = useState(startInEdit && isOwner);
  const [label, setLabel] = useState(model.label);
  const [description, setDescription] = useState(model.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<CatalogReportReason>('inappropriate');
  const [reportBusy, setReportBusy] = useState(false);
  const [reported, setReported] = useState(() => hasReportedCatalogKind(model.kind));
  const [downloadBusy, setDownloadBusy] = useState(false);
  const canDownload = !model.isBuiltin && (!!model.signedUrl || !!model.storagePath);
  const downloadFilename = catalogModelDownloadFilename(
    model.label,
    model.storagePath,
    model.signedUrl ?? '',
  );
  const downloadExt = downloadFilename.split('.').pop()?.toUpperCase() ?? 'GLB';

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    setReported(hasReportedCatalogKind(model.kind));
    setReportOpen(false);
  }, [model.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (model.visibility !== 'public') return;
    void recordCatalogView(model.kind)
      .then((next) => {
        if (typeof next === 'number') {
          onModelPatched(model.kind, { viewsCount: next });
        }
      })
      .catch(() => {
        /* best-effort */
      });
  }, [model.kind, model.visibility, onModelPatched]);

  const previewUrl = model.isBuiltin
    ? builtinPreviewUrl ?? model.previewUrl
    : model.previewUrl;

  async function handleLike() {
    if (!canLike) return;
    if (!currentUserId) {
      setError('Sign in to like models.');
      return;
    }
    setError(null);
    setLikeBusy(true);
    const prevLiked = model.likedByMe;
    const prevCount = model.likesCount;
    onModelPatched(model.kind, {
      likedByMe: !prevLiked,
      likesCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
    });
    try {
      const res = await toggleCatalogLike(model.kind);
      onModelPatched(model.kind, {
        likedByMe: res.liked,
        likesCount: res.likes_count,
      });
    } catch (e) {
      onModelPatched(model.kind, {
        likedByMe: prevLiked,
        likesCount: prevCount,
      });
      setError(e instanceof Error ? e.message : 'Could not update like');
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleReport() {
    if (!canReport || reported) return;
    setError(null);
    setReportBusy(true);
    try {
      await reportCatalogModel(model.kind, reportReason);
      setReported(true);
      setReportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send report');
    } finally {
      setReportBusy(false);
    }
  }

  async function handleSaveEdit() {
    setError(null);
    setBusy(true);
    try {
      await updateCatalogModel({
        kind: model.kind,
        label: label.trim(),
        description: description.trim() || null,
      });
      onModelPatched(model.kind, {
        label: label.trim(),
        description: description.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function handleVisibility(next: CatalogVisibility) {
    setError(null);
    setBusy(true);
    try {
      await setCatalogVisibility(model.kind, next);
      onModelPatched(model.kind, { visibility: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update visibility');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!canDownload || downloadBusy) return;
    setError(null);
    setDownloadBusy(true);
    try {
      const url =
        model.signedUrl ??
        (model.storagePath
          ? await resolveBrowsableModelUrl(model.storagePath, {
              access: model.visibility === 'public' ? 'public' : 'private',
            })
          : null);
      if (!url) {
        throw new Error('Could not download model');
      }
      await downloadModelFile(url, downloadFilename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download model');
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      const paths = await deleteCatalogModel(model.kind);
      const toRemove = [paths.model_url, paths.thumbnail_path].filter(
        (p): p is string => !!p && !p.startsWith('http'),
      );
      if (toRemove.length > 0) {
        await supabase.storage.from(MODEL_FILES_BUCKET).remove(toRemove);
        await removePublicModelMirrors(toRemove);
      }
      onModelDeleted(model.kind);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="model-detail-backdrop" role="presentation" onClick={onClose}>
      <div
        className="model-detail-modal tv-scroll"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="model-detail-head">
          <h2 id={titleId} className="model-detail-title">
            {model.label}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="model-detail-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="model-detail-preview">
          <FurniturePreview
            kind={model.isBuiltin ? model.kind : 'imported'}
            size={[model.width_in, model.height_in, model.depth_in]}
            previewUrl={previewUrl}
            className="model-detail-preview-inner"
          />
        </div>

        <div className="model-detail-meta">
          {model.isBuiltin ? (
            <span className="model-detail-creator model-detail-creator--toova">
              Toova
            </span>
          ) : model.creatorHandle ? (
            <button
              type="button"
              className="model-detail-creator"
              onClick={() => navigate(profilePath(model.creatorHandle!))}
            >
              @{model.creatorHandle}
              {model.creatorDisplayName ? ` · ${model.creatorDisplayName}` : ''}
            </button>
          ) : (
            <span className="model-detail-creator">Community</span>
          )}

          <div className="model-detail-stats">
            <span>👁 {formatCount(model.viewsCount)} views</span>
            {canLike ? (
              <button
                type="button"
                className={`model-detail-stat-like${model.likedByMe ? ' is-liked' : ''}`}
                disabled={likeBusy}
                onClick={() => void handleLike()}
                aria-pressed={model.likedByMe}
                title={currentUserId ? (model.likedByMe ? 'Unlike' : 'Like') : 'Sign in to like'}
              >
                {model.likedByMe ? '♥' : '♡'} {formatCount(model.likesCount)} likes
              </button>
            ) : (
              <span>♥ {formatCount(model.likesCount)} likes</span>
            )}
            <span>↓ {formatCount(model.downloadsCount)} downloads</span>
          </div>

          {model.categories.length > 0 ? (
            <div className="model-detail-cats">
              {model.categories.map((c) => (
                <span key={c} className="model-card-cat">
                  {catalogCategoryLabel(c)}
                </span>
              ))}
            </div>
          ) : null}

          <p className="model-detail-dims">
            {model.width_in}" × {model.height_in}" × {model.depth_in}"
          </p>

          {!editing && model.description ? (
            <p className="model-detail-desc">{model.description}</p>
          ) : null}
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}

        {editing && isOwner ? (
          <div className="model-detail-edit">
            <div className="model-detail-vis-row" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`model-detail-btn${model.visibility === 'public' ? ' is-active' : ''}`}
                disabled={busy || model.visibility === 'public'}
                onClick={() => void handleVisibility('public')}
              >
                Make public
              </button>
              <button
                type="button"
                className={`model-detail-btn${model.visibility === 'private' ? ' is-active' : ''}`}
                disabled={busy || model.visibility === 'private'}
                onClick={() => void handleVisibility('private')}
              >
                Make private
              </button>
            </div>

            <Field label="Name">
              <Input
                value={label}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field label="Description">
              <textarea
                className="kit-input"
                value={description}
                maxLength={500}
                rows={3}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </Field>
            <div className="model-detail-cats-readonly">
              <MonoMeta size="sm" tone="dense" upper style={{ display: 'block', marginBottom: 8 }}>
                Categories (locked)
              </MonoMeta>
              <div className="model-detail-cats">
                {model.categories.map((c) => (
                  <span key={c} className="model-card-cat">
                    {catalogCategoryLabel(c)}
                  </span>
                ))}
                {model.categories.length === 0 ? (
                  <span className="model-detail-muted">None</span>
                ) : null}
              </div>
            </div>
            {!confirmDelete ? (
              <button
                type="button"
                className="model-detail-delete"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Delete model
              </button>
            ) : (
              <div className="model-detail-delete-confirm">
                <button
                  type="button"
                  className="model-detail-delete"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="model-detail-btn"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
              </div>
            )}
          </div>
        ) : null}

        {canReport && !editing ? (
          <div className="model-detail-report">
            {reported ? (
              <span className="model-detail-report-done">Reported</span>
            ) : !reportOpen ? (
              <button
                type="button"
                className="model-detail-report-link"
                onClick={() => setReportOpen(true)}
              >
                Report
              </button>
            ) : (
              <div className="model-detail-report-form">
                <div className="model-detail-report-reasons" role="group" aria-label="Report reason">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className={`model-detail-report-chip${reportReason === r.value ? ' is-active' : ''}`}
                      disabled={reportBusy}
                      onClick={() => setReportReason(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="model-detail-report-actions">
                  <button
                    type="button"
                    className="model-detail-report-send"
                    disabled={reportBusy}
                    onClick={() => void handleReport()}
                  >
                    {reportBusy ? 'Sending…' : 'Send'}
                  </button>
                  <button
                    type="button"
                    className="model-detail-report-link"
                    disabled={reportBusy}
                    onClick={() => setReportOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <footer className="model-detail-actions">
          {canLike ? (
            <button
              type="button"
              className={`model-detail-like${model.likedByMe ? ' is-liked' : ''}`}
              disabled={likeBusy}
              onClick={() => void handleLike()}
              aria-pressed={model.likedByMe}
            >
              {model.likedByMe ? '♥ Liked' : '♡ Like'}
            </button>
          ) : null}
          {isOwner && !editing ? (
            <button
              type="button"
              className="model-detail-btn"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : null}
          {editing && isOwner ? (
            <Button
              size="sm"
              disabled={busy || !label.trim()}
              onClick={() => void handleSaveEdit()}
            >
              Save
            </Button>
          ) : null}
          {canDownload ? (
            <button
              type="button"
              className="model-detail-btn"
              disabled={downloadBusy}
              onClick={() => void handleDownload()}
            >
              {downloadBusy ? 'Downloading…' : `Download ${downloadExt}`}
            </button>
          ) : null}
          <Button size="sm" onClick={() => onPlace(model)}>
            {placeLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
