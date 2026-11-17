import { useEffect, useRef, useState } from 'react';
import {
  cancelQueuedGeneration,
  dismissGenerationQueueItem,
  placeGenerationQueueItem,
  processGenerationQueue,
  type GenerationQueueItem,
  type GenerationQueueSnapshot,
} from '../lib/generationQueue';
import { canPlaceGenerationInRoom } from '../lib/generationQueuePlacement';
import { Button } from './kit/Button';
import { Spinner } from './kit/Spinner';
import { GenerationQueueThumb } from './GenerationQueueThumb';

function truncateLabel(label: string, max = 32): string {
  const base = label.split(/[/\\]/).pop() ?? label;
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1)}…`;
}

function statusLabel(item: GenerationQueueItem): string {
  if (item.status === 'queued') return 'Queued';
  if (item.status === 'processing') return 'Generating';
  if (item.status === 'ready') return 'Ready';
  return 'Failed';
}

type RowProps = {
  item: GenerationQueueItem;
  onSave?: (item: GenerationQueueItem) => void;
};

function QueueRow({ item, onSave }: RowProps) {
  const title = truncateLabel(item.label);
  const detail =
    item.statusMessage ||
    (item.status === 'queued' ? 'Waiting to start…' : item.status === 'processing' ? 'Processing…' : title);

  return (
    <div className="generation-queue-card generation-queue-card--row">
      <GenerationQueueThumb item={item} />
      <div className="generation-queue-card__copy">
        <span className="generation-queue-card__label">{statusLabel(item)}</span>
        <span className="generation-queue-card__title" title={item.label}>
          {title}
        </span>
        <span className="generation-queue-card__meta">{detail}</span>
      </div>
      {item.status === 'processing' ? <Spinner size={16} inline /> : null}
      {item.status === 'queued' ? (
        <Button size="sm" variant="outline" onClick={() => void cancelQueuedGeneration(item.jobId)}>
          Cancel
        </Button>
      ) : null}
      {item.status === 'ready' && item.glbFile ? (
        <>
          {canPlaceGenerationInRoom(item) ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void placeGenerationQueueItem(item)}
            >
              Place in room
            </Button>
          ) : null}
          <Button size="sm" onClick={() => onSave?.(item)}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => void dismissGenerationQueueItem(item.jobId)}>
            Dismiss
          </Button>
        </>
      ) : null}
      {item.status === 'failed' ? (
        <Button size="sm" variant="outline" onClick={() => void dismissGenerationQueueItem(item.jobId)}>
          Dismiss
        </Button>
      ) : null}
    </div>
  );
}

type DrawerProps = {
  snapshot: GenerationQueueSnapshot;
  onSaveReady: (item: GenerationQueueItem) => void;
};

export function GenerationQueueDrawer({ snapshot, onSaveReady }: DrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const queued = snapshot.items.filter((item) => item.status === 'queued' || item.status === 'processing');
  const ready = snapshot.items.filter((item) => item.status === 'ready' && item.glbFile);
  const failed = snapshot.items.filter((item) => item.status === 'failed');
  const all = [...queued, ...ready, ...failed];
  const visible = all.length > 0;

  const showProcessQueue =
    !snapshot.draining && queued.some((item) => item.status === 'queued' && item.sourceFile && !item.serverOwned);

  const primary = queued.find((item) => item.status === 'processing') ?? queued[0] ?? ready[0] ?? failed[0];
  const activeCount = queued.length;
  const readyCount = ready.length;

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded]);

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  if (!visible) return null;

  const chipLine = primary
    ? `${activeCount > 0 ? `${activeCount} generating` : `${readyCount} ready`}${primary.statusMessage ? ` · ${truncateLabel(primary.statusMessage, 40)}` : ''}`
    : `${all.length} in queue`;

  return (
    <div
      ref={shellRef}
      className={`generation-queue-host${expanded ? ' generation-queue-host--expanded' : ''}`}
      role="status"
    >
      {!expanded ? (
        <button
          type="button"
          className="generation-queue-chip"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          {queued.some((i) => i.status === 'processing') ? (
            <Spinner size={14} inline />
          ) : null}
          <span className="generation-queue-chip__text">{chipLine}</span>
        </button>
      ) : (
        <div className="generation-queue-panel">
          <div className="generation-queue-panel__head">
            <span className="generation-queue-panel__title">Generation queue</span>
            <button
              type="button"
              className="generation-queue-panel__close"
              aria-expanded
              aria-label="Collapse queue"
              onClick={() => setExpanded(false)}
            >
              ×
            </button>
          </div>
          <div className="generation-queue-panel__scroll">
            {queued.map((item) => (
              <QueueRow key={item.jobId} item={item} onSave={onSaveReady} />
            ))}
            {showProcessQueue ? (
              <div className="generation-queue-card generation-queue-card--row">
                <div className="generation-queue-card__copy">
                  <span className="generation-queue-card__label">Queue</span>
                  <span className="generation-queue-card__title">Start waiting jobs</span>
                </div>
                <Button size="sm" onClick={() => processGenerationQueue()}>
                  Process
                </Button>
              </div>
            ) : null}
            {ready.map((item) => (
              <QueueRow key={item.jobId} item={item} onSave={onSaveReady} />
            ))}
            {failed.map((item) => (
              <QueueRow key={item.jobId} item={item} onSave={onSaveReady} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}