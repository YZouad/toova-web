import { useMemo } from 'react';
import { indoorHorizonFill, sampleSun } from '../lib/environment';
import { apartmentModeFor, roomAtFloorPoint } from '../lib/apartmentRooms';
import { openingWorldPlacement, planBounds } from '../lib/roomGeometry';
import { resolveRenderQuality } from '../lib/renderQuality';
import { useStore } from '../store';
import { useApartmentTransitionPhase } from './ApartmentTransition';
import { WindowFillLight } from './Openings';

/**
 * Stable per-window fill lights for apartment mode. Mounted once outside the
 * rest/focus shells so focusing a room never changes the scene light count
 * (which would recompile every StandardMaterial).
 */
export function ApartmentWindowLights() {
  const fullGeom = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const mode = apartmentModeFor(fullGeom, focusedRoomId);
  const phase = useApartmentTransitionPhase();
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const quality = useStore((s) => s.visual.quality);
  const windowShadows = resolveRenderQuality(quality).windowShadows;

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, planBounds(fullGeom)),
    [timeOfDay, orientationDeg, fullGeom],
  );

  const baseIntensity = useMemo(() => {
    const fill = indoorHorizonFill(timeOfDay, orientationDeg);
    const base = sun.ambient * exposure * 0.45 + sun.intensity * exposure * 0.18;
    return (base + fill * 0.12) * 1.15;
  }, [sun, timeOfDay, orientationDeg, exposure]);

  const windows = useMemo(
    () =>
      fullGeom.openings
        .filter((o) => o.kind === 'window')
        .map((win) => {
          const placement = openingWorldPlacement(fullGeom, win);
          if (!placement) return null;
          const room = roomAtFloorPoint(fullGeom, placement.cx, placement.cz);
          return { win, placement, roomId: room?.id ?? null };
        })
        .filter((w): w is NonNullable<typeof w> => w != null),
    [fullGeom],
  );

  const settledFocused = mode === 'focused' && phase === 'focused';

  return (
    <group>
      {windows.map(({ win, placement, roomId }, i) => {
        const curtains = win.curtains;
        const curtainMul = curtains ? 0.25 + curtains.openness * 0.75 : 1;
        const inFocus = settledFocused && roomId != null && roomId === focusedRoomId;
        const intensity = inFocus ? baseIntensity * curtainMul : 0;
        return (
          <WindowFillLight
            key={win.id}
            placement={placement}
            color={sun.glassTint}
            intensity={intensity}
            castShadows={inFocus && windowShadows && i === 0}
          />
        );
      })}
    </group>
  );
}
