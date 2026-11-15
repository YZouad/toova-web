import { useState } from 'react';
import {
  instagramBrowseUrlForCategory,
  inspoPlatformLabel,
  tiktokBrowseUrlForCategory,
  type ChecklistInspoClip,
} from '../../lib/inspoClipUrls';
import { Button, MonoMeta } from '../kit';
import { ReportDialog } from '../ReportDialog';

export function visibleInspoClips(
  clips: ChecklistInspoClip[],
  userId: string | null,
): ChecklistInspoClip[] {
  return clips.filter(
    (c) => c.status === 'published' || (userId != null && c.submittedBy === userId),
  );
}

export function InspoClipCard({
  clip,
  categoryName,
  userId,
  onUseThisLook,
}: {
  clip: ChecklistInspoClip;
  categoryName: string;
  userId: string | null;
  onUseThisLook: (clip: ChecklistInspoClip) => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const badge = inspoPlatformLabel(clip.platform);
  const displayTitle = clip.title.trim() || `${categoryName} review`;

  return (
    <>
      <article className="checklist-product-rail__card checklist-inspo-card">
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
            <Button size="sm" variant="outline" onClick={() => onUseThisLook(clip)}>
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
                onClick={() => setReportOpen(true)}
              >
                Report
              </button>
            </div>
          </div>
        </div>
      </article>
      {reportOpen ? (
        <ReportDialog
          open
          onClose={() => setReportOpen(false)}
          targetType="other"
          targetId={`inspo_clip:${clip.id}`}
          targetLabel={clip.title || clip.canonicalUrl}
          allowAnonymousEmail={!userId}
        />
      ) : null}
    </>
  );
}

export function InspoClipBrowseCard({ categoryName }: { categoryName: string }) {
  return (
    <article className="checklist-product-rail__card checklist-inspo-card checklist-inspo-card--browse">
      <div className="checklist-product-rail__body checklist-inspo-card__browse-body">
        <MonoMeta size="xs" tone="dense" upper>
          Find inspo
        </MonoMeta>
        <div className="checklist-inspo-card__links" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
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
        </div>
      </div>
    </article>
  );
}