import { useState } from 'react';
import {
  instagramBrowseUrlForCategory,
  inspoPlatformLabel,
  parseInspoClipUrl,
  tiktokBrowseUrlForCategory,
  type ChecklistInspoClip,
} from '../../lib/inspoClipUrls';
import { submitInspoClip } from '../../lib/shoppingCatalogAdmin';
import { Banner, Button, Field, Input, MonoMeta } from '../kit';
import { Modal } from '../kit/Modal';
import { ReportDialog } from '../ReportDialog';

export interface InspoClipRailProps {
  categoryId: string;
  categoryName: string;
  clips: ChecklistInspoClip[];
  userId: string | null;
  isAdmin?: boolean;
  onRequestSignIn?: () => void;
  onUseThisLook: (clip: ChecklistInspoClip) => void;
  onClipSubmitted?: () => void;
}

export function InspoClipRail({
  categoryId,
  categoryName,
  clips,
  userId,
  isAdmin = false,
  onRequestSignIn,
  onUseThisLook,
  onClipSubmitted,
}: InspoClipRailProps) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [rawUrl, setRawUrl] = useState('');
  const [title, setTitle] = useState('');
  const [creatorHandle, setCreatorHandle] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ChecklistInspoClip | null>(null);

  const visibleClips = clips.filter(
    (c) => c.status === 'published' || (userId != null && c.submittedBy === userId),
  );

  function openAddModal() {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    setRawUrl('');
    setTitle('');
    setCreatorHandle('');
    setThumbnailUrl('');
    setError(null);
    setSubmitOpen(true);
  }

  async function handleSubmit() {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    const parsed = parseInspoClipUrl(rawUrl);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitInspoClip({
        categoryId,
        rawUrl,
        title: title.trim() || `${categoryName} review`,
        creatorHandle: creatorHandle.trim() || parsed.inferredCreatorHandle,
        thumbnailUrl: thumbnailUrl.trim() || null,
        userId,
        publishImmediately: isAdmin,
      });
      setSubmitOpen(false);
      onClipSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save link');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="checklist-inspo-rail">
      <div className="checklist-inspo-rail__head">
        <MonoMeta size="xs" tone="dense" upper>
          Room inspo · Reels &amp; TikTok
        </MonoMeta>
        {visibleClips.length > 0 ? (
          <button
            type="button"
            className="shopping-lists-header-link"
            onClick={openAddModal}
          >
            Save a link
          </button>
        ) : null}
      </div>

      {visibleClips.length === 0 ? (
        <div className="checklist-inspo-rail__empty">
          <p>
            Toova can&apos;t run TikTok or Instagram inside the app — but when our team (or you)
            add approved clips, they show up here as a scrollable row of picks. Until this category
            has picks, browse on TikTok or Reels, then come back and save anything you love.
          </p>
          <div className="checklist-inspo-rail__browse">
            <a
              className="checklist-product-rail__shop"
              href={tiktokBrowseUrlForCategory(categoryName)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse on TikTok ↗
            </a>
            <a
              className="checklist-product-rail__shop"
              href={instagramBrowseUrlForCategory(categoryName)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse on Instagram ↗
            </a>
            <button
              type="button"
              className="shopping-lists-header-link"
              onClick={openAddModal}
            >
              Save a link you found
            </button>
          </div>
        </div>
      ) : (
        <div
          className="checklist-product-rail__track"
          tabIndex={0}
          aria-label={`${categoryName} social video reviews`}
        >
          {visibleClips.map((clip) => {
            const badge = inspoPlatformLabel(clip.platform);
            const displayTitle = clip.title.trim() || `${categoryName} review`;
            return (
              <article
                key={clip.id}
                className="checklist-product-rail__card checklist-inspo-card"
              >
                <div className="checklist-inspo-card__media">
                  {clip.thumbnailUrl ? (
                    <img src={clip.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="checklist-inspo-card__glyph" aria-hidden>
                      ▶
                    </span>
                  )}
                  <span className="checklist-inspo-card__pill">{badge}</span>
                  {clip.status === 'pending' ? (
                    <span className="checklist-inspo-card__status">Yours · pending</span>
                  ) : null}
                </div>
                <div className="checklist-product-rail__body">
                  <span className="checklist-product-rail__name">{displayTitle}</span>
                  {clip.creatorHandle ? (
                    <MonoMeta size="xs" tone="subtle">
                      {clip.creatorHandle}
                    </MonoMeta>
                  ) : null}
                  <div className="checklist-product-rail__actions">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUseThisLook(clip)}
                    >
                      Use this look → 3D
                    </Button>
                    <div className="checklist-inspo-card__links">
                      <a
                        className="checklist-product-rail__shop"
                        href={clip.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Watch ↗
                      </a>
                      <button
                        type="button"
                        className="checklist-inspo-card__report"
                        onClick={() => setReportTarget(clip)}
                      >
                        Report
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={submitOpen}
        onClose={() => !submitting && setSubmitOpen(false)}
        title={`Add a ${categoryName} Reel or TikTok`}
        meta="Room inspo"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => setSubmitOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? 'Saving…' : 'Save clip'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Field label="Instagram Reel or TikTok URL">
            <Input
              type="url"
              value={rawUrl}
              onChange={(e) => setRawUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@creator/video/… or https://www.instagram.com/reel/…"
              disabled={submitting}
              autoFocus
            />
          </Field>
          <Field label="Short title / what you liked">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. Plush ${categoryName.toLowerCase()} for Twin XL`}
              disabled={submitting}
            />
          </Field>
          <Field label="Creator handle (optional)">
            <Input
              value={creatorHandle}
              onChange={(e) => setCreatorHandle(e.target.value)}
              placeholder="@creator"
              disabled={submitting}
            />
          </Field>
          <Field label="Thumbnail image URL (optional)">
            <Input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://…"
              disabled={submitting}
            />
          </Field>
          <MonoMeta size="xs" tone="subtle">
            Links open on Instagram or TikTok. Your clip appears right away for you and goes public
            once approved.
          </MonoMeta>
        </div>
      </Modal>

      {reportTarget ? (
        <ReportDialog
          open
          onClose={() => setReportTarget(null)}
          targetType="other"
          targetId={`inspo_clip:${reportTarget.id}`}
          targetLabel={reportTarget.title || reportTarget.canonicalUrl}
          allowAnonymousEmail={!userId}
        />
      ) : null}
    </div>
  );
}
