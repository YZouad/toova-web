import { useSyncExternalStore } from 'react';
import {
  getGenerationQueueSnapshot,
  subscribeGenerationQueue,
} from '../lib/generationQueue';

function statusLabel(status: string): string {
  if (status === 'processing' || status === 'queued') return 'In progress';
  if (status === 'completed') return 'Done';
  return 'Failed';
}

export function GenerationQueueHost() {
  const entries = useSyncExternalStore(subscribeGenerationQueue, getGenerationQueueSnapshot);
  if (entries.length === 0) return null;

  return (
    <aside className="generation-queue" aria-label="Generation queue">
      <h2 className="generation-queue__title">Generations</h2>
      <ul className="generation-queue__list">
        {entries.slice(0, 8).map((entry) => (
          <li key={entry.id} className={`generation-queue__item is-${entry.status}`}>
            <span className="generation-queue__label">{entry.label}</span>
            <span className="generation-queue__status">{statusLabel(entry.status)}</span>
            {entry.message ? <span className="generation-queue__msg">{entry.message}</span> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
