import { useEffect, useState } from 'react';
import { loadPublicRoomLayout } from '../hooks/useRoomLayout';
import { navigate, profilePath } from '../hooks/useRoute';
import { forkPublicRoom, signAvatarPath, type PublicAttribution } from '../lib/profiles';
import { recordRoomView, toggleRoomLike } from '../lib/roomEngagement';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { UserAvatar } from './UserAvatar';

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
  const [ownerId, setOwnerId] = useState<string | null>(null);
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

  const isOwner = !!userId && !!ownerId && userId === ownerId;

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
        setOwnerId(data.ownerId);
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
    if (isOwner) return;
    if (!userId) {
      setShowAuthWall(true);
      return;
    }
    setLikeBusy(true);
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
    return (
      <div className="splash-page">
        <div className="splash-inner">Opening room…</div>
      </div>
    );
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
    <div className="shared-page">
      <header className="shared-topbar">
        <button type="button" className="shared-brand" onClick={onGoHome}>
          <span className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>t</span>
          <span className="tv-logo-text" style={{ fontSize: 20 }}>Toova</span>
        </button>
        <div className="shared-topbar-meta">
          <div className="shared-room-title">{roomName}</div>
          <button
            type="button"
            className="shared-room-sub shared-owner-link"
            onClick={() => navigate(profilePath(ownerHandle))}
          >
            <UserAvatar name={ownerName} src={avatarUrl} size={22} />
            <span>by {ownerName} · view only</span>
          </button>
          <div className="shared-room-fork-meta">
            <span>♥ {formatCount(likesCount)}</span>
            <span> · 👁 {formatCount(viewsCount)}</span>
            <span> · ⧉ {formatCount(forkCount)} copies</span>
            {attr ? ` · ${attr}` : null}
          </div>
        </div>
        <div className="shared-topbar-actions">
          {!isOwner ? (
            <button
              type="button"
              className={`shared-btn-secondary${likedByMe ? ' is-liked' : ''}`}
              disabled={likeBusy}
              onClick={() => void handleLike()}
              aria-pressed={likedByMe}
            >
              {likedByMe ? '♥ Liked' : '♡ Like'}
            </button>
          ) : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy}
            onClick={requireAuthThenCopy}
          >
            Make a copy
          </button>
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

      <div className="shared-hud">Drag to orbit · scroll to zoom</div>

      {showAuthWall ? (
        <div className="shared-auth-wall">
          <div className="shared-auth-card">
            <h2>Sign in to continue</h2>
            <p>Create an account or sign in to like rooms or save a copy.</p>
            <div className="shared-auth-actions">
              <button type="button" className="tv-btn-primary" onClick={() => onRequestAuth('signup')}>
                Sign up
              </button>
              <button type="button" className="shared-btn-secondary" onClick={() => onRequestAuth('signin')}>
                Sign in
              </button>
              <button
                type="button"
                className="shared-auth-dismiss"
                onClick={() => {
                  setShowAuthWall(false);
                  writePendingCopy(false);
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
