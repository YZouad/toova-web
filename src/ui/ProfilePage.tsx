import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { parseFloorPlan } from '../lib/roomGeometry';
import {
  clearProfileAvatar,
  uploadProfileAvatar,
} from '../lib/profileStorage';
import {
  fetchProfilePage,
  isValidHandle,
  profilePath,
  publicRoomPath,
  signAvatarPath,
  updateOwnProfile,
  type ProfilePagePayload,
  type ProfileRoomCard,
} from '../lib/profiles';
import { formatRelativeTime } from '../lib/userDisplay';
import { navigate } from '../hooks/useRoute';
import { RoomPreview, type RoomPreviewItem } from './RoomPreview';
import { UserAvatar } from './UserAvatar';

interface ProfilePageProps {
  handle: string;
  viewerUserId: string | null;
  authLoading: boolean;
  onGoHome: () => void;
  onRefreshAuthProfile?: () => Promise<void>;
}

function toPreviewItems(room: ProfileRoomCard): RoomPreviewItem[] {
  return (room.items ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    position: [Number(row.pos_x), Number(row.pos_y), Number(row.pos_z)],
    rotationY: Number(row.rotation_y),
    size: [Number(row.size_w), Number(row.size_h), Number(row.size_d)],
  }));
}

function attributionLabel(room: ProfileRoomCard): string | null {
  const a = room.attribution;
  if (!a?.visible) {
    return room.forked_from ? 'Copied room' : null;
  }
  return `Forked from ${a.room_name} by ${a.owner_display}`;
}

export function ProfilePage({
  handle,
  viewerUserId,
  authLoading,
  onGoHome,
  onRefreshAuthProfile,
}: ProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ProfilePagePayload | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editHandle, setEditHandle] = useState('');
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPublic, setEditPublic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await fetchProfilePage(handle);
        if (cancelled) return;
        if (!data) {
          setPayload(null);
          setError('not-found');
          return;
        }
        if (data.canonical_handle && data.canonical_handle !== handle) {
          navigate(profilePath(data.canonical_handle), true);
          return;
        }
        setPayload(data);
        setEditHandle(data.profile.handle);
        setEditName(data.profile.display_name);
        setEditBio(data.profile.bio ?? '');
        setEditPublic(data.profile.is_public);
        const signed = await signAvatarPath(data.profile.avatar_path);
        if (!cancelled) setAvatarUrl(signed);
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setError(e instanceof Error ? e.message : 'Could not load profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, viewerUserId]);

  const rooms = useMemo(() => payload?.rooms ?? [], [payload]);
  const isOwner = !!payload?.is_owner;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const nextHandle = editHandle.trim().toLowerCase();
    if (!isValidHandle(nextHandle)) {
      setFormError('Handles must be 3–30 characters: a–z, 0–9, underscore.');
      return;
    }
    if (!editName.trim()) {
      setFormError('Display name is required.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateOwnProfile({
        handle: nextHandle,
        displayName: editName.trim(),
        bio: editBio,
        isPublic: editPublic,
      });
      await onRefreshAuthProfile?.();
      setEditing(false);
      if (updated.handle !== handle) {
        navigate(profilePath(updated.handle), true);
        return;
      }
      const data = await fetchProfilePage(updated.handle);
      setPayload(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file) return;
    setBusy(true);
    setFormError(null);
    try {
      const { signedUrl } = await uploadProfileAvatar(file);
      setAvatarUrl(signedUrl);
      await onRefreshAuthProfile?.();
      const data = await fetchProfilePage(handle);
      setPayload(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not upload avatar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAvatar() {
    setBusy(true);
    setFormError(null);
    try {
      await clearProfileAvatar(payload?.profile.avatar_path);
      setAvatarUrl(null);
      await onRefreshAuthProfile?.();
      const data = await fetchProfilePage(handle);
      setPayload(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not remove avatar.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="splash-page">
        <div className="splash-inner">Loading profile…</div>
      </div>
    );
  }

  if (error === 'not-found' || !payload) {
    return (
      <div className="shared-page shared-page--error">
        <div className="shared-error-card">
          <h1>Profile not found</h1>
          <p>This profile doesn’t exist or isn’t public.</p>
          <button type="button" className="tv-btn-primary" onClick={onGoHome}>
            Go to Toova
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-page shared-page--error">
        <div className="shared-error-card">
          <h1>Couldn’t load profile</h1>
          <p>{error}</p>
          <button type="button" className="tv-btn-primary" onClick={onGoHome}>
            Go to Toova
          </button>
        </div>
      </div>
    );
  }

  const { profile } = payload;

  return (
    <div className="profile-page tv-scroll">
      <header className="profile-topbar">
        <button type="button" className="shared-brand" onClick={onGoHome}>
          <span className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>t</span>
          <span className="tv-logo-text" style={{ fontSize: 20 }}>Toova</span>
        </button>
        {isOwner ? (
          <button
            type="button"
            className="shared-btn-secondary"
            onClick={() => {
              setEditing((v) => !v);
              setFormError(null);
            }}
          >
            {editing ? 'Close editor' : 'Edit profile'}
          </button>
        ) : null}
      </header>

      <div className="profile-main">
        <section className="profile-hero">
          <UserAvatar name={profile.display_name} src={avatarUrl} size={88} />
          <div className="profile-hero-text">
            <h1 className="profile-name">{profile.display_name}</h1>
            <div className="profile-handle">@{profile.handle}</div>
            {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
            <div className="profile-meta">
              {profile.is_public ? 'Public profile' : 'Private profile'}
              {isOwner ? ' · only you can see private rooms here' : null}
            </div>
          </div>
        </section>

        {editing && isOwner ? (
          <form className="profile-edit-card" onSubmit={(e) => void handleSave(e)}>
            <h2>Edit profile</h2>
            {formError ? <div className="tv-banner-error" role="alert">{formError}</div> : null}

            <label className="tv-label">Avatar</label>
            <div className="profile-avatar-actions">
              <label className="shared-btn-secondary profile-file-btn">
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={busy}
                  onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {profile.avatar_path ? (
                <button type="button" className="shared-btn-secondary" disabled={busy} onClick={() => void handleClearAvatar()}>
                  Remove
                </button>
              ) : null}
            </div>

            <label className="tv-label" htmlFor="profile-handle">Handle</label>
            <input
              id="profile-handle"
              className="tv-input"
              value={editHandle}
              onChange={(e) => setEditHandle(e.target.value.toLowerCase())}
              maxLength={30}
              disabled={busy}
            />

            <label className="tv-label" htmlFor="profile-name">Display name</label>
            <input
              id="profile-name"
              className="tv-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={60}
              disabled={busy}
            />

            <label className="tv-label" htmlFor="profile-bio">Bio</label>
            <textarea
              id="profile-bio"
              className="tv-input profile-bio-input"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              maxLength={280}
              rows={3}
              disabled={busy}
            />

            <label className="profile-toggle">
              <input
                type="checkbox"
                checked={editPublic}
                onChange={(e) => setEditPublic(e.target.checked)}
                disabled={busy}
              />
              Make profile public
            </label>
            <p className="profile-toggle-hint">
              Public profiles can list rooms you publish. Private rooms stay hidden.
            </p>

            <button type="submit" className="tv-btn-primary" disabled={busy}>
              Save profile
            </button>
          </form>
        ) : null}

        <section className="profile-rooms">
          <h2 className="profile-rooms-title">
            {isOwner ? 'Your rooms' : 'Published rooms'}
          </h2>
          {rooms.length === 0 ? (
            <div className="profile-empty">
              {isOwner
                ? 'No rooms yet. Publish a room from your dashboard to show it here.'
                : 'No published rooms yet.'}
            </div>
          ) : (
            <div className="dashboard-grid">
              {rooms.map((room) => {
                const items = toPreviewItems(room);
                const geometry = parseFloorPlan(room.room_geometry);
                const attr = attributionLabel(room);
                const canOpenPublic = room.visibility === 'public' && profile.is_public;
                return (
                  <div key={room.id} className="dashboard-room-card">
                    <div className="dashboard-room-preview">
                      <RoomPreview geometry={geometry} items={items} />
                      <span className={`profile-vis-badge profile-vis-badge--${room.visibility}`}>
                        {room.visibility}
                      </span>
                    </div>
                    <div className="dashboard-room-body">
                      <div className="profile-room-title">{room.name}</div>
                      <div className="profile-room-sub">
                        {room.fork_count > 0 ? `${room.fork_count} copies · ` : null}
                        {formatRelativeTime(room.updated_at)}
                      </div>
                      {attr ? <div className="room-attribution">{attr}</div> : null}
                      {canOpenPublic ? (
                        <button
                          type="button"
                          className="profile-room-open"
                          onClick={() => navigate(publicRoomPath(profile.handle, room.id))}
                        >
                          Open room →
                        </button>
                      ) : isOwner ? (
                        <div className="profile-room-private-note">
                          {room.visibility === 'public'
                            ? 'Published — make your profile public to share this link.'
                            : 'Private — publish from the dashboard to show visitors.'}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
