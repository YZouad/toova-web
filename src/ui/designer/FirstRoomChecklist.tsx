import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  allFirstRoomStepsDone,
  deriveFirstRoomCompletions,
  dismissFirstRoomChecklist,
  FIRST_ROOM_STEPS,
  loadFirstRoomProgress,
  markFirstRoomStep,
  type FirstRoomProgress,
  type FirstRoomStepId,
} from '../../lib/firstRoomChecklist';
import { useStore } from '../../store';
import { Button } from '../kit/Button';

const SHARED_KEY = (roomId: string) => `toova-room-shared:${roomId}`;

export function noteRoomSharedOrPublished(roomId: string): void {
  try {
    sessionStorage.setItem(SHARED_KEY(roomId), '1');
  } catch {
    /* ignore */
  }
}

function wasSharedOrPublished(roomId: string | undefined): boolean {
  if (!roomId) return false;
  try {
    return sessionStorage.getItem(SHARED_KEY(roomId)) === '1';
  } catch {
    return false;
  }
}

export function FirstRoomChecklist({
  roomId,
  onImportPhoto,
  onShare,
}: {
  roomId?: string;
  onImportPhoto?: () => void;
  onShare?: () => void;
}) {
  const { user } = useAuth();
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const [progress, setProgress] = useState<FirstRoomProgress | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProgress(null);
      return;
    }
    setProgress(loadFirstRoomProgress(user.id));
  }, [user?.id]);

  const derived = useMemo(() => {
    const list = order.map((id) => items[id]).filter(Boolean);
    return deriveFirstRoomCompletions({
      hasBed: list.some((it) => it?.kind === 'bed'),
      itemCount: list.length,
      hasImported: list.some((it) => it?.kind === 'imported'),
      hasSharedOrPublished: wasSharedOrPublished(roomId),
    });
  }, [items, order, roomId]);

  useEffect(() => {
    if (!user?.id || !progress || progress.dismissed) return;
    let changed = false;
    let next = progress;
    (Object.keys(derived) as FirstRoomStepId[]).forEach((step) => {
      if (derived[step] && !next.completed[step]) {
        next = markFirstRoomStep(user.id, step);
        changed = true;
      }
    });
    if (changed) setProgress(next);
  }, [derived, progress, user?.id]);

  if (!user?.id || !progress || progress.dismissed) return null;
  if (allFirstRoomStepsDone(progress.completed)) {
    return (
      <aside className="first-room-checklist first-room-checklist--done" aria-label="First room complete">
        <p className="first-room-checklist__title">Nice — your first room is ready</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setProgress(dismissFirstRoomChecklist(user.id))}
        >
          Dismiss
        </Button>
      </aside>
    );
  }

  const completedCount = FIRST_ROOM_STEPS.filter((s) => progress.completed[s.id]).length;

  return (
    <aside className="first-room-checklist" aria-label="First room checklist">
      <div className="first-room-checklist__head">
        <div>
          <p className="first-room-checklist__eyebrow">First room</p>
          <p className="first-room-checklist__title">
            {completedCount} of {FIRST_ROOM_STEPS.length} done
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setProgress(dismissFirstRoomChecklist(user.id))}
        >
          Hide
        </Button>
      </div>
      <ol className="first-room-checklist__list">
        {FIRST_ROOM_STEPS.map((step) => {
          const done = Boolean(progress.completed[step.id]);
          return (
            <li key={step.id} className={done ? 'is-done' : undefined}>
              <span className="first-room-checklist__check" aria-hidden>
                {done ? '✓' : '○'}
              </span>
              <div className="first-room-checklist__copy">
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              {!done && step.id === 'import_photo' && onImportPhoto ? (
                <Button size="sm" variant="outline" onClick={onImportPhoto}>
                  Import
                </Button>
              ) : null}
              {!done && step.id === 'share_or_publish' && onShare ? (
                <Button size="sm" variant="outline" onClick={onShare}>
                  Share
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
