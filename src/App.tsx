import { useCallback, useEffect, useState } from 'react';
import { RoomWorkspaceProvider } from './context/RoomWorkspaceContext';
import { useAdminStats } from './hooks/useAdminStats';
import { useAuth } from './hooks/useAuth';
import { createRoomWithGeometry, useRoomLoad } from './hooks/useRoomLayout';
import {
  navigate,
  publicRoomPath,
  sharePath,
  galleryPath,
  timelinePath,
  profilePath,
  useRoute,
} from './hooks/useRoute';
import { supabase } from './lib/supabase';
import { useStore, DEFAULT_ENVIRONMENT } from './store';
import type { FloorPlan } from './lib/floorPlanGeometry';
import { emptyPlan } from './lib/floorPlanGeometry';
import { serializeFloorPlan } from './lib/roomGeometry';
import { LandingPage } from './ui/LandingPage';
import { PitchMadnessPage } from './ui/PitchMadnessPage';
import { AuthPage } from './ui/AuthPage';
import { Dashboard } from './ui/Dashboard';
import { Designer } from './ui/Designer';
import { FloorPlanSetup } from './ui/FloorPlanSetup';
import { RoomPresetPicker } from './ui/RoomPresetPicker';
import { ChecklistPage } from './ui/ChecklistPage';
import { AdminConsole } from './ui/AdminConsole';
import { ContactPage } from './ui/ContactPage';
import { TimelinePage } from './ui/TimelinePage';
import { SharedRoomPage } from './ui/SharedRoomPage';
import { ProfilePage } from './ui/ProfilePage';
import { PublicRoomPage } from './ui/PublicRoomPage';
import { GalleryPage } from './ui/GalleryPage';
import { CreationsPage } from './ui/CreationsPage';
import { AppRailChrome } from './ui/AppRailChrome';
import type { GalleryModel } from './hooks/useGalleryCatalog';
import { recordCatalogDownload, shouldRecordCatalogDownload } from './lib/catalogEngagement';
import type { FurnitureKind } from './furniture/registry';
import { profileInitials } from './lib/userDisplay';
import {
  AppShell,
  type AppShellNavId,
  DisplayHeading,
  MonoMeta,
  Plate,
  Splash,
} from './ui/kit';

type Screen =
  | 'landing'
  | 'pitch-madness'
  | 'contact'
  | 'auth'
  | 'dashboard'
  | 'models'
  | 'floor-plan'
  | 'designer'
  | 'admin'
  | 'ar'
  | 'checklist'
  | 'gallery';

interface FloorPlanDraft {
  name: string;
  mode: 'create' | 'edit';
  initialPlan?: FloorPlan;
}

/** Decorative only — does not encode a real URL. */
function DecorativeQrGraphic() {
  const mod = 4;
  const n = 35;
  const W = n * mod;
  const finderPattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ] as const;
  const filled = new Set<string>();
  const mark = (c: number, r: number) => filled.add(`${c},${r}`);
  const stampFinder = (ox: number, oy: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (finderPattern[r][c]) mark(ox + c, oy + r);
      }
    }
  };
  stampFinder(0, 0);
  stampFinder(n - 7, 0);
  stampFinder(0, n - 7);
  for (let r = 8; r < 27; r++) {
    for (let c = 8; c < 27; c++) {
      if (((r * 31) ^ (c * 17) ^ (r * c)) % 3 === 0) mark(c, r);
    }
  }
  const rects = Array.from(filled, (key) => {
    const [c, r] = key.split(',').map(Number) as [number, number];
    return <rect key={key} x={c * mod} y={r * mod} width={mod} height={mod} fill="#2B2620" />;
  });
  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} aria-hidden>
      <rect width={W} height={W} fill="#ffffff" />
      {rects}
    </svg>
  );
}

function AuthSplash() {
  return <Splash label="Checking session…" />;
}

function ARPage() {
  return (
    <main className="ar-main" style={{ position: 'relative', zIndex: 2, flex: 1 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
        }}
      >
        <DisplayHeading level={4} as="div" style={{ marginBottom: 12 }}>
          AR experience
        </DisplayHeading>
        <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 28, maxWidth: 'var(--measure-body)' }}>
          Scan the QR code to download the Toova app on iPhone and start using AR.
        </MonoMeta>
        <Plate
          height={280}
          placeholder={<DecorativeQrGraphic />}
          topCaption="iPhone only"
        />
      </div>
    </main>
  );
}

export default function App() {
  const { loading, user, logout, refreshProfile, profile, avatarUrl } = useAuth();
  const route = useRoute();
  const [screen, setScreen] = useState<Screen>('landing');
  const [checklistReturn, setChecklistReturn] = useState<Screen>('landing');
  const [pitchScrollToDemos, setPitchScrollToDemos] = useState(false);
  const [timelineScrollToDemos, setTimelineScrollToDemos] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [workspace, setWorkspace] = useState<{ id: string; name: string; isOwner: boolean } | null>(null);
  const [floorPlanDraft, setFloorPlanDraft] = useState<FloorPlanDraft | null>(null);
  const [floorPlanBusy, setFloorPlanBusy] = useState(false);
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [pendingPublicRoom, setPendingPublicRoom] = useState<{ handle: string; roomId: string } | null>(null);
  const [pendingGalleryModel, setPendingGalleryModel] = useState<GalleryModel | null>(null);
  const addItem = useStore((s) => s.addItem);
  const resetLayout = useStore((s) => s.resetLayout);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const { load, loading: layoutLoading } = useRoomLoad();

  const routeIsPublic =
    route.name === 'shared' ||
    route.name === 'profile' ||
    route.name === 'publicRoom' ||
    route.name === 'gallery' ||
    route.name === 'timeline';

  const {
    isAdmin,
    loading: adminStatsLoading,
    error: adminStatsError,
    stats: adminInventoryStats,
    bundles: adminBundlePairs,
    rooms: adminRoomRollups,
    users: adminUserRollups,
    jobs: adminConversionJobs,
    refetch: refetchAdminInventory,
  } = useAdminStats(user?.id);

  useEffect(() => {
    if (!user) {
      if (!routeIsPublic) {
        resetLayout();
        setWorkspace(null);
      }
      if (
        screen !== 'landing'
        && screen !== 'auth'
        && screen !== 'pitch-madness'
        && screen !== 'checklist'
        && screen !== 'contact'
        && !routeIsPublic
      ) {
        setScreen('landing');
      }
    } else if (screen === 'auth') {
      if (pendingShareToken) {
        const token = pendingShareToken;
        setPendingShareToken(null);
        navigate(sharePath(token), true);
        setScreen('landing');
      } else if (pendingPublicRoom) {
        const pending = pendingPublicRoom;
        setPendingPublicRoom(null);
        navigate(publicRoomPath(pending.handle, pending.roomId), true);
        setScreen('landing');
      } else if (pendingGalleryModel) {
        navigate('/');
        setScreen('dashboard');
      } else {
        setScreen('dashboard');
        if (routeIsPublic) navigate('/', true);
      }
    }
  }, [user, resetLayout, screen, routeIsPublic, pendingShareToken, pendingPublicRoom, pendingGalleryModel]);

  useEffect(() => {
    if (screen === 'admin' && !adminStatsLoading && !isAdmin) {
      setScreen('dashboard');
    }
  }, [adminStatsLoading, isAdmin, screen]);

  const exitWorkspace = useCallback(() => {
    resetLayout();
    setWorkspace(null);
    setScreen('dashboard');
  }, [resetLayout]);

  const placePendingGalleryModel = useCallback(
    (model: GalleryModel) => {
      if (model.isBuiltin) {
        addItem(model.kind as FurnitureKind);
      } else if (model.signedUrl) {
        const dims: [number, number, number] = [
          model.width_in,
          model.height_in,
          model.depth_in,
        ];
        addItem('imported', {
          url: model.signedUrl ?? undefined,
          storagePath: model.storagePath || undefined,
          label: model.label,
          size: dims,
          catalogSizeIn: dims,
        });
        if (shouldRecordCatalogDownload(model, user?.id)) {
          void recordCatalogDownload(model.kind).catch(() => {});
        }
      }
      setPendingGalleryModel(null);
    },
    [addItem, user?.id],
  );

  const handlePickExisting = useCallback(
    async (room: { id: string; name: string; isOwner?: boolean }) => {
      resetLayout();
      const data = await load(room.id);
      hydrateLayout(data.items, data.order);
      hydrateRoomSettings(data.environment, data.roomGeometry);
      setWorkspace({ id: room.id, name: room.name, isOwner: room.isOwner !== false });
      setScreen('designer');
      const path = window.location.pathname;
      if (path.startsWith('/r/') || path.startsWith('/u/') || path.startsWith('/gallery')) {
        navigate('/', true);
      }
      if (pendingGalleryModel) {
        placePendingGalleryModel(pendingGalleryModel);
      }
    },
    [
      hydrateLayout,
      hydrateRoomSettings,
      load,
      resetLayout,
      pendingGalleryModel,
      placePendingGalleryModel,
    ],
  );

  const handleStartFloorPlan = useCallback((name: string) => {
    setFloorPlanDraft({ name, mode: 'create' });
    setScreen('dashboard');
  }, []);

  const handleCreateWithPlan = useCallback(
    async (name: string, plan: FloorPlan) => {
      if (!user?.id) return;
      setFloorPlanBusy(true);
      try {
        const room = await createRoomWithGeometry(user.id, name, plan, { ...DEFAULT_ENVIRONMENT });
        resetLayout();
        hydrateLayout([], []);
        hydrateRoomSettings({ ...DEFAULT_ENVIRONMENT }, plan);
        setWorkspace({ id: room.id, name: room.name, isOwner: true });
        setFloorPlanDraft(null);
        setScreen('designer');
      } finally {
        setFloorPlanBusy(false);
      }
    },
    [hydrateLayout, hydrateRoomSettings, resetLayout, user?.id],
  );

  const handleCustomizeOwnPlan = useCallback(() => {
    setFloorPlanDraft((prev) =>
      prev ? { ...prev, mode: 'create', initialPlan: emptyPlan() } : prev,
    );
    setScreen('floor-plan');
  }, []);

  const handleEditFloorPlan = useCallback(() => {
    const geom = useStore.getState().roomGeometry;
    if (!workspace) return;
    setFloorPlanDraft({
      name: workspace.name,
      mode: 'edit',
      initialPlan: structuredClone(geom),
    });
    setScreen('floor-plan');
  }, [workspace]);

  const handleSaveEditedPlan = useCallback(
    async (plan: FloorPlan) => {
      if (!workspace?.id) return;
      setFloorPlanBusy(true);
      try {
        hydrateRoomSettings(useStore.getState().environment, plan);
        await supabase
          .from('rooms')
          .update({ room_geometry: serializeFloorPlan(plan), updated_at: new Date().toISOString() })
          .eq('id', workspace.id);
        setFloorPlanDraft(null);
        setScreen('designer');
      } finally {
        setFloorPlanBusy(false);
      }
    },
    [hydrateRoomSettings, workspace?.id],
  );

  const railActive: AppShellNavId | null =
    screen === 'dashboard' ? 'rooms'
    : screen === 'models' ? 'models'
    : screen === 'admin' ? 'admin'
    : screen === 'ar' ? 'ar'
    : screen === 'gallery' || route.name === 'gallery' ? 'gallery'
    : screen === 'landing' || screen === 'pitch-madness' || screen === 'contact' || route.name === 'timeline' ? 'home'
    : null;

  const showMarketingRail =
    !!user &&
    (screen === 'landing' || screen === 'pitch-madness' || screen === 'contact' || route.name === 'timeline');

  function handleAppNav(nav: AppShellNavId) {
    if (nav === 'home') {
      navigate('/');
      setScreen('landing');
      return;
    }
    if (nav === 'rooms') {
      navigate('/');
      setScreen('dashboard');
      return;
    }
    if (nav === 'models') {
      navigate('/');
      setScreen('models');
      return;
    }
    if (nav === 'gallery') {
      navigate(galleryPath());
      setScreen('gallery');
      return;
    }
    if (nav === 'admin' && isAdmin) {
      // Leave /gallery (and other public paths) so route checks don't trap us.
      navigate('/');
      setScreen('admin');
      return;
    }
    if (nav === 'ar') {
      navigate('/');
      setScreen('ar');
    }
  }

  function handleLogout() {
    void logout();
    setScreen('landing');
  }

  const railChrome = showMarketingRail ? (
    <AppRailChrome
      active={railActive}
      showAdmin={isAdmin}
      profileInitials={profileInitials(profile, user?.email)}
      onNavigate={handleAppNav}
      onLogout={handleLogout}
      onProfile={
        profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
      }
    />
  ) : null;

  const openChecklistFrom = useCallback((from: Screen) => {
    setChecklistReturn(from);
    setScreen('checklist');
  }, []);

  const landingCallbacks = {
    loggedIn: !!user,
    onGoDashboard: () => setScreen('dashboard'),
    onGetStarted: () => {
      if (user) { setScreen('dashboard'); return; }
      setAuthMode('signup');
      setScreen('auth');
    },
    onLogin: () => {
      if (user) { setScreen('dashboard'); return; }
      setAuthMode('signin');
      setScreen('auth');
    },
    onAdmin: isAdmin ? () => setScreen('admin') : undefined,
  };

  const siteFooterNav = {
    onContact: () => setScreen('contact'),
    onPitchMadness: () => {
      setPitchScrollToDemos(false);
      setScreen('pitch-madness');
    },
  };

  // Auth overlay for share-link / public-room CTAs (URL may still be /r/… or /u/…)
  if (screen === 'auth' && !user) {
    if (loading) return <AuthSplash />;
    return (
      <AuthPage
        initialMode={authMode}
        onContact={siteFooterNav.onContact}
        onPitchMadness={siteFooterNav.onPitchMadness}
        onBack={() => {
          if (pendingShareToken) {
            navigate(sharePath(pendingShareToken), true);
            setScreen('landing');
            return;
          }
          if (pendingPublicRoom) {
            navigate(publicRoomPath(pendingPublicRoom.handle, pendingPublicRoom.roomId), true);
            setScreen('landing');
            return;
          }
          setScreen('landing');
          if (routeIsPublic) navigate('/', true);
        }}
      />
    );
  }

  if (route.name === 'shared') {
    return (
      <SharedRoomPage
        token={route.token}
        userId={user?.id ?? null}
        authLoading={loading}
        onRequestAuth={(mode) => {
          setPendingShareToken(route.token);
          setAuthMode(mode);
          setScreen('auth');
        }}
        onOpenRoom={handlePickExisting}
        onGoHome={() => {
          navigate('/');
          setScreen(user ? 'dashboard' : 'landing');
        }}
      />
    );
  }

  if (route.name === 'publicRoom') {
    return (
      <PublicRoomPage
        handle={route.handle}
        roomId={route.roomId}
        userId={user?.id ?? null}
        authLoading={loading}
        onRequestAuth={(mode) => {
          setPendingPublicRoom({ handle: route.handle, roomId: route.roomId });
          setAuthMode(mode);
          setScreen('auth');
        }}
        onOpenRoom={handlePickExisting}
        onGoHome={() => {
          navigate('/');
          setScreen(user ? 'dashboard' : 'landing');
        }}
      />
    );
  }

  if (route.name === 'profile') {
    return (
      <>
        <div className={user ? 'kit-app-rail-pad' : undefined}>
          <ProfilePage
            handle={route.handle}
            viewerUserId={user?.id ?? null}
            authLoading={loading}
            onRefreshAuthProfile={refreshProfile}
            onContact={siteFooterNav.onContact}
            onPitchMadness={siteFooterNav.onPitchMadness}
            onAdmin={landingCallbacks.onAdmin}
            onGoHome={() => {
              navigate('/');
              setScreen(user ? 'dashboard' : 'landing');
            }}
          />
        </div>
        {user ? (
          <AppRailChrome
            active={null}
            showAdmin={isAdmin}
            profileInitials={profileInitials(profile, user.email)}
            onNavigate={handleAppNav}
            onLogout={handleLogout}
            onProfile={
              profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
            }
          />
        ) : null}
      </>
    );
  }

  // App destinations before /gallery URL matching — rail nav must not be trapped.
  if (screen === 'admin' && user && isAdmin) {
    return (
      <>
        <div className="kit-app-rail-pad">
          <AdminConsole
            stats={adminInventoryStats}
            bundles={adminBundlePairs}
            rooms={adminRoomRollups}
            users={adminUserRollups}
            jobs={adminConversionJobs}
            loading={adminStatsLoading}
            error={adminStatsError}
            onRefresh={refetchAdminInventory}
          />
        </div>
        <AppRailChrome
          active="admin"
          showAdmin
          profileInitials={profileInitials(profile, user.email)}
          onNavigate={handleAppNav}
          onLogout={handleLogout}
          onProfile={
            profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
          }
        />
      </>
    );
  }

  if (screen === 'ar' && user) {
    return (
      <AppShell
        active="ar"
        title="AR"
        meta="iPhone only"
        showAdmin={isAdmin}
        profileInitials={profileInitials(profile, user.email)}
        onNavigate={handleAppNav}
        onLogout={handleLogout}
        onContact={siteFooterNav.onContact}
        onPitchMadness={siteFooterNav.onPitchMadness}
        feedbackEmail={user.email ?? ''}
        feedbackUserId={user.id}
        onProfile={
          profile?.handle ? () => navigate(profilePath(profile.handle)) : undefined
        }
      >
        <ARPage />
      </AppShell>
    );
  }

  if (route.name === 'gallery' || screen === 'gallery') {
    return (
      <GalleryPage
        loggedIn={!!user}
        showAdmin={isAdmin}
        onGoHome={() => {
          navigate('/');
          setScreen(user ? 'dashboard' : 'landing');
        }}
        onRequestAuth={(mode) => {
          setAuthMode(mode);
          setScreen('auth');
        }}
        onUseInRoom={(model) => {
          setPendingGalleryModel(model);
          if (!user) return;
          navigate('/');
          setScreen('dashboard');
        }}
        onNavigate={handleAppNav}
        onLogout={user ? handleLogout : undefined}
        {...siteFooterNav}
      />
    );
  }

  if (route.name === 'timeline') {
    return (
      <>
        <div className={showMarketingRail ? 'kit-app-rail-pad' : undefined}>
          <TimelinePage
            {...landingCallbacks}
            onContact={siteFooterNav.onContact}
            onPitchMadness={siteFooterNav.onPitchMadness}
            scrollToDemosOnMount={timelineScrollToDemos}
            onDemosScrolled={() => setTimelineScrollToDemos(false)}
          />
        </div>
        {railChrome}
      </>
    );
  }

  if (screen === 'checklist') {
    const backTarget =
      checklistReturn === 'designer' && workspace && user
        ? 'designer'
        : checklistReturn === 'dashboard' && user
          ? 'dashboard'
          : checklistReturn === 'pitch-madness'
            ? 'pitch-madness'
            : 'landing';

    return (
      <ChecklistPage
        onBack={() => setScreen(backTarget)}
        isAdmin={isAdmin}
        canPlace={checklistReturn === 'designer' && Boolean(workspace && user)}
        onContact={siteFooterNav.onContact}
        onPitchMadness={siteFooterNav.onPitchMadness}
        onAdmin={landingCallbacks.onAdmin}
        onDesign={() => {
          if (user) {
            if (workspace) setScreen('designer');
            else setScreen('dashboard');
            return;
          }
          setAuthMode('signup');
          setScreen('auth');
        }}
      />
    );
  }

  if (screen === 'contact') {
    return (
      <>
        <div className={showMarketingRail ? 'kit-app-rail-pad' : undefined}>
          <ContactPage
            {...landingCallbacks}
            onGoHome={() => setScreen('landing')}
            onPitchMadness={() => {
              setPitchScrollToDemos(false);
              setScreen('pitch-madness');
            }}
          />
        </div>
        {railChrome}
      </>
    );
  }

  if (screen === 'landing') {
    return (
      <>
        <div className={showMarketingRail ? 'kit-app-rail-pad' : undefined}>
          <LandingPage
            {...landingCallbacks}
            onOpenChecklist={() => openChecklistFrom('landing')}
            onContact={() => setScreen('contact')}
            onPitchMadness={() => {
              setPitchScrollToDemos(false);
              setScreen('pitch-madness');
            }}
            onWatchDemo={() => {
              setTimelineScrollToDemos(true);
              navigate(timelinePath());
            }}
          />
        </div>
        {railChrome}
      </>
    );
  }

  if (screen === 'pitch-madness') {
    return (
      <>
        <div className={showMarketingRail ? 'kit-app-rail-pad' : undefined}>
          <PitchMadnessPage
            {...landingCallbacks}
            onGoHome={() => setScreen('landing')}
            onContact={() => setScreen('contact')}
            scrollToDemosOnMount={pitchScrollToDemos}
            onDemosScrolled={() => setPitchScrollToDemos(false)}
          />
        </div>
        {railChrome}
      </>
    );
  }

  if (loading && !user) return <AuthSplash />;

  if (screen === 'designer' && workspace && user) {
    return (
      <RoomWorkspaceProvider value={{ workspace, exitWorkspace }}>
        <Designer
          onBack={exitWorkspace}
          onEditFloorPlan={handleEditFloorPlan}
          onOpenChecklist={() => openChecklistFrom('designer')}
          isAdmin={isAdmin}
        />
      </RoomWorkspaceProvider>
    );
  }

  if (screen === 'floor-plan' && floorPlanDraft && user) {
    const items = Object.values(useStore.getState().items);
    return (
      <FloorPlanSetup
        roomName={floorPlanDraft.name}
        mode={floorPlanDraft.mode}
        initialPlan={floorPlanDraft.initialPlan}
        furnitureItems={floorPlanDraft.mode === 'edit' ? items : undefined}
        continuing={floorPlanBusy}
        onCancel={() => {
          if (floorPlanDraft.mode === 'create') {
            // Return to dashboard with draft so the preset modal reopens.
            setFloorPlanDraft({ name: floorPlanDraft.name, mode: 'create' });
            setScreen('dashboard');
            return;
          }
          setFloorPlanDraft(null);
          setScreen('designer');
        }}
        onContinue={async (plan) => {
          if (floorPlanDraft.mode === 'create') {
            await handleCreateWithPlan(floorPlanDraft.name, plan);
          } else {
            await handleSaveEditedPlan(plan);
          }
        }}
      />
    );
  }

  if (screen === 'models' && user) {
    return (
      <CreationsPage
        user={user}
        profile={profile}
        showAdmin={isAdmin}
        onNavigate={handleAppNav}
        onLogout={handleLogout}
        {...siteFooterNav}
        onUseInRoom={(model) => {
          setPendingGalleryModel(model);
          navigate('/');
          setScreen('dashboard');
        }}
      />
    );
  }

  if (user) {
    const showPresetPicker =
      screen === 'dashboard' && floorPlanDraft?.mode === 'create' && !floorPlanDraft.initialPlan;
    return (
      <>
        <Dashboard
          user={user}
          profile={profile}
          avatarUrl={avatarUrl}
          loadingLayout={layoutLoading}
          showAdmin={isAdmin}
          onPickExisting={handlePickExisting}
          onStartFloorPlan={handleStartFloorPlan}
          onNavigate={handleAppNav}
          onLogout={handleLogout}
          {...siteFooterNav}
        />
        <RoomPresetPicker
          open={!!showPresetPicker}
          creating={floorPlanBusy}
          onClose={() => setFloorPlanDraft(null)}
          onSelectPreset={async (plan) => {
            if (!floorPlanDraft) return;
            await handleCreateWithPlan(floorPlanDraft.name, plan);
          }}
          onCustomize={handleCustomizeOwnPlan}
        />
      </>
    );
  }

  return <AuthSplash />;
}
