import { useCallback, useEffect, useState } from 'react';
import { RoomWorkspaceProvider } from './context/RoomWorkspaceContext';
import { useAdminStats } from './hooks/useAdminStats';
import { useAuth } from './hooks/useAuth';
import { createRoomWithGeometry, useRoomLoad } from './hooks/useRoomLayout';
import { supabase } from './lib/supabase';
import { useStore, DEFAULT_ENVIRONMENT } from './store';
import type { FloorPlan } from './lib/floorPlanGeometry';
import { serializeFloorPlan } from './lib/roomGeometry';
import { LandingPage } from './ui/LandingPage';
import { PitchMadnessPage } from './ui/PitchMadnessPage';
import { AuthPage } from './ui/AuthPage';
import { Dashboard } from './ui/Dashboard';
import { Designer } from './ui/Designer';
import { FloorPlanSetup } from './ui/FloorPlanSetup';
import { AdminConsole } from './ui/AdminConsole';
import { Dock, type DockNav } from './ui/Dock';

type Screen = 'landing' | 'pitch-madness' | 'auth' | 'dashboard' | 'floor-plan' | 'designer' | 'admin' | 'ar';

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
  return (
    <div className="splash-page">
      <div className="splash-inner">Checking session…</div>
    </div>
  );
}

function ARPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="ar-page">
      <header className="dashboard-topbar">
        <div className="dashboard-topbar-inner">
          <button type="button" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
            <div className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>t</div>
            <span className="tv-logo-text" style={{ fontSize: 22 }}>Toova</span>
          </button>
        </div>
      </header>
      <main className="ar-main">
        <div className="ar-card">
          <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 28, margin: '0 0 12px' }}>AR experience</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
            Scan the QR code to download the Toova app on iPhone and start using AR.
          </p>
          <div className="ar-qr-frame">
            <DecorativeQrGraphic />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>iPhone only</p>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { loading, user, logout } = useAuth();
  const [screen, setScreen] = useState<Screen>('landing');
  const [pitchScrollToDemos, setPitchScrollToDemos] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [floorPlanDraft, setFloorPlanDraft] = useState<FloorPlanDraft | null>(null);
  const [floorPlanBusy, setFloorPlanBusy] = useState(false);
  const resetLayout = useStore((s) => s.resetLayout);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const { load, loading: layoutLoading } = useRoomLoad();

  const {
    isAdmin,
    loading: adminStatsLoading,
    error: adminStatsError,
    stats: adminInventoryStats,
    bundles: adminBundlePairs,
    rooms: adminRoomRollups,
    users: adminUserRollups,
    refetch: refetchAdminInventory,
  } = useAdminStats(user?.id);

  useEffect(() => {
    if (!user) {
      resetLayout();
      setWorkspace(null);
      if (screen !== 'landing' && screen !== 'auth' && screen !== 'pitch-madness') {
        setScreen('landing');
      }
    } else if (screen === 'auth') {
      setScreen('dashboard');
    }
  }, [user, resetLayout, screen]);

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

  const handlePickExisting = useCallback(
    async (room: { id: string; name: string }) => {
      resetLayout();
      const data = await load(room.id);
      hydrateLayout(data.items, data.order);
      hydrateRoomSettings(data.environment, data.roomGeometry);
      setWorkspace({ id: room.id, name: room.name });
      setScreen('designer');
    },
    [hydrateLayout, hydrateRoomSettings, load, resetLayout],
  );

  const handleStartFloorPlan = useCallback((name: string) => {
    setFloorPlanDraft({ name, mode: 'create' });
    setScreen('floor-plan');
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
        setWorkspace({ id: room.id, name: room.name });
        setFloorPlanDraft(null);
        setScreen('designer');
      } finally {
        setFloorPlanBusy(false);
      }
    },
    [hydrateLayout, hydrateRoomSettings, resetLayout, user?.id],
  );

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

  const dockActive: DockNav | null =
    screen === 'dashboard' ? 'rooms'
    : screen === 'admin' ? 'admin'
    : screen === 'ar' ? 'ar'
    : screen === 'landing' || screen === 'pitch-madness' ? 'home'
    : null;

  const showDock = user && (screen === 'landing' || screen === 'pitch-madness' || screen === 'dashboard' || screen === 'admin' || screen === 'ar');

  function handleDockNav(nav: DockNav) {
    if (nav === 'home') {
      setScreen('landing');
      return;
    }
    if (nav === 'rooms') setScreen('dashboard');
    if (nav === 'admin' && isAdmin) setScreen('admin');
    if (nav === 'ar') setScreen('ar');
  }

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

  if (screen === 'landing') {
    return (
      <>
        <LandingPage
          {...landingCallbacks}
          onPitchMadness={() => {
            setPitchScrollToDemos(false);
            setScreen('pitch-madness');
          }}
          onWatchDemo={() => {
            setPitchScrollToDemos(true);
            setScreen('pitch-madness');
          }}
        />
        {showDock ? (
          <Dock active={dockActive} showAdmin={isAdmin} onNavigate={handleDockNav} onLogout={() => { void logout(); setScreen('landing'); }} />
        ) : null}
      </>
    );
  }

  if (screen === 'pitch-madness') {
    return (
      <>
        <PitchMadnessPage
          {...landingCallbacks}
          onGoHome={() => setScreen('landing')}
          scrollToDemosOnMount={pitchScrollToDemos}
          onDemosScrolled={() => setPitchScrollToDemos(false)}
        />
        {showDock ? (
          <Dock active={dockActive} showAdmin={isAdmin} onNavigate={handleDockNav} onLogout={() => { void logout(); setScreen('landing'); }} />
        ) : null}
      </>
    );
  }

  if (screen === 'auth' && !user) {
    if (loading) return <AuthSplash />;
    return (
      <AuthPage
        initialMode={authMode}
        onBack={() => setScreen('landing')}
      />
    );
  }

  if (loading && !user) return <AuthSplash />;

  if (screen === 'admin' && isAdmin) {
    return (
      <>
        <AdminConsole
          stats={adminInventoryStats}
          bundles={adminBundlePairs}
          rooms={adminRoomRollups}
          users={adminUserRollups}
          loading={adminStatsLoading}
          error={adminStatsError}
          onExit={() => setScreen('dashboard')}
          onRefresh={refetchAdminInventory}
        />
        {showDock ? (
          <Dock active={dockActive} showAdmin={isAdmin} onNavigate={handleDockNav} onLogout={() => { void logout(); setScreen('landing'); }} />
        ) : null}
      </>
    );
  }

  if (screen === 'ar' && user) {
    return (
      <>
        <ARPage onBack={() => setScreen('dashboard')} />
        {showDock ? (
          <Dock active={dockActive} showAdmin={isAdmin} onNavigate={handleDockNav} onLogout={() => { void logout(); setScreen('landing'); }} />
        ) : null}
      </>
    );
  }

  if (screen === 'designer' && workspace && user) {
    return (
      <RoomWorkspaceProvider value={{ workspace, exitWorkspace }}>
        <Designer onBack={exitWorkspace} onEditFloorPlan={handleEditFloorPlan} />
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
          setFloorPlanDraft(null);
          setScreen(floorPlanDraft.mode === 'create' ? 'dashboard' : 'designer');
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

  if (user) {
    return (
      <>
        <Dashboard
          user={user}
          loadingLayout={layoutLoading}
          onPickExisting={handlePickExisting}
          onStartFloorPlan={handleStartFloorPlan}
          onGoLanding={() => { void logout(); setScreen('landing'); }}
        />
        {showDock ? (
          <Dock active={dockActive} showAdmin={isAdmin} onNavigate={handleDockNav} onLogout={() => { void logout(); setScreen('landing'); }} />
        ) : null}
      </>
    );
  }

  return <AuthSplash />;
}
