import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  clearProfileAvatar,
  uploadProfileAvatar,
} from '../lib/profileStorage';
import {
  fetchProfileCatalogModels,
  fetchProfilePage,
  isValidHandle,
  signAvatarPath,
  updateOwnProfile,
  type ProfileCatalogModel,
  type ProfilePagePayload,
} from '../lib/profiles';
import { navigate, profilePath } from '../hooks/useRoute';
import { resolveCatalogThumbnailUrl } from '../lib/modelStorage';
import { withPreviewTints } from '../hooks/useGalleryRooms';
import type { RoomPreviewItem } from './RoomPreview';
import { ReportDialog } from './ReportDialog';
import { Logo, Splash, Tabs, SiteFooter } from './kit';
import { FeedbackModal } from './FeedbackModal';
import { AnimatedContent } from './bits';
import { ProfileHero } from './profile/ProfileHero';
import { ProfileModelsTab } from './profile/ProfileModelsTab';
import { ProfileRoomsTab } from './profile/ProfileRoomsTab';
import { ProfileSettingsTab } from './profile/ProfileSettingsTab';
import {
  parseProfileTab,
  parseSettingsSection,
  toPreviewItems,
  writeProfileQuery,
  type ProfileTabId,
  type SettingsSectionId,
} from './profile/profileHelpers';

interface ProfilePageProps {
  handle: string;
  viewerUserId: string | null;
  authLoading: boolean;
  onGoHome: () => void;
  onRefreshAuthProfile?: () => Promise<void>;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

function readInitialTab(isOwner: boolean): ProfileTabId {
  if (typeof window === 'undefined') return 'rooms';
  return parseProfileTab(new URLSearchParams(window.location.search).get('tab'), isOwner);
}

function readInitialSection(): SettingsSectionId {
  if (typeof window === 'undefined') return 'profile';
  return parseSettingsSection(new URLSearchParams(window.location.search).get('section'));
}

export function ProfilePage({
  handle,
  viewerUserId,
  authLoading,
  onGoHome,
  onRefreshAuthProfile,
  onContact,
  onPitchMadness,
  onAdmin,
}: ProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ProfilePagePayload | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ProfileCatalogModel[]>([]);
  const [modelThumbs, setModelThumbs] = useState<Record<string, string>>({});
  const [roomPreviews, setRoomPreviews] = useState<Record<string, RoomPreviewItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTabId>('rooms');
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('profile');

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
        setActiveTab(readInitialTab(data.is_owner));
        setSettingsSection(readInitialSection());
        const signed = await signAvatarPath(data.profile.avatar_path);
        if (!cancelled) setAvatarUrl(signed);

        const catalog = await fetchProfileCatalogModels(handle);
        if (!cancelled && catalog) {
          setModels(catalog.models);
          const thumbs: Record<string, string> = {};
          await Promise.all(
            catalog.models.map(async (m) => {
              if (!m.thumbnail_path) return;
              const url = await resolveCatalogThumbnailUrl(m.thumbnail_path, {
                access: m.visibility === 'public' ? 'public' : 'private',
              });
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, RoomPreviewItem[]> = {};
      await Promise.all(
        rooms.map(async (room) => {
          next[room.id] = await withPreviewTints(toPreviewItems(room));
        }),
      );
      if (!cancelled) setRoomPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms]);

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

  function handleTabChange(id: string) {
    const next = parseProfileTab(id, isOwner);
    setActiveTab(next);
    writeProfileQuery(next, next === 'settings' ? settingsSection : undefined);
  }

  function openSettings(section: SettingsSectionId = 'profile') {
    setSettingsSection(section);
    setActiveTab('settings');
    writeProfileQuery('settings', section);
  }

  if (loading || authLoading) {
    return <Splash label="Loading profile…" />;
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

  const tabs = [
    { id: 'rooms', label: 'Rooms', count: rooms.length },
    { id: 'models', label: 'Models', count: models.length },
    ...(isOwner ? [{ id: 'settings', label: 'Settings' }] : []),
  ];

  return (
    <div className="toova-page app-page profile-page tv-scroll">
      <div className="toova-paper" aria-hidden />

      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Logo size={21} onClick={onGoHome} />
        </div>
      </header>

      <main className="app-main">
        <ProfileHero
          profile={profile}
          avatarUrl={avatarUrl}
          isOwner={isOwner}
          roomCount={rooms.length}
          modelCount={models.length}
          totalLikes={totalLikes}
          totalViews={totalViews}
          onEditProfile={() => openSettings('profile')}
          onReport={!isOwner ? () => setReportOpen(true) : undefined}
        />

        <div className="profile-tabs">
          <Tabs
            tabs={tabs}
            active={activeTab}
            onChange={handleTabChange}
            animated
            layoutId="profile-tabs-underline"
            aria-label="Profile sections"
          />
        </div>

        <div
          className="profile-tabpanel"
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          <AnimatedContent contentKey={activeTab}>
            {activeTab === 'rooms' ? (
              <ProfileRoomsTab
                rooms={rooms}
                isOwner={isOwner}
                profileHandle={profile.handle}
                profileIsPublic={profile.is_public}
                roomPreviews={roomPreviews}
              />
            ) : null}
            {activeTab === 'models' ? (
              <ProfileModelsTab models={models} modelThumbs={modelThumbs} isOwner={isOwner} />
            ) : null}
            {activeTab === 'settings' && isOwner && viewerUserId ? (
              <ProfileSettingsTab
                profile={profile}
                avatarUrl={avatarUrl}
                viewerUserId={viewerUserId}
                busy={busy}
                formError={formError}
                editHandle={editHandle}
                editName={editName}
                editBio={editBio}
                editPublic={editPublic}
                initialSection={settingsSection}
                onEditHandle={setEditHandle}
                onEditName={setEditName}
                onEditBio={setEditBio}
                onEditPublic={setEditPublic}
                onSave={(e) => void handleSave(e)}
                onAvatarChange={(file) => void handleAvatarChange(file)}
                onClearAvatar={() => void handleClearAvatar()}
              />
            ) : null}
          </AnimatedContent>
        </div>

        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="profile"
          targetId={profile.id}
          targetLabel={`@${profile.handle}`}
          allowAnonymousEmail={!viewerUserId}
        />
      </main>

      <SiteFooter
        onContact={onContact}
        onPitchMadness={onPitchMadness}
        onFeedback={() => setFeedbackOpen(true)}
        onAdmin={onAdmin}
      />
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="dashboard"
      />
    </div>
  );
}
