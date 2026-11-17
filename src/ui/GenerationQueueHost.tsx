import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import {
  clearPendingGenerationReview,
  dismissGenerationQueueItem,
  getGenerationQueueSnapshot,
  getPendingGenerationReview,
  placeGenerationQueueItem,
  recoverGenerationQueue,
  subscribeGenerationQueue,
  subscribePendingGenerationReview,
  type GenerationQueueItem,
} from '../lib/generationQueue';
import { canPlaceGenerationInRoom } from '../lib/generationQueuePlacement';
import { ImportModelModal } from './ImportModelModal';
import { GenerationQueueDrawer } from './GenerationQueueDrawer';

export function GenerationQueueHost() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(
    subscribeGenerationQueue,
    getGenerationQueueSnapshot,
    getGenerationQueueSnapshot,
  );
  const pendingReview = useSyncExternalStore(
    subscribePendingGenerationReview,
    getPendingGenerationReview,
    getPendingGenerationReview,
  );
  const [reviewItem, setReviewItem] = useState<GenerationQueueItem | null>(null);

  useEffect(() => {
    if (!user) return;
    void recoverGenerationQueue(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!pendingReview || !user) return;
    const snap = getGenerationQueueSnapshot();
    setReviewItem(
      snap.items.find((i) => i.jobId === pendingReview.jobId && i.glbFile) ?? {
        jobId: pendingReview.jobId,
        userId: user.id,
        label: pendingReview.file.name,
        status: 'ready',
        error: null,
        sourceFile: null,
        glbFile: pendingReview.file,
      },
    );
    clearPendingGenerationReview();
  }, [pendingReview, user]);

  if (!user) return null;

  const onSaveReady = (item: GenerationQueueItem) => {
    if (!item.glbFile) return;
    setReviewItem(item);
  };

  const reviewFile = reviewItem?.glbFile ?? null;

  return (
    <>
      {typeof document !== 'undefined' ? (
        createPortal(
          <GenerationQueueDrawer snapshot={snapshot} onSaveReady={onSaveReady} />,
          document.body,
        )
      ) : null}
      {reviewItem && reviewFile ? (
        <ImportModelModal
          userId={user.id}
          open
          initialTab="upload"
          initialGlbFile={reviewFile}
          priorJobId={reviewItem.jobId}
          originRoomId={reviewItem.originRoomId ?? null}
          canPlaceInRoom={canPlaceGenerationInRoom(reviewItem)}
          onPlaceInRoom={async () => {
            const id = await placeGenerationQueueItem(reviewItem);
            if (id) setReviewItem(null);
          }}
          onClose={() => setReviewItem(null)}
          onAdded={() => {
            void dismissGenerationQueueItem(reviewItem.jobId);
            setReviewItem(null);
          }}
        />
      ) : null}
    </>
  );
}