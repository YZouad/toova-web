import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { parseFloorPlan } from '../lib/roomGeometry';
import {
  clearProfileAvatar,
  uploadProfileAvatar,
} from '../lib/profileStorage';
import {
  fetchProfileCatalogModels,
  fetchProfilePage,
  isValidHandle,
  publicRoomPath,
  signAvatarPath,
  updateOwnProfile,
  type ProfileCatalogModel,
  type ProfilePagePayload,
  type ProfileRoomCard,
} from '../lib/profiles';
import { formatRelativeTime } from '../lib/userDisplay';
import { profilePath, navigate, galleryPath } from '../hooks/useRoute';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { planBounds } from '../lib/roomGeometry';
import { RoomPreview, type RoomPreviewItem } from './RoomPreview';
import { UserAvatar } from './UserAvatar';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  DisplayHeading,
  EmptyState,
  Field,
  Input,
  Logo,
  MonoMeta,
  Plate,
  PlateCard,
  SectionOpener,
} from './kit';

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

function formatSqft(geometry: ReturnType<typeof parseFloorPlan>): string {
  if (!geometry) return '—';
  const b = planBounds(geometry);
  const sqft = Math.round((b.width * b.depth) / 144);
  return sqft > 0 ? `${sqft} sq ft` : '—';
}

function visibilityLabel(v: string): string {
  if (v === 'public') return 'Public';
  if (v === 'unlisted') return 'Unlisted';
  return 'Private';
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
  const [models, setModels] = useState<ProfileCatalogModel[]>([]);
  const [modelThumbs, setModelThumbs] = useState<Record<string, string>>({});
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

        const catalog = await fetchProfileCatalogModels(handle);
        if (!cancelled && catalog) {
          setModels(catalog.models);
          const thumbs: Record<string, string> = {};
          await Promise.all(
            catalog.models.map(async (m) => {
              if (!m.thumbnail_path) return;
              const url = await signBrowsableModelPath(m.thumbnail_path);
              if (url) thumbs[m.kind] = url;
            }),
          );
          if (!cancelled) setModelThumbs(thumbs);
        }
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

  const totalLikes = rooms.reduce((s, r) => s + Number(r.likes_count ?? 0), 0);
  const totalViews = rooms.reduce((s, r) => s + Number(r.views_count ?? 0), 0);

  return (
    <div className="toova-page app-page profile-page tv-scroll">
      <div className="toova-paper" aria-hidden />

      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Logo size={21} onClick={onGoHome} />
          {isOwner ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing((v) => !v);
                setFormError(null);
              }}
            >
              {editing ? 'Close editor' : 'Edit profile'}
            </Button>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 32, alignItems: 'start' }}>
          <Plate height={160} src={avatarUrl ?? undefined}>
            {!avatarUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <UserAvatar name={profile.display_name} src={null} size={72} />
              </div>
            ) : null}
          </Plate>
          <div>
            <DisplayHeading level={4}>{profile.display_name}</DisplayHeading>
            <MonoMeta size="md" tone="dense" style={{ display: 'block', marginTop: 8 }}>
              @{profile.handle}
            </MonoMeta>
            {profile.bio ? (
              <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', margin: '12px 0 0', maxWidth: 540 }}>
                {profile.bio}
              </p>
            ) : null}
            <MonoMeta size="sm" tone="dense" className="profile-stats-line">
              {[
                `${rooms.length} room${rooms.length === 1 ? '' : 's'}`,
                `${totalLikes} like${totalLikes === 1 ? '' : 's'}`,
                `${totalViews} view${totalViews === 1 ? '' : 's'}`,
                profile.is_public ? 'Public' : 'Private',
              ].join(' · ')}
            </MonoMeta>
          </div>
        </div>

        {editing && isOwner ? (
          <form
            onSubmit={(e) => void handleSave(e)}
            style={{
              marginTop: 40,
              padding: '28px 0',
              borderTop: '1px solid var(--rule-heavy)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxWidth: 480,
            }}
          >
            <SectionOpener level={5} title="Edit profile." />
            {formError ? <Banner tone="error">{formError}</Banner> : null}

            <Field label="Avatar">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label>
                  <Button size="sm" variant="outline" as="span">
                    Upload photo
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={busy}
                    onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
                  />
                </label>
                {profile.avatar_path ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleClearAvatar()}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label="Handle" htmlFor="profile-handle">
              <Input
                id="profile-handle"
                value={editHandle}
                onChange={(e) => setEditHandle(e.target.value.toLowerCase())}
                maxLength={30}
                disabled={busy}
              />
            </Field>

            <Field label="Display name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                disabled={busy}
              />
            </Field>

            <Field label="Bio" htmlFor="profile-bio">
              <textarea
                id="profile-bio"
                className="kit-input"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={280}
                rows={3}
                disabled={busy}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </Field>

            <Checkbox
              checked={editPublic}
              onChange={setEditPublic}
              disabled={busy}
              label="Make profile public"
            />
            <MonoMeta size="xs" tone="subtle">
              Public profiles can list rooms you publish. Private rooms stay hidden.
            </MonoMeta>

            <Button type="submit" size="md" disabled={busy}>
              Save profile
            </Button>
          </form>
        ) : null}

        <section className="profile-ledger">
          <SectionOpener
            level={5}
            title={isOwner ? 'Your rooms.' : 'Published rooms.'}
            note={`${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
          />
          {rooms.length === 0 ? (
            <EmptyState
              style={{ marginTop: 32 }}
              label="No rooms"
              title={
                isOwner
                  ? 'No rooms yet.'
                  : 'No published rooms yet.'
              }
              body={
                isOwner
                  ? 'Publish a room from your dashboard to show it here.'
                  : undefined
              }
            />
          ) : (
            <div style={{ marginTop: 28 }}>
              <div className="app-ledger-head">
                <span>Plan</span>
                <span>Room</span>
                <span>Engagement</span>
                <span>Floor area</span>
                <span>Updated</span>
                <span className="app-ledger-head__right">Visibility</span>
                <span aria-hidden />
              </div>
              {rooms.map((room, i) => {
                const items = toPreviewItems(room);
                const geometry = parseFloorPlan(room.room_geometry);
                const attr = attributionLabel(room);
                const canOpenPublic = room.visibility === 'public' && profile.is_public;
                return (
                  <div
                    key={room.id}
                    className={[
                      'app-ledger-row',
                      canOpenPublic ? 'app-ledger-row--interactive' : '',
                      i === 0 ? 'app-ledger-row--first' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={
                      canOpenPublic
                        ? () => navigate(publicRoomPath(profile.handle, room.id))
                        : undefined
                    }
                    role={canOpenPublic ? 'button' : undefined}
                    tabIndex={canOpenPublic ? 0 : undefined}
                  >
                    <Plate height={84} topCaption={`${room.name.slice(0, 12).toLowerCase()}.jpg`}>
                      <div className="app-ledger-plate-preview">
                        <RoomPreview geometry={geometry} items={items} />
                      </div>
                    </Plate>
                    <div>
                      <div className="app-ledger-name">{room.name}</div>
                      {attr ? <div className="app-ledger-attribution">{attr}</div> : null}
                      {isOwner && !canOpenPublic ? (
                        <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginTop: 4 }}>
                          {room.visibility === 'public'
                            ? 'Make your profile public to share this link.'
                            : 'Publish from the dashboard to show visitors.'}
                        </MonoMeta>
                      ) : null}
                    </div>
                    <MonoMeta size="md" tone="default">
                      ♥ {Number(room.likes_count ?? 0)} · 👁 {Number(room.views_count ?? 0)}
                    </MonoMeta>
                    <MonoMeta size="md" tone="default">{formatSqft(geometry)}</MonoMeta>
                    <MonoMeta size="md" tone="default">{formatRelativeTime(room.updated_at)}</MonoMeta>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Badge tone={room.visibility === 'public' ? 'accent' : 'neutral'} dot={room.visibility === 'public'}>
                        {visibilityLabel(room.visibility)}
                      </Badge>
                    </div>
                    <span />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ marginTop: 56 }}>
          <SectionOpener
            level={5}
            title={isOwner ? 'Your models.' : 'Published models.'}
            note={`${models.length} model${models.length === 1 ? '' : 's'}`}
          />
          {models.length === 0 ? (
            <EmptyState
              style={{ marginTop: 32 }}
              label="No models"
              title={isOwner ? 'No models yet.' : 'No published models yet.'}
              body={isOwner ? 'Create one from the gallery or designer.' : undefined}
            />
          ) : (
            <div className="gallery-plate-grid gallery-plate-grid--models" style={{ marginTop: 28 }}>
              {models.map((m) => (
                <PlateCard
                  key={m.kind}
                  name={m.label}
                  meta={`♥ ${m.likes_count} · ↓ ${m.downloads_count} · 👁 ${m.views_count}`}
                  height={180}
                  filename={`${m.kind.split('-')[0]}.glb`}
                  src={modelThumbs[m.kind]}
                  onClick={() => navigate(galleryPath('?source=community'))}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
