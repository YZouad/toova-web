import { useEffect, useState } from 'react';
import { loadSharedRoomLayout } from '../hooks/useRoomLayout';
import { navigate, profilePath } from '../hooks/useRoute';
import { forkSharedRoom, redeemShareToken, type ShareRole } from '../lib/roomShares';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';

interface SharedRoomPageProps {
  token: string;
  userId: string | null;
  authLoading: boolean;
  onRequestAuth: (mode: 'signin' | 'signup') => void;
  onOpenRoom: (room: { id: string; name: string; isOwner?: boolean }) => Promise<void>;
  onGoHome: () => void;
}

const SHARE_ACTION_KEY = 'toova-pending-share-action';

type PendingAction = 'copy' | 'edit';

function readPendingAction(): PendingAction | null {
  try {
    const v = sessionStorage.getItem(SHARE_ACTION_KEY);
    if (v === 'copy' || v === 'edit') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writePendingAction(action: PendingAction | null) {
  try {
    if (action) sessionStorage.setItem(SHARE_ACTION_KEY, action);
    else sessionStorage.removeItem(SHARE_ACTION_KEY);
  } catch {
    /* ignore */
  }
}

export function SharedRoomPage({
  token,
  userId,
  authLoading,
  onRequestAuth,
  onOpenRoom,
  onGoHome,
}: SharedRoomPageProps) {
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('Shared room');
  const [ownerDisplay, setOwnerDisplay] = useState('Toova designer');
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null);
  const [role, setRole] = useState<ShareRole>('viewer');
  const [allowCopy, setAllowCopy] = useState(true);
  const [forkCount, setForkCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAuthWall, setShowAuthWall] = useState(false);
  const [resumeAction, setResumeAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    resetLayout();

    void (async () => {
      try {
        const data = await loadSharedRoomLayout(token);
        if (cancelled) return;
        hydrateLayout(data.items, data.order);
        hydrateRoomSettings(data.environment, data.roomGeometry);
        setRoomName(data.roomName);
        setOwnerDisplay(data.ownerDisplay);
        setOwnerHandle(data.ownerHandle);
        setRole(data.role);
        setAllowCopy(data.allowCopy);
        setForkCount(data.forkCount);
        const pending = readPendingAction();
        if (pending) setResumeAction(pending);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not open this share link.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, hydrateLayout, hydrateRoomSettings, resetLayout]);

  useEffect(() => {
    if (!userId || !resumeAction || loading || authLoading || busy) return;
    const action = resumeAction;
    setResumeAction(null);
    writePendingAction(null);
    setShowAuthWall(false);
    void runAction(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once after auth
  }, [userId, resumeAction, loading, authLoading, busy]);

  async function runAction(action: PendingAction) {
    setBusy(true);
    setActionError(null);
    try {
      if (action === 'copy') {
        const newId = await forkSharedRoom(token, `${roomName} (copy)`);
        await onOpenRoom({ id: newId, name: `${roomName} (copy)`, isOwner: true });
        navigate('/');
        return;
      }
      const roomId = await redeemShareToken(token);
      if (role !== 'editor') {
        setActionError('This link is view-only. Make a copy to edit your own version.');
        return;
      }
      await onOpenRoom({ id: roomId, name: roomName, isOwner: false });
      navigate('/');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  function requireAuthThen(action: PendingAction) {
    if (!userId) {
      writePendingAction(action);
      setShowAuthWall(true);
      return;
    }
    void runAction(action);
  }

  if (loading || authLoading) {
    return (
      <div className="splash-page">
        <div className="splash-inner">Opening shared room…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-page shared-page--error">
        <div className="shared-error-card">
          <h1>Link unavailable</h1>
          <p>{error}</p>
          <button type="button" className="tv-btn-primary" onClick={onGoHome}>
            Go to Toova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-page">
      <header className="shared-topbar">
        <button type="button" className="shared-brand" onClick={onGoHome}>
          <span className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>t</span>
          <span className="tv-logo-text" style={{ fontSize: 20 }}>Toova</span>
        </button>
        <div className="shared-topbar-meta">
          <div className="shared-room-title">{roomName}</div>
          <div className="shared-room-sub">
            {ownerHandle ? (
              <button
                type="button"
                className="shared-owner-link"
                onClick={() => navigate(profilePath(ownerHandle))}
              >
                by {ownerDisplay}
              </button>
            ) : (
              <span>by {ownerDisplay}</span>
            )}
            {' · '}
            {role === 'editor' ? 'can edit' : 'view only'}
            {forkCount > 0 ? ` · ${forkCount} copies` : ''}
          </div>
        </div>
        <div className="shared-topbar-actions">
          {allowCopy ? (
            <button
              type="button"
              className="tv-btn-primary"
              disabled={busy}
              onClick={() => requireAuthThen('copy')}
            >
              Make a copy
            </button>
          ) : null}
          {role === 'editor' ? (
            <button
              type="button"
              className="shared-btn-secondary"
              disabled={busy}
              onClick={() => requireAuthThen('edit')}
            >
              Edit this room
            </button>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <div className="tv-banner-error" style={{ margin: '0 20px' }} role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="shared-canvas">
        <Scene readOnly />
      </div>

      <div className="shared-hud">
        Drag to orbit · scroll to zoom
      </div>

      {showAuthWall ? (
        <div className="shared-auth-wall">
          <div className="shared-auth-card">
            <h2>Sign in to continue</h2>
            <p>
              {readPendingAction() === 'edit'
                ? 'Create an account or sign in to edit this room.'
                : 'Create an account or sign in to save a copy to your rooms.'}
            </p>
            <div className="shared-auth-actions">
              <button
                type="button"
                className="tv-btn-primary"
                onClick={() => onRequestAuth('signup')}
              >
                Sign up
              </button>
              <button
                type="button"
                className="shared-btn-secondary"
                onClick={() => onRequestAuth('signin')}
              >
                Sign in
              </button>
              <button
                type="button"
                className="shared-auth-dismiss"
                onClick={() => {
                  setShowAuthWall(false);
                  writePendingAction(null);
                }}
              >
                Keep viewing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
