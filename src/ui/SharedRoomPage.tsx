import { useEffect, useState } from 'react';
import { loadSharedRoomLayout } from '../hooks/useRoomLayout';
import { navigate, profilePath } from '../hooks/useRoute';
import { forkSharedRoom, redeemShareToken, type ShareRole } from '../lib/roomShares';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { Button, DisplayHeading, Logo, MonoMeta, Splash } from './kit';

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

function roleLabel(role: ShareRole): string {
  return role === 'editor' ? 'can edit' : 'view only';
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
    return <Splash label="Opening shared room…" />;
  }

  if (error) {
    return (
      <div className="shared-page shared-page--error toova-page">
        <div className="toova-paper" aria-hidden />
        <div className="shared-error-card" style={{ position: 'relative', zIndex: 2 }}>
          <DisplayHeading level={5} as="div">Link unavailable</DisplayHeading>
          <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)' }}>{error}</p>
          <Button size="sm" onClick={onGoHome}>
            Go to Toova
          </Button>
        </div>
      </div>
    );
  }

  const metaParts = [
    !ownerHandle ? `by ${ownerDisplay}` : null,
    forkCount > 0 ? `${forkCount} copies` : null,
  ].filter(Boolean);

  return (
    <div className="shared-page toova-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="toova-paper" aria-hidden />
      <header className="shared-topbar">
        <button type="button" className="shared-brand" onClick={onGoHome} aria-label="Toova home">
          <Logo size={32} wordmark={false} />
        </button>
        <div className="shared-topbar-meta">
          <div className="shared-topbar-title-row">
            <h1 className="shared-room-title">{roomName}</h1>
            <MonoMeta size="sm" tone="dense" upper className="shared-topbar-badge">
              {roleLabel(role)}
            </MonoMeta>
          </div>
          <div className="shared-topbar-subrow">
            {ownerHandle ? (
              <button
                type="button"
                className="shared-room-sub shared-owner-link"
                onClick={() => navigate(profilePath(ownerHandle))}
              >
                by {ownerDisplay}
              </button>
            ) : null}
            {metaParts.length > 0 ? (
              <span className="shared-topbar-stats">
                {metaParts.join(' · ')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shared-topbar-actions">
          {allowCopy ? (
            <Button size="sm" disabled={busy} onClick={() => requireAuthThen('copy')}>
              Make a copy
            </Button>
          ) : null}
          {role === 'editor' ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => requireAuthThen('edit')}>
              Edit this room
            </Button>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <div className="tv-banner-error" style={{ margin: '0 20px', position: 'relative', zIndex: 2 }} role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="shared-canvas" style={{ position: 'relative', flex: 1, minHeight: 420, background: 'var(--board)', zIndex: 2 }}>
        <Scene readOnly />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 22,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <MonoMeta size="sm" style={{ color: 'var(--board-ink)' }}>
            Drag to orbit · Pinch or scroll to zoom
          </MonoMeta>
        </div>
      </div>

      {showAuthWall ? (
        <div
          className="shared-auth-wall"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(43,38,32,.62)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: 460,
              maxWidth: '100%',
              background: 'var(--bg-page)',
              border: '1px solid var(--rule-soft)',
              boxShadow: 'var(--shadow-modal)',
              padding: '32px 34px 34px',
            }}
          >
            <DisplayHeading level={6} as="div" style={{ marginBottom: 12 }}>
              Sign in to continue
            </DisplayHeading>
            <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', margin: '0 0 28px' }}>
              {readPendingAction() === 'edit'
                ? 'Create an account or sign in to edit this room.'
                : 'Create an account or sign in to save a copy to your rooms.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => onRequestAuth('signup')}>
                Sign up
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRequestAuth('signin')}>
                Sign in
              </Button>
              <Button
                variant="mono"
                onClick={() => {
                  setShowAuthWall(false);
                  writePendingAction(null);
                }}
              >
                Keep viewing
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
