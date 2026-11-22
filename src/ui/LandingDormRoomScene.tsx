import { Suspense, useEffect, useRef, useState } from 'react';
import {
  acquireLandingSceneLease,
  releaseLandingSceneLease,
} from '../lib/landingSceneLease';
import { buildUChicagoCarouselLayout } from '../lib/uchicagoLandingLayout';
import type { RoomStarterTemplate } from '../lib/roomStarterTemplates';
import { useStore } from '../store';
import { Scene } from '../scene/Scene';
import { MonoMeta, Spinner } from './kit';

interface LandingDormRoomSceneProps {
  template: RoomStarterTemplate;
}

/**
 * Live 3D preview for the landing dorm carousel — same starter payload as New room → UChicago.
 */
export function LandingDormRoomScene({ template }: LandingDormRoomSceneProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const hydrateLayout = useStore((s) => s.hydrateLayout);
  const hydrateRoomSettings = useStore((s) => s.hydrateRoomSettings);
  const resetLayout = useStore((s) => s.resetLayout);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) {
      setReady(false);
      releaseLandingSceneLease('dorm-carousel');
      return;
    }
    if (!acquireLandingSceneLease('dorm-carousel')) return;

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const { plan, environment, items, order } = await buildUChicagoCarouselLayout(template);
        if (cancelled) return;

        resetLayout();
        hydrateLayout(items, order);
        hydrateRoomSettings(environment, plan);
        setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      releaseLandingSceneLease('dorm-carousel');
      setReady(false);
    };
  }, [near, template.id, template, hydrateLayout, hydrateRoomSettings, resetLayout]);

  return (
    <div ref={shellRef} className="landing-dorms-band__scene">
      <MonoMeta size="xs" tone="dense" upper className="landing-dorms-band__scene-tag">
        {template.id}
      </MonoMeta>
      {!ready ? (
        <div className="landing-dorms-band__scene-fallback">
          <Spinner label="Loading 3D preview…" />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="landing-dorms-band__scene-fallback">
              <Spinner label="Loading 3D preview…" />
            </div>
          }
        >
          <Scene readOnly autoRotate />
        </Suspense>
      )}
    </div>
  );
}