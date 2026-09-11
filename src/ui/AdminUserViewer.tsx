import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { navigate, profilePath, publicRoomPath } from '../hooks/useRoute';
import { parseAdminUserAnalyticsExtras } from '../lib/adminAnalytics';
import {
  fetchAdminUserOverview,
  type AdminUserAnalyticsSeries,
  type AdminUserModelRow,
  type AdminUserOverview,
  type AdminUserProfile,
  type AdminUserRoomRow,
} from '../lib/adminUserOverview';
import { isCatalogCategorySlug, type CatalogCategorySlug } from '../lib/catalogCategories';
import { resolveBrowsableModelUrl, resolveCatalogThumbnailUrl } from '../lib/modelStorage';
import { signAvatarPath } from '../lib/profiles';
import { signRoomThumbnailPath } from '../lib/roomThumbnailStorage';
import { formatRelativeTime, shortenId } from '../lib/userDisplay';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  KeyValueRow,
  MonoMeta,
  RuledTable,
  SectionOpener,
  Spinner,
  Tabs,
} from './kit';
import { BreakdownTable, LineChart } from './analytics';
import { ModelDetailModal } from './ModelDetailModal';

type ViewerTab = 'overview' | 'rooms' | 'models' | 'analytics';

export interface AdminUserViewerProps {
  userId: string;
  currentUserId: string | null;
  onClose: () => void;
  onOpenRoom: (room: { id: string; name: string; isOwner?: boolean }) => Promise<void>;
}

function visibilityTone(visibility: string): 'accent' | 'neutral' | 'danger' {
  if (visibility === 'public') return 'accent';
  if (visibility === 'unlisted') return 'neutral';
  return 'neutral';
}

function toGalleryModel(
  model: AdminUserModelRow,
  owner: Pick<AdminUserProfile, 'user_id' | 'handle' | 'display_name'>,
  urls: { signedUrl: string | null; previewUrl: string | null },
): GalleryModel {
  const path = model.model_url?.trim() ?? '';
  const isAbsolute = path.startsWith('http://') || path.startsWith('https://');
  const categories = model.categories.filter(isCatalogCategorySlug) as CatalogCategorySlug[];
  return {
    kind: model.kind,
    label: model.label,
    description: model.description,
    tags: model.tags,
    categories,
    width_in: model.width_in,
    height_in: model.height_in,
    depth_in: model.depth_in,
    clearance_in: model.clearance_in,
    userId: owner.user_id,
    visibility: model.visibility,
    isBuiltin: false,
    likesCount: model.likes_count,
    downloadsCount: model.downloads_count,
    viewsCount: model.views_count,
    createdAt: model.created_at,
    creatorHandle: owner.handle,
    creatorDisplayName: owner.display_name,
    likedByMe: false,
    hotScore: 0,
    storagePath: isAbsolute ? '' : path,
    signedUrl: urls.signedUrl,
    previewUrl: urls.previewUrl,
  };
}

function UserAnalyticsExtras({
  extras,
  series,
}: {
  extras: Record<string, unknown>;
  series: AdminUserAnalyticsSeries[];
}) {
  const parsed = parseAdminUserAnalyticsExtras(extras);
  const totals = parsed.totals ?? {};
  return (
    <>
      <div className="admin-user-viewer__metrics">
        {[
          { label: 'Period events', value: String(totals.events ?? 0) },
          { label: 'Sessions', value: String(totals.sessions ?? 0) },
          { label: 'Page views', value: String(totals.page_views ?? 0) },
          { label: 'Searches', value: String(totals.searches ?? 0) },
          { label: 'Affiliate clicks', value: String(totals.affiliate_clicks ?? 0) },
          { label: 'Checklist adds', value: String(totals.checklist_adds ?? 0) },
        ].map((m) => (
          <div key={m.label} className="admin-user-viewer__metric">
            <MonoMeta size="xs" tone="dense" upper>{m.label}</MonoMeta>
            <div className="admin-user-viewer__metric-value">{m.value}</div>
          </div>
        ))}
      </div>
      {series.length > 0 ? (
        series.map((item) => (
          <LineChart key={item.key} title={item.label} points={item.points} unit={item.unit} />
        ))
      ) : (
        <EmptyState title="No event series yet." body="Consented page views and sessions will plot here." />
      )}
      {parsed.funnel && parsed.funnel.length > 0 ? (
        <div className="admin-user-viewer__section">
          <SectionOpener level={5} title="Activation milestones." />
          {parsed.funnel.map((step) => (
            <KeyValueRow
              key={step.key}
              label={step.label}
              value={step.at ? formatRelativeTime(step.at) : 'Not yet'}
            />
          ))}
        </div>
      ) : null}
      {parsed.breakdowns?.events ? (
        <BreakdownTable title="Events" rows={parsed.breakdowns.events} />
      ) : null}
      {parsed.breakdowns?.search_context ? (
        <BreakdownTable title="Search context" rows={parsed.breakdowns.search_context} />
      ) : null}
      {parsed.breakdowns?.affiliate_surface ? (
        <BreakdownTable title="Affiliate surfaces" rows={parsed.breakdowns.affiliate_surface} />
      ) : null}
      {parsed.breakdowns?.generation_status ? (
        <BreakdownTable title="Generations" rows={parsed.breakdowns.generation_status} />
      ) : null}
      {parsed.recent_events && parsed.recent_events.length > 0 ? (
        <RuledTable
          columns={[
            { label: 'When', align: 'left' },
            { label: 'Event', align: 'left' },
            { label: 'Route', align: 'left' },
          ]}
          rows={parsed.recent_events.map((row) => [
            formatRelativeTime(row.occurred_at),
            row.name,
            row.route ?? '—',
          ])}
        />
      ) : null}
    </>
  );
}

function AnalyticsSeriesBlock({ series }: { series: AdminUserAnalyticsSeries }) {
  if (series.points.length === 0) {
    return (
      <div className="admin-user-series">
        <SectionOpener level={5} title={`${series.label}.`} />
        <MonoMeta size="sm" tone="dense">No points yet.</MonoMeta>
      </div>
    );
  }
  const max = Math.max(...series.points.map((p) => p.v), 1);
  return (
    <div className="admin-user-series">
      <SectionOpener level={5} title={`${series.label}.`} note={series.unit} />
      <div className="admin-user-series__bars">
        {series.points.map((pt) => (
          <div key={pt.t} className="admin-user-series__row">
            <MonoMeta size="xs" tone="dense" style={{ width: 92 }}>
              {formatRelativeTime(pt.t)}
            </MonoMeta>
            <div className="admin-user-series__track">
              <div
                className="admin-user-series__fill"
                style={{ width: `${Math.round((pt.v / max) * 100)}%` }}
              />
            </div>
            <MonoMeta size="sm">{String(pt.v)}</MonoMeta>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminUserViewer({
  userId,
  currentUserId,
  onClose,
  onOpenRoom,
}: AdminUserViewerProps) {
  const [tab, setTab] = useState<ViewerTab>('overview');
  const [overview, setOverview] = useState<AdminUserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [roomThumbs, setRoomThumbs] = useState<Record<string, string>>({});
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [detailModel, setDetailModel] = useState<GalleryModel | null>(null);
  const [modelBusyKind, setModelBusyKind] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);
    setAvatarUrl(null);
    setRoomThumbs({});
    setTab('overview');

    void (async () => {
      try {
        const data = await fetchAdminUserOverview(userId);
        if (cancelled) return;
        setOverview(data);
        const signed = await signAvatarPath(data.user.avatar_path);
        if (!cancelled) setAvatarUrl(signed);

        const thumbs: Record<string, string> = {};
        await Promise.all(
          data.rooms.map(async (room) => {
            const path = room.thumbnail_path?.trim();
            if (!path) return;
            const url = await signRoomThumbnailPath(path);
            if (url) thumbs[room.room_id] = url;
          }),
        );
        if (!cancelled) setRoomThumbs(thumbs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load user');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const initials = useMemo(() => {
    const name = overview?.user.display_name ?? overview?.user.handle ?? userId;
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  }, [overview, userId]);

  async function openRoom(room: AdminUserRoomRow) {
    setOpeningRoomId(room.room_id);
    setError(null);
    try {
      await onOpenRoom({ id: room.room_id, name: room.name, isOwner: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open room');
    } finally {
      setOpeningRoomId(null);
    }
  }

  function openPublicRoom(room: AdminUserRoomRow) {
    const handle = overview?.user.handle;
    if (!handle) return;
    onClose();
    navigate(publicRoomPath(handle, room.room_id));
  }

  async function openModel(model: AdminUserModelRow) {
    if (!overview) return;
    setModelBusyKind(model.kind);
    setError(null);
    try {
      const path = model.model_url?.trim() ?? '';
      const access = model.visibility === 'public' ? 'public' : 'private';
      const signedUrl = path
        ? path.startsWith('http://') || path.startsWith('https://')
          ? path
          : await resolveBrowsableModelUrl(path, { access })
        : null;
      const thumbPath = model.thumbnail_path?.trim() ?? '';
      const previewUrl = thumbPath
        ? await resolveCatalogThumbnailUrl(thumbPath, { access })
        : null;
      setDetailModel(toGalleryModel(model, overview.user, { signedUrl, previewUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open model');
    } finally {
      setModelBusyKind(null);
    }
  }

  const user = overview?.user;
  const analytics = overview?.analytics;

  return (
    <>
      {createPortal(
        <div className="admin-user-viewer" role="presentation" onClick={onClose}>
      <div
        className="admin-user-viewer__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-viewer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-user-viewer__head">
          <div className="admin-user-viewer__identity">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="admin-user-viewer__avatar" />
            ) : (
              <div className="admin-user-viewer__avatar admin-user-viewer__avatar--fallback">
                {initials}
              </div>
            )}
            <div>
              <h3 id="admin-user-viewer-title">
                {user?.display_name ?? 'Unnamed'}
              </h3>
              <MonoMeta size="xs" tone="dense" title={userId}>
                {user?.handle ? `@${user.handle}` : 'no handle'}
                {' · '}
                {shortenId(userId)}
              </MonoMeta>
            </div>
          </div>
          <button type="button" className="admin-reports__icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {loading ? <Spinner label="Loading user…" /> : null}

        {!loading && overview && user ? (
          <>
            <Tabs
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'rooms', label: 'Rooms', count: overview.rooms.length },
                { id: 'models', label: 'Models', count: overview.models.length },
                { id: 'analytics', label: 'Analytics' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as ViewerTab)}
            />

            {tab === 'overview' ? (
              <div className="admin-user-viewer__section">
                <div className="admin-user-viewer__metrics">
                  {[
                    { label: 'Rooms', value: String(analytics?.totals.rooms ?? 0) },
                    { label: 'Models', value: String(analytics?.totals.models ?? 0) },
                    { label: 'Placements', value: String(analytics?.totals.placements ?? 0) },
                    { label: 'Generations', value: String(analytics?.totals.generations ?? 0) },
                  ].map((m) => (
                    <div key={m.label} className="admin-user-viewer__metric">
                      <MonoMeta size="xs" tone="dense" upper>{m.label}</MonoMeta>
                      <div className="admin-user-viewer__metric-value">{m.value}</div>
                    </div>
                  ))}
                </div>
                <KeyValueRow label="Email" value={user.email ?? '—'} />
                <KeyValueRow label="Plan" value={<Badge tone="accent">{user.plan}</Badge>} />
                <KeyValueRow
                  label="Profile"
                  value={
                    <Badge tone={user.is_public ? 'accent' : 'neutral'}>
                      {user.is_public ? 'Public' : 'Private'}
                    </Badge>
                  }
                />
                <KeyValueRow
                  label="Last active"
                  value={user.last_active_at ? formatRelativeTime(user.last_active_at) : '—'}
                />
                <KeyValueRow
                  label="Last sign-in"
                  value={user.last_sign_in_at ? formatRelativeTime(user.last_sign_in_at) : '—'}
                />
                <KeyValueRow
                  label="Joined"
                  value={user.created_at ? formatRelativeTime(user.created_at) : '—'}
                  last={!user.bio}
                />
                {user.bio ? (
                  <KeyValueRow label="Bio" value={user.bio} last />
                ) : null}
                <div className="admin-user-viewer__actions">
                  {user.handle ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        navigate(profilePath(user.handle!));
                      }}
                    >
                      Open profile
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setTab('rooms')}>
                    View rooms
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTab('models')}>
                    View models
                  </Button>
                </div>
              </div>
            ) : null}

            {tab === 'rooms' ? (
              overview.rooms.length === 0 ? (
                <EmptyState title="No rooms." body="This account has not saved a room yet." />
              ) : (
                <RuledTable
                  columns={[
                    { label: 'Room', align: 'left' },
                    { label: 'Visibility', align: 'left' },
                    { label: 'Items', align: 'right' },
                    { label: 'Updated', align: 'right' },
                    { label: '', align: 'right' },
                  ]}
                  rows={overview.rooms.map((room) => [
                    <div key={`${room.room_id}-name`} className="admin-user-viewer__asset">
                      {roomThumbs[room.room_id] ? (
                        <img src={roomThumbs[room.room_id]} alt="" className="admin-user-viewer__thumb" />
                      ) : (
                        <span className="admin-user-viewer__thumb admin-user-viewer__thumb--empty" />
                      )}
                      <div>
                        <div style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>{room.name}</div>
                        <MonoMeta size="xs" tone="dense">
                          {room.likes_count} likes · {room.views_count} views
                          {room.quarantined_at ? ' · quarantined' : ''}
                        </MonoMeta>
                      </div>
                    </div>,
                    <Badge key={`${room.room_id}-vis`} tone={visibilityTone(room.visibility)}>
                      {room.visibility}
                    </Badge>,
                    <MonoMeta key={`${room.room_id}-items`} size="sm">{String(room.item_count)}</MonoMeta>,
                    <MonoMeta key={`${room.room_id}-upd`} size="sm" tone="dense">
                      {room.updated_at ? formatRelativeTime(room.updated_at) : '—'}
                    </MonoMeta>,
                    <div key={`${room.room_id}-act`} className="admin-reports__row-actions">
                      {room.visibility === 'public' && overview.user.handle ? (
                        <Button size="sm" variant="ghost" onClick={() => openPublicRoom(room)}>
                          Public page
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openingRoomId === room.room_id}
                        onClick={() => void openRoom(room)}
                      >
                        {openingRoomId === room.room_id ? 'Opening…' : 'Open'}
                      </Button>
                    </div>,
                  ])}
                />
              )
            ) : null}

            {tab === 'models' ? (
              overview.models.length === 0 ? (
                <EmptyState title="No models." body="This account has not uploaded or generated a model yet." />
              ) : (
                <RuledTable
                  columns={[
                    { label: 'Model', align: 'left' },
                    { label: 'Visibility', align: 'left' },
                    { label: 'Likes', align: 'right' },
                    { label: 'Created', align: 'right' },
                    { label: '', align: 'right' },
                  ]}
                  rows={overview.models.map((model) => [
                    <div key={`${model.kind}-name`}>
                      <div style={{ font: 'var(--type-ui-sm)', fontWeight: 600 }}>{model.label}</div>
                      <MonoMeta size="xs" tone="dense" title={model.kind}>
                        {model.kind}
                        {model.quarantined_at ? ' · quarantined' : ''}
                      </MonoMeta>
                    </div>,
                    <Badge key={`${model.kind}-vis`} tone={visibilityTone(model.visibility)}>
                      {model.visibility}
                    </Badge>,
                    <MonoMeta key={`${model.kind}-likes`} size="sm">{String(model.likes_count)}</MonoMeta>,
                    <MonoMeta key={`${model.kind}-created`} size="sm" tone="dense">
                      {formatRelativeTime(model.created_at)}
                    </MonoMeta>,
                    <Button
                      key={`${model.kind}-open`}
                      size="sm"
                      variant="outline"
                      disabled={modelBusyKind === model.kind}
                      onClick={() => void openModel(model)}
                    >
                      {modelBusyKind === model.kind ? 'Opening…' : 'Open'}
                    </Button>,
                  ])}
                />
              )
            ) : null}

            {tab === 'analytics' ? (
              <div className="admin-user-viewer__section">
                <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16, maxWidth: 640 }}>
                  Lifetime operational totals plus last-90-day consented events for this account.
                  Empty charts mean collection has not seen this user yet, not necessarily zero product use.
                </MonoMeta>
                <div className="admin-user-viewer__metrics">
                  {[
                    { label: 'Rooms', value: String(analytics?.totals.rooms ?? 0) },
                    { label: 'Public rooms', value: String(analytics?.totals.public_rooms ?? 0) },
                    { label: 'Models', value: String(analytics?.totals.models ?? 0) },
                    { label: 'Public models', value: String(analytics?.totals.public_models ?? 0) },
                    { label: 'Placements', value: String(analytics?.totals.placements ?? 0) },
                    { label: 'Generations', value: String(analytics?.totals.generations ?? 0) },
                    { label: 'Completed', value: String(analytics?.totals.generations_completed ?? 0) },
                    { label: 'Failed', value: String(analytics?.totals.generations_failed ?? 0) },
                  ].map((m) => (
                    <div key={m.label} className="admin-user-viewer__metric">
                      <MonoMeta size="xs" tone="dense" upper>{m.label}</MonoMeta>
                      <div className="admin-user-viewer__metric-value">{m.value}</div>
                    </div>
                  ))}
                </div>
                <UserAnalyticsExtras extras={analytics?.extras ?? {}} series={analytics?.series ?? []} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
        </div>,
        document.body,
      )}
      {detailModel ? (
        <ModelDetailModal
          model={detailModel}
          currentUserId={currentUserId}
          onClose={() => setDetailModel(null)}
          onModelPatched={(kind, patch) => {
            setDetailModel((prev) => (prev && prev.kind === kind ? { ...prev, ...patch } : prev));
          }}
          onModelDeleted={() => setDetailModel(null)}
        />
      ) : null}
    </>
  );
}
