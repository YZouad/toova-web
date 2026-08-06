import { useEffect, useState } from 'react';
import { loadPublicRoomLayout } from '../hooks/useRoomLayout';
import { navigate, profilePath } from '../hooks/useRoute';
import { forkPublicRoom, signAvatarPath, type PublicAttribution } from '../lib/profiles';
import { recordRoomView, toggleRoomLike } from '../lib/roomEngagement';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { UserAvatar } from './UserAvatar';
import { Button, DisplayHeading, Logo, MonoMeta, Splash } from './kit';

interface PublicRoomPageProps {
  handle: string;
  roomId: string;
  userId: string | null;
  authLoading: boolean;
  onRequestAuth: (mode: 'signin' | 'signup') => void;
  onOpenRoom: (room: { id: string; name: string; isOwner?: boolean }) => Promise<void>;
  onGoHome: () => void;
}

const PUBLIC_COPY_ACTION_KEY = 'toova-pending-public-copy';

function readPendingCopy(): boolean {
  try {
    return sessionStorage.getItem(PUBLIC_COPY_ACTION_KEY) === '1';
  } catch {
    return false;
  }
}

function writePendingCopy(on: boolean) {
  try {
    if (on) sessionStorage.setItem(PUBLIC_COPY_ACTION_KEY, '1');
    else sessionStorage.removeItem(PUBLIC_COPY_ACTION_KEY);
  } catch {
    /* ignore */
  }
}

function attributionText(a: PublicAttribution | null): string | null {
  if (!a) return null;
  if (!a.visible) return null;
  return `Forked from ${a.room_name} by ${a.owner_display}`;
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

export function PublicRoomPage({
  handle,
  roomId,
  userId,
  authLoading,
  onRequestAuth,
  onOpenRoom,
  onGoHome,
}: PublicRoomPageProps) {
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('Room');
  const [ownerName, setOwnerName] = useState('Toova designer');
  const [ownerHandle, setOwnerHandle] = useState(handle);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [forkCount, setForkCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [viewsCount, setViewsCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [attribution, setAttribution] = useState<PublicAttribution | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAuthWall, setShowAuthWall] = useState(false);
  const [resumeCopy, setResumeCopy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    resetLayout();

    void (async () => {
      try {
        const data = await loadPublicRoomLayout(handle, roomId);
        if (cancelled) return;
        hydrateLayout(data.items, data.order);
        hydrateRoomSettings(data.environment, data.roomGeometry);
        setRoomName(data.roomName);
        setOwnerName(data.owner.displayName);
        setOwnerHandle(data.owner.handle);
        setForkCount(data.forkCount);
        setLikesCount(data.likesCount);
        setViewsCount(data.viewsCount);
        setLikedByMe(data.likedByMe);
        setAttribution(data.attribution);
        const signed = await signAvatarPath(data.owner.avatarPath);
        if (!cancelled) setAvatarUrl(signed);
        if (readPendingCopy()) setResumeCopy(true);

        void recordRoomView(data.roomId)
          .then((next) => {
            if (!cancelled && typeof next === 'number') setViewsCount(next);
          })
          .catch(() => {
            /* best-effort */
          });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not open this room.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, roomId, hydrateLayout, hydrateRoomSettings, resetLayout]);

  useEffect(() => {
    if (!userId || !resumeCopy || loading || authLoading || busy) return;
    setResumeCopy(false);
    writePendingCopy(false);
    setShowAuthWall(false);
    void runCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once after auth
  }, [userId, resumeCopy, loading, authLoading, busy]);

  async function runCopy() {
    setBusy(true);
    setActionError(null);
    try {
      const newId = await forkPublicRoom(ownerHandle, roomId, `${roomName} (copy)`);
      setForkCount((c) => c + 1);
      await onOpenRoom({ id: newId, name: `${roomName} (copy)`, isOwner: true });
      navigate('/');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not make a copy.');
    } finally {
      setBusy(false);
    }
  }

  function requireAuthThenCopy() {
    if (!userId) {
      writePendingCopy(true);
      setShowAuthWall(true);
      return;
    }
    void runCopy();
  }

  async function handleLike() {
    if (!userId) {
      setShowAuthWall(true);
      return;
    }
    setLikeBusy(true);
    setActionError(null);
    const prevLiked = likedByMe;
    const prevCount = likesCount;
    setLikedByMe(!prevLiked);
    setLikesCount(Math.max(0, prevCount + (prevLiked ? -1 : 1)));
    try {
      const res = await toggleRoomLike(roomId);
      setLikedByMe(res.liked);
      setLikesCount(res.likes_count);
    } catch (e) {
      setLikedByMe(prevLiked);
      setLikesCount(prevCount);
      setActionError(e instanceof Error ? e.message : 'Could not update like');
    } finally {
      setLikeBusy(false);
    }
  }

  if (loading || authLoading) {
    return <Splash label="Opening room…" />;
  }

  if (error) {
    return (
      <div className="shared-page shared-page--error">
        <div className="shared-error-card">
          <h1>Room unavailable</h1>
          <p>{error}</p>
          <button type="button" className="tv-btn-primary" onClick={onGoHome}>
            Go to Toova
          </button>
        </div>
      </div>
    );
  }

  const attr = attributionText(attribution);

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
              view only
            </MonoMeta>
          </div>
          <div className="shared-topbar-subrow">
            <button
              type="button"
              className="shared-room-sub shared-owner-link"
              onClick={() => navigate(profilePath(ownerHandle))}
            >
              <UserAvatar name={ownerName} src={avatarUrl} size={20} />
              <span>by {ownerName}</span>
            </button>
            <span className="shared-topbar-stats">
              <button
                type="button"
                className={`shared-topbar-likes${likedByMe ? ' is-liked' : ''}`}
                disabled={likeBusy}
                onClick={() => void handleLike()}
                aria-pressed={likedByMe}
                title={userId ? (likedByMe ? 'Unlike' : 'Like') : 'Sign in to like'}
              >
                {likedByMe ? '♥' : '♡'} {formatCount(likesCount)} likes
              </button>
              {' · '}
              {formatCount(viewsCount)} views · {formatCount(forkCount)} copies
              {attr ? ` · ${attr}` : ''}
            </span>
          </div>
        </div>
        <div className="shared-topbar-actions">
          <Button
            size="sm"
            variant="outline"
            className={likedByMe ? 'shared-btn-secondary is-liked' : undefined}
            disabled={likeBusy}
            onClick={() => void handleLike()}
            aria-pressed={likedByMe}
          >
            {likedByMe ? '♥ Liked' : '♡ Like'}
          </Button>
          <Button size="sm" disabled={busy} onClick={requireAuthThenCopy}>
            Make a copy
          </Button>
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
              Create an account or sign in to like rooms or save a copy.
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
                  writePendingCopy(false);
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
