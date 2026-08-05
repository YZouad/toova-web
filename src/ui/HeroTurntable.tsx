import { Suspense, useEffect, useState } from 'react';
import { loadPublicRoomLayout } from '../hooks/useRoomLayout';
import { MARKETING_SHOWCASE } from '../lib/marketingShowcase';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { MonoMeta, Spinner } from './kit';

/**
 * Landing hero: live read-only render of a public room (Woodlawn).
 * Hydrates the global store while mounted; resets on unmount.
 */
export function HeroTurntable() {
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    resetLayout();

    void (async () => {
      try {
        const data = await loadPublicRoomLayout(
          MARKETING_SHOWCASE.room.handle,
          MARKETING_SHOWCASE.room.roomId,
        );
        if (cancelled) return;
        hydrateLayout(data.items, data.order);
        hydrateRoomSettings(data.environment, data.roomGeometry);
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load room');
      }
    })();

    return () => {
      cancelled = true;
      resetLayout();
    };
  }, [hydrateLayout, hydrateRoomSettings, resetLayout]);

  if (error) {
    return (
      <div className="landing-live-fallback">
        <MonoMeta size="sm" tone="dense">
          Live room unavailable
        </MonoMeta>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="landing-live-fallback">
        <Spinner label="Loading live room…" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="landing-live-fallback">
          <Spinner label="Loading live room…" />
        </div>
      }
    >
      <div className="landing-hero-scene">
        <Scene readOnly autoRotate />
      </div>
    </Suspense>
  );
}
