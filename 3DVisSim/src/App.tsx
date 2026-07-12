import { useCallback, useEffect, useState } from 'react';
import { RoomWorkspaceProvider, useRoomWorkspace } from './context/RoomWorkspaceContext';
import { useAdminStats } from './hooks/useAdminStats';
import { useAuth } from './hooks/useAuth';
import { useRoomLoad } from './hooks/useRoomLayout';
import { supabase } from './lib/supabase';
import { useStore } from './store';
import { Scene } from './scene/Scene';
import { Sidebar } from './ui/Sidebar';
import { InspectorPanel } from './ui/InspectorPanel';
import { IntroPage } from './ui/IntroPage';
import { LoginPage } from './ui/LoginPage';
import { ModePicker } from './ui/ModePicker';
import { AdminPortal } from './ui/AdminPortal';
import { RoomPicker } from './ui/RoomPicker';
import { WelcomePage } from './ui/WelcomePage';
import { IntroBackButton } from './ui/IntroBackButton';

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
      if (((r * 31) ^ (c * 17) ^ (r * c)) % 3 === 0) {
        mark(c, r);
      }
    }
  }

  const rects = Array.from(filled, (key) => {
    const [c, r] = key.split(',').map(Number) as [number, number];
    return (
      <rect key={key} x={c * mod} y={r * mod} width={mod} height={mod} fill="#111827" />
    );
  });

  return (
    <svg
      className="ar-qr-graphic"
      width={W}
      height={W}
      viewBox={`0 0 ${W} ${W}`}
      aria-hidden={true}
    >
      <rect width={W} height={W} fill="#ffffff" />
      {rects}
    </svg>
  );
}

function ARInfoCard({ onBack }: { onBack: () => void }) {
  return (
    <div className="onboarding-page">
      <IntroBackButton onBack={onBack} />
      <header className="onboarding-header">
        <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-logo-img" />
      </header>
      <main className="onboarding-main onboarding-main--narrow">
        <div className="onboarding-card onboarding-ar-centered onboarding-card--compact">
          <h1 className="onboarding-title">AR experience</h1>
          <p>
            Scan the QR code to download the Toova app on iPhone and start using AR.
          </p>
          <div className="ar-qr-frame">
            <DecorativeQrGraphic />
          </div>
          <p className="ar-qr-caption">iPhone only</p>
        </div>
      </main>
    </div>
  );
}

function AuthSplash() {
  return (
    <div className="onboarding-page onboarding-page--splash">
      <div className="onboarding-card onboarding-splash-inner">
        <p className="onboarding-splash-label">Checking session…</p>
      </div>
    </div>
  );
}

function PlannerChrome() {
  const { exitWorkspace } = useRoomWorkspace();

  return (
    <div className="app">
      <Sidebar />
      <div className="canvas-wrap">
        <Scene />
        <div className="hint-overlay">
          Left-drag: rotate camera &nbsp;·&nbsp; Right-drag: pan &nbsp;·&nbsp; Scroll: zoom
          <br />
          Click item to select &nbsp;·&nbsp; Drag to move &nbsp;·&nbsp; R / Shift+R rotate &nbsp;·&nbsp;
          Delete to remove
          <br />
          <button type="button" className="hint-switch-room" onClick={() => exitWorkspace()}>
            Switch room
          </button>
        </div>
      </div>
      <InspectorPanel />
    </div>
  );
}

export default function App() {
  const { loading, user } = useAuth();
  const [showWelcome, setShowWelcome] = useState(true);
  const [mode, setMode] = useState<'ar' | '3d' | null>(null);
  const [started, setStarted] = useState(false);
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const resetLayout = useStore((s) => s.resetLayout);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const { load, loading: layoutLoading } = useRoomLoad();

  useEffect(() => {
    if (!user) {
      resetLayout();
      setWorkspace(null);
      setStarted(false);
      setShowWelcome(true);
      setMode(null);
      setShowAdmin(false);
    }
  }, [user, resetLayout]);

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
    if (showAdmin && !adminStatsLoading && !isAdmin) {
      setShowAdmin(false);
    }
  }, [adminStatsLoading, isAdmin, showAdmin]);

  const adminFullscreenOpen = !workspace && showAdmin && isAdmin;

  useEffect(() => {
    const cls = 'admin-dashboard-open';
    if (adminFullscreenOpen) {
      document.documentElement.classList.add(cls);
      return () => {
        document.documentElement.classList.remove(cls);
      };
    }
    return undefined;
  }, [adminFullscreenOpen]);

  const exitWorkspace = useCallback(() => {
    resetLayout();
    setWorkspace(null);
    setStarted(false);
  }, [resetLayout]);

  const handlePickExisting = useCallback(
    async (room: { id: string; name: string }) => {
      resetLayout();
      const data = await load(room.id);
      hydrateLayout(data.items, data.order);
      const { data: row, error } = await supabase
        .from('rooms')
        .select('name')
        .eq('id', room.id)
        .maybeSingle();
      const name =
        !error && row?.name != null && String(row.name).trim() !== ''
          ? String(row.name)
          : room.name;
      setWorkspace({ id: room.id, name });
    },
    [hydrateLayout, load, resetLayout],
  );

  const handleCreate = useCallback(
    async (name: string) => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('rooms')
        .insert({ user_id: user.id, name })
        .select('id,name')
        .single();

      if (error) throw new Error(error.message);
      resetLayout();
      hydrateLayout([], []);
      setWorkspace({ id: data.id, name: data.name ?? name });
    },
    [hydrateLayout, resetLayout, user?.id],
  );

  if (showWelcome) {
    return <WelcomePage onGetStarted={() => setShowWelcome(false)} />;
  }

  if (loading) return <AuthSplash />;
  if (!user) return <LoginPage onBack={() => setShowWelcome(true)} />;

  if (!mode) {
    return (
      <ModePicker
        onSelectMode={setMode}
        onBack={() => void supabase.auth.signOut()}
      />
    );
  }

  if (mode === 'ar') return <ARInfoCard onBack={() => setMode(null)} />;

  if (!workspace && showAdmin && isAdmin) {
    return (
      <AdminPortal
        stats={adminInventoryStats}
        bundles={adminBundlePairs}
        rooms={adminRoomRollups}
        users={adminUserRollups}
        loading={adminStatsLoading}
        error={adminStatsError}
        onExit={() => setShowAdmin(false)}
        onRefresh={refetchAdminInventory}
      />
    );
  }
  if (!workspace) {
    return (
      <div className="intro room-picker-shell">
        {isAdmin && !adminStatsLoading ? (
          <div className="admin-room-picker-banner">
            <button
              type="button"
              className="intro-start admin-dash-open"
              onClick={() => setShowAdmin(true)}
            >
              Open admin dashboard
            </button>
          </div>
        ) : null}
        <RoomPicker
          user={user}
          loadingLayout={layoutLoading}
          onPickExisting={handlePickExisting}
          onCreate={handleCreate}
          onBack={() => setMode(null)}
        />
      </div>
    );
  }

  return (
    <RoomWorkspaceProvider
      value={{
        workspace,
        exitWorkspace,
      }}
    >
      {!started ? (
        <IntroPage
          roomLabel={workspace.name}
          onSwitchRooms={() => exitWorkspace()}
          onStart={() => setStarted(true)}
          onBack={() => exitWorkspace()}
        />
      ) : (
        <PlannerChrome />
      )}
    </RoomWorkspaceProvider>
  );
}
