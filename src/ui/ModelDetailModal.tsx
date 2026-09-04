import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import {
  hasReportedCatalogKind,
  recordCatalogView,
  setCatalogVisibility,
  toggleCatalogLike,
  type CatalogVisibility,
} from '../lib/catalogEngagement';
import { hasReportedTarget } from '../lib/contentReports';
import { ReportDialog } from './ReportDialog';
import { catalogCategoryLabel } from '../lib/catalogCategories';
import { deleteCatalogModel, updateCatalogModel } from '../lib/galleryCatalog';
import {
  MODEL_FILES_BUCKET,
  catalogModelDownloadFilename,
  downloadModelFile,
  resolveBrowsableModelUrl,
} from '../lib/modelStorage';
import { removePublicModelMirrors } from '../lib/publicModelsMirror';
import { supabase } from '../lib/supabase';
import { formatRelativeTime } from '../lib/userDisplay';
import { profilePath, navigate } from '../hooks/useRoute';
import {
  getBuiltinPreviewUrl,
  requestBuiltinPreview,
  useBuiltinPreviews,
} from '../hooks/useBuiltinPreviews';
import './model-detail.css';

export interface ModelDetailModalProps {
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

const COMPACT_MQ = '(max-width: 1023px)';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatDims(w: number, h: number, d: number): string {
  return `${Math.round(w)}″ × ${Math.round(h)}″ × ${Math.round(d)}″`;
}

function HeartIcon({ filled, size = 15 }: { filled: boolean; size?: number }) {
  return (
    <svg
      className={`md-heart${filled ? ' is-filled' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z" />
    </svg>
  );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="md-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 18v2h16v-2" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="md-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ModelDetailModal({
  model,
  builtinPreviewUrl,
  currentUserId,
  placeLabel = 'Add to my room',
  onClose,
  onPlace,
  onModelPatched,
  onModelDeleted,
  startInEdit = false,
}: ModelDetailModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const isOwner =
    !!currentUserId && !!model.userId && currentUserId === model.userId && !model.isBuiltin;
  const canLike = model.visibility === 'public' && !isOwner && !model.isBuiltin;
  const canReport = !isOwner && !model.isBuiltin && model.visibility === 'public';

  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_MQ).matches,
  );
  const [editing, setEditing] = useState(startInEdit && isOwner);
  const [label, setLabel] = useState(model.label);
  const [description, setDescription] = useState(model.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(
    () => hasReportedCatalogKind(model.kind) || hasReportedTarget('catalog_model', model.kind),
  );
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const canDownload =
    !!currentUserId &&
    !model.isBuiltin &&
    (!!model.signedUrl || !!model.storagePath);
  const downloadFilename = catalogModelDownloadFilename(
    model.label,
    model.storagePath,
    model.signedUrl ?? '',
  );
  const downloadExt = downloadFilename.split('.').pop()?.toUpperCase() ?? 'GLB';

  const generatedPreviews = useBuiltinPreviews();
  const previewUrl =
    model.previewUrl ??
    builtinPreviewUrl ??
    (model.isBuiltin ? getBuiltinPreviewUrl(model.kind, generatedPreviews) : null) ??
    null;
  const showPreviewImg = !!previewUrl && !imgBroken;
  const dims = formatDims(model.width_in, model.height_in, model.depth_in);
  const sourceChip = isOwner
    ? 'Your model'
    : model.isBuiltin
      ? 'Toova library'
      : 'Community model';
  const creatorName = model.isBuiltin
    ? 'Toova'
    : model.creatorHandle
      ? `@${model.creatorHandle}${model.creatorDisplayName ? ` · ${model.creatorDisplayName}` : ''}`
      : model.creatorDisplayName ?? 'Community';
  const agoLabel = model.isBuiltin
    ? 'in the core library'
    : model.createdAt
      ? `shared ${formatRelativeTime(model.createdAt)}`
      : null;

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (model.isBuiltin) requestBuiltinPreview(model.kind);
  }, [model.isBuiltin, model.kind]);

  useEffect(() => {
    setImgBroken(false);
  }, [previewUrl]);

  useEffect(() => {
    setReported(
      hasReportedCatalogKind(model.kind) || hasReportedTarget('catalog_model', model.kind),
    );
    setReportOpen(false);
    setImgBroken(false);
    setLabel(model.label);
    setDescription(model.description ?? '');
    setConfirmDelete(false);
    if (!(startInEdit && isOwner)) setEditing(false);
  }, [model.kind, model.label, model.description, startInEdit, isOwner]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
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
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function handleDoneEditing() {
    const dirty =
      label.trim() !== model.label ||
      (description.trim() || null) !== (model.description ?? null);
    if (dirty) {
      await handleSaveEdit();
      return;
    }
    setEditing(false);
    setConfirmDelete(false);
  }

  async function handleVisibility(next: CatalogVisibility) {
    if (model.visibility === next) return;
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

  const reading = !(editing && isOwner);

  const statsStrip = (
    <div className="md-stats" role="group" aria-label="Engagement">
      <div className="md-stat">
        <span className="md-stat-label">Views</span>
        <span className="md-stat-value">{formatCount(model.viewsCount)}</span>
      </div>
      {canLike ? (
        <button
          type="button"
          className={`md-stat md-stat--btn${model.likedByMe ? ' md-stat--liked' : ''}`}
          disabled={likeBusy}
          onClick={() => void handleLike()}
          aria-pressed={model.likedByMe}
          aria-label={model.likedByMe ? 'Unlike' : 'Like'}
        >
          <span className="md-stat-label">Likes</span>
          <span className="md-stat-value">
            <HeartIcon filled={model.likedByMe} />
            {formatCount(model.likesCount)}
          </span>
        </button>
      ) : (
        <div className="md-stat">
          <span className="md-stat-label">Likes</span>
          <span className="md-stat-value">
            <HeartIcon filled={false} />
            {formatCount(model.likesCount)}
          </span>
        </div>
      )}
      <div className="md-stat">
        <span className="md-stat-label">Downloads</span>
        <span className="md-stat-value">{formatCount(model.downloadsCount)}</span>
      </div>
    </div>
  );

  const reportBlock =
    canReport && reading ? (
      <div className="md-report">
        {reported ? (
          <span className="md-report-done">Reported — thanks, we&apos;ll take a look</span>
        ) : !reportOpen ? (
          <button
            type="button"
            className="md-report-link"
            onClick={() => setReportOpen(true)}
          >
            Report this model
          </button>
        ) : (
          <ReportDialog
            open
            inline
            onClose={() => setReportOpen(false)}
            targetType="catalog_model"
            targetId={model.kind}
            targetLabel={model.label}
            onSubmitted={() => {
              setReported(true);
              setReportOpen(false);
            }}
          />
        )}
      </div>
    ) : null;

  const editBlock =
    editing && isOwner ? (
      <div className="md-edit">
        <div className="md-vis" role="group" aria-label="Visibility">
          <div className="md-vis-copy">
            <span className="md-vis-title">
              {model.visibility === 'public'
                ? 'Anyone can find and place this'
                : 'Only you can see this'}
            </span>
            <span className="md-vis-note">
              {model.visibility === 'public'
                ? 'It shows in the community gallery and counts likes, views and downloads.'
                : 'It stays in Your models. Existing rooms that use it keep working.'}
            </span>
          </div>
          <div className="md-vis-toggle">
            <button
              type="button"
              className={`md-vis-btn${model.visibility === 'public' ? ' is-active' : ''}`}
              disabled={busy || model.visibility === 'public'}
              onClick={() => void handleVisibility('public')}
            >
              Public
            </button>
            <button
              type="button"
              className={`md-vis-btn${model.visibility === 'private' ? ' is-active' : ''}`}
              disabled={busy || model.visibility === 'private'}
              onClick={() => void handleVisibility('private')}
            >
              Private
            </button>
          </div>
        </div>

        <div className="md-field">
          <div className="md-field-head">
            <span className="md-field-label">Name</span>
            <span className="md-field-count">{label.length} / 80</span>
          </div>
          <input
            className="md-input"
            value={label}
            maxLength={80}
            disabled={busy}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Model name"
          />
        </div>

        <div className="md-field">
          <div className="md-field-head">
            <span className="md-field-label">Description</span>
            <span className="md-field-count">{description.length} / 500</span>
          </div>
          <textarea
            className="md-textarea"
            value={description}
            maxLength={500}
            rows={3}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Model description"
          />
        </div>

        <div className="md-field">
          <span className="md-cats-locked-label">Categories · locked after upload</span>
          <div className="md-cats">
            {model.categories.map((c) => (
              <span key={c} className="md-cat md-cat--locked">
                {catalogCategoryLabel(c)}
              </span>
            ))}
            {model.categories.length === 0 ? (
              <span className="md-cat md-cat--locked">None</span>
            ) : null}
          </div>
        </div>

        <div className="md-delete">
          <div className="md-delete-copy">
            <span className="md-delete-title">
              {confirmDelete ? 'Delete it for good?' : 'Delete this model'}
            </span>
            <span className="md-delete-note">
              {confirmDelete
                ? 'The file and its thumbnail go too. Rooms already using it lose the piece.'
                : 'Removes the file, the thumbnail and its stats. Not reversible.'}
            </span>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              className="md-delete-ask"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete model
            </button>
          ) : (
            <div className="md-delete-actions">
              <button
                type="button"
                className="md-delete-keep"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="md-delete-confirm"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                Delete for good
              </button>
            </div>
          )}
        </div>

        {compact ? (
          <button
            type="button"
            className="md-btn md-btn--save"
            style={{ width: '100%' }}
            disabled={busy || !label.trim()}
            onClick={() => void handleDoneEditing()}
          >
            {busy ? 'Saving…' : 'Done editing'}
          </button>
        ) : null}
      </div>
    ) : null;

  const readingBlock = reading ? (
    <>
      {model.categories.length > 0 ? (
        <div className="md-cats">
          {model.categories.map((c) => (
            <span key={c} className="md-cat">
              {catalogCategoryLabel(c)}
            </span>
          ))}
        </div>
      ) : null}

      {model.description ? <p className="md-desc">{model.description}</p> : null}

      <div className="md-specifics">
        <span className="md-specifics-title">Specifics</span>
        <div className="md-specifics-grid">
          <div className="md-spec-row">
            <span>Size</span>
            <span>{dims}</span>
          </div>
          {model.clearance_in != null ? (
            <div className="md-spec-row">
              <span>Clearance</span>
              <span>{Math.round(model.clearance_in)}″ front</span>
            </div>
          ) : null}
          <div className="md-spec-row">
            <span>File</span>
            <span>{downloadExt}</span>
          </div>
        </div>
      </div>

      {reportBlock}
    </>
  ) : (
    editBlock
  );

  const mobileOwner =
    isOwner && compact && !editing ? (
      <div className="md-mobile-owner">
        <div className="md-vis">
          <div className="md-vis-copy">
            <span className="md-vis-title">
              {model.visibility === 'public'
                ? 'Anyone can find and place this'
                : 'Only you can see this'}
            </span>
          </div>
          <div className="md-vis-toggle">
            <button
              type="button"
              className={`md-vis-btn${model.visibility === 'public' ? ' is-active' : ''}`}
              disabled={busy || model.visibility === 'public'}
              onClick={() => void handleVisibility('public')}
            >
              Public
            </button>
            <button
              type="button"
              className={`md-vis-btn${model.visibility === 'private' ? ' is-active' : ''}`}
              disabled={busy || model.visibility === 'private'}
              onClick={() => void handleVisibility('private')}
            >
              Private
            </button>
          </div>
        </div>
        <div className="md-mobile-owner-actions">
          <button
            type="button"
            className="md-btn md-btn--edit"
            onClick={() => {
              setEditing(true);
              setConfirmDelete(false);
            }}
          >
            Edit details
          </button>
          <button
            type="button"
            className="md-btn md-btn--danger"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        </div>
        {confirmDelete ? (
          <div className="md-delete">
            <div className="md-delete-copy">
              <span className="md-delete-note">
                The file and its thumbnail go too. Rooms already using it lose the piece.
              </span>
            </div>
            <div className="md-delete-actions">
              <button
                type="button"
                className="md-delete-keep"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className="md-delete-confirm"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  const modal = (
    <div
      className={`md-backdrop${compact ? ' is-compact' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`md-card${compact ? ' is-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="md-handle" aria-hidden>
          <span className="md-handle-bar" />
        </div>

        <div className="md-preview" aria-hidden={!showPreviewImg}>
          <div className="md-preview-chips">
            <span className="md-chip">{sourceChip}</span>
            {isOwner && model.visibility === 'private' ? (
              <span className="md-chip md-chip--private">private</span>
            ) : null}
          </div>

          <div className="md-preview-stage">
            {showPreviewImg ? (
              <img
                className="md-preview-img"
                src={previewUrl}
                alt=""
                draggable={false}
                onError={() => setImgBroken(true)}
              />
            ) : (
              <div className="md-preview-fallback">
                <span className="md-preview-fallback-block" />
                <span className="md-preview-fallback-label">No preview</span>
              </div>
            )}
          </div>

          <div className="md-preview-foot">
            <span className="md-preview-dims">{dims}</span>
          </div>
        </div>

        <div className="md-body">
          <header className="md-head">
            <div className="md-head-main">
              <h2 id={titleId} className="md-title">
                {model.label}
              </h2>
              <div className="md-creator-row">
                <span
                  className={`md-avatar${model.isBuiltin ? ' md-avatar--toova' : ''}`}
                  aria-hidden
                >
                  {model.isBuiltin
                    ? 'T'
                    : (model.creatorDisplayName || model.creatorHandle || '?')
                        .replace(/^@/, '')
                        .slice(0, 1)
                        .toUpperCase()}
                </span>
                {model.isBuiltin ? (
                  <span className="md-creator md-creator--static">{creatorName}</span>
                ) : model.creatorHandle ? (
                  <button
                    type="button"
                    className="md-creator"
                    onClick={() => navigate(profilePath(model.creatorHandle!))}
                  >
                    {creatorName}
                  </button>
                ) : (
                  <span className="md-creator md-creator--static">{creatorName}</span>
                )}
                {agoLabel ? <span className="md-ago">{agoLabel}</span> : null}
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="md-close"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </header>

          {statsStrip}

          <div className="md-scroll">
            {error ? <p className="md-error" role="alert">{error}</p> : null}
            {readingBlock}
            {mobileOwner}
          </div>

          <footer className="md-footer">
            {canLike ? (
              <button
                type="button"
                className={`md-btn md-btn--like${compact ? ' md-btn--icon' : ''}${model.likedByMe ? ' is-liked' : ''}`}
                disabled={likeBusy}
                onClick={() => void handleLike()}
                aria-pressed={model.likedByMe}
                aria-label={model.likedByMe ? 'Unlike' : 'Like'}
              >
                <HeartIcon filled={model.likedByMe} size={compact ? 20 : 16} />
                {!compact ? <span>{model.likedByMe ? 'Liked' : 'Like'}</span> : null}
              </button>
            ) : null}

            {isOwner && !compact ? (
              editing ? (
                <>
                  <button
                    type="button"
                    className="md-btn md-btn--save"
                    disabled={busy || !label.trim()}
                    onClick={() => void handleDoneEditing()}
                  >
                    {busy ? 'Saving…' : 'Done editing'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="md-btn md-btn--edit"
                  onClick={() => {
                    setEditing(true);
                    setConfirmDelete(false);
                  }}
                >
                  Edit details
                </button>
              )
            ) : null}

            {canDownload ? (
              <button
                type="button"
                className={`md-btn${compact ? ' md-btn--icon' : ''}`}
                disabled={downloadBusy}
                onClick={() => void handleDownload()}
                aria-label={downloadBusy ? 'Downloading' : `Download ${downloadExt}`}
              >
                <DownloadIcon size={compact ? 20 : 16} />
                {!compact ? (
                  <span>{downloadBusy ? 'Downloading…' : `Download ${downloadExt}`}</span>
                ) : null}
              </button>
            ) : null}

            {!compact ? <span className="md-spacer" /> : null}

            <button
              type="button"
              className="md-btn md-btn--primary"
              onClick={() => onPlace(model)}
            >
              <PlusIcon size={compact ? 18 : 16} />
              <span>{placeLabel}</span>
            </button>
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
