import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRoomWorkspace } from '../../context/RoomWorkspaceContext';
import { setRoomVisibility } from '../../lib/profiles';
import { noteRoomSharedOrPublished } from './FirstRoomChecklist';
import { useStore } from '../../store';
import { Button } from '../kit/Button';

const DISMISS_KEY = (roomId: string) => `toova-publish-prompt-dismissed:${roomId}`;

export function PublishPrompt() {
  const { user } = useAuth();
  const { workspace } = useRoomWorkspace();
  const order = useStore((s) => s.order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [published, setPublished] = useState(false);

  const roomId = workspace?.id;
  const isOwner = Boolean(workspace?.isOwner && user?.id && roomId && !roomId.startsWith('guest-'));

  useEffect(() => {
    if (!roomId) {
      setDismissed(false);
      setPublished(false);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY(roomId)) === '1');
    } catch {
      setDismissed(false);
    }
    setPublished(false);
    setError(null);
  }, [roomId]);

  const itemCount = order.length;
  const visible = useMemo(
    () => isOwner && !dismissed && !published && itemCount >= 10,
    [isOwner, dismissed, published, itemCount],
  );

  if (!visible || !roomId) return null;

  async function handlePublish() {
    if (!roomId) return;
    setBusy(true);
    setError(null);
    try {
      await setRoomVisibility(roomId, 'public');
      noteRoomSharedOrPublished(roomId);
      setPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish room.');
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (!roomId) return;
    try {
      sessionStorage.setItem(DISMISS_KEY(roomId), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <aside className="publish-prompt" role="status">
      <div className="publish-prompt__copy">
        <strong>Ready to share?</strong>
        <span>
          Your room has {itemCount} pieces. Publish it to the gallery so others can like and remix it.
        </span>
        {error ? <span style={{ color: '#b44' }}>{error}</span> : null}
      </div>
      <Button size="sm" disabled={busy} onClick={() => void handlePublish()}>
        {busy ? 'Publishing…' : 'Publish'}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>
        Not now
      </Button>
    </aside>
  );
}
