import { Suspense, useEffect, useRef, useState } from 'react';
import { loadPublicRoomLayout } from '../hooks/useRoomLayout';
import { MARKETING_SHOWCASE } from '../lib/marketingShowcase';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { MonoMeta, Spinner } from './kit';

/**
 * Landing hero: live read-only render of a public room (Woodlawn).
 * Hydrates the global store while mounted; resets on unmount.
 *
 * Models are repo-static copies (see MARKETING_SHOWCASE.roomAssetMap) so this
 * does not pull GLBs from Supabase. Load is deferred until the plate is near
 * the viewport so bounce traffic never downloads the room.
 */
export function HeroTurntable() {
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);
  const plateRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = plateRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    resetLayout();

    void (async () => {
      try {
        const data = await loadPublicRoomLayout(
          MARKETING_SHOWCASE.room.handle,
          MARKETING_SHOWCASE.room.roomId,
          { assetUrlOverrides: MARKETING_SHOWCASE.roomAssetMap },
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
  }, [near, hydrateLayout, hydrateRoomSettings, resetLayout]);

  return (
    <div ref={plateRef} className="landing-hero-scene">
      {error ? (
        <div className="landing-live-fallback">
          <MonoMeta size="sm" tone="dense">
            Live room unavailable
          </MonoMeta>
        </div>
      ) : !ready ? (
        <div className="landing-live-fallback">
          <Spinner label="Loading live room…" />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="landing-live-fallback">
              <Spinner label="Loading live room…" />
            </div>
          }
        >
          <Scene readOnly autoRotate />
        </Suspense>
      )}
    </div>
  );
}
