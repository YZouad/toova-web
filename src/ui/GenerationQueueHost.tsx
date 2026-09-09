import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import {
  dismissGenerationQueueItem,
  getGenerationQueueSnapshot,
  processGenerationQueue,
  recoverGenerationQueue,
  subscribeGenerationQueue,
} from '../lib/generationQueue';
import { ImportModelModal } from './ImportModelModal';
import { Button } from './kit/Button';

export function GenerationQueueHost() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(
    subscribeGenerationQueue,
    getGenerationQueueSnapshot,
    getGenerationQueueSnapshot,
  );
  const [review, setReview] = useState<{ jobId: string; file: File } | null>(null);

  useEffect(() => {
    if (!user) return;
    void recoverGenerationQueue(user.id);
  }, [user?.id]);

  if (!user) return null;

  const queued = snapshot.items.filter((item) => item.status === 'queued' || item.status === 'processing');
  const ready = snapshot.items.filter((item) => item.status === 'ready' && item.glbFile);
  const failed = snapshot.items.filter((item) => item.status === 'failed');
  const visible = queued.length > 0 || ready.length > 0 || failed.length > 0;

  const body = visible ? (
    <div className="generation-queue-host" role="status">
      {queued.length > 0 ? (
        <div className="generation-queue-card">
          <div className="generation-queue-card__copy">
            <span className="generation-queue-card__label">Generation queue</span>
            <span className="generation-queue-card__title">
              {snapshot.draining ? 'Processing queued 3D generation…' : `${queued.length} waiting to generate`}
            </span>
          </div>
          {!snapshot.draining ? (
            <Button size="sm" onClick={() => processGenerationQueue()}>
              Process queue
            </Button>
          ) : null}
        </div>
      ) : null}
      {ready.map((item) => (
        <div key={item.jobId} className="generation-queue-card">
          <div className="generation-queue-card__copy">
            <span className="generation-queue-card__label">Ready</span>
            <span className="generation-queue-card__title">{item.label} is ready to save</span>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!item.glbFile) return;
              setReview({ jobId: item.jobId, file: item.glbFile });
            }}
          >
            Save model
          </Button>
          <Button size="sm" variant="outline" onClick={() => void dismissGenerationQueueItem(item.jobId)}>
            Dismiss
          </Button>
        </div>
      ))}
      {failed.map((item) => (
        <div key={item.jobId} className="generation-queue-card">
          <div className="generation-queue-card__copy">
            <span className="generation-queue-card__label">Failed</span>
            <span className="generation-queue-card__title">{item.error ?? item.label}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void dismissGenerationQueueItem(item.jobId)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <>
      {typeof document !== 'undefined' && body ? createPortal(body, document.body) : null}
      {review ? (
        <ImportModelModal
          userId={user.id}
          open
          initialTab="upload"
          initialGlbFile={review.file}
          priorJobId={review.jobId}
          onClose={() => setReview(null)}
          onAdded={() => {
            void dismissGenerationQueueItem(review.jobId);
            setReview(null);
          }}
        />
      ) : null}
    </>
  );
}
