import { useMemo } from 'react';
import * as THREE from 'three';
import { sampleSun, indoorHorizonFill } from '../lib/environment';
import {
  allWallSegments,
  holesForWallSegment,
  planBounds,
  type RoomGeometry,
} from '../lib/roomGeometry';
import { ROOM } from '../units';
import { useStore } from '../store';
import { Wall } from './Wall';
import { FloorMesh, CeilingMesh, ShadowRoof, RecessedLights } from './FloorCeiling';
import { Baseboards } from './Baseboards';
import { DoorAssemblies, WindowAssemblies } from './Openings';
import { resolveRenderQuality } from '../lib/renderQuality';

/** Pick wall ids to hide for open-front / top-down cutaways. */
function cutAwayWallIds(geom: RoomGeometry, mode: string): Set<string> {
  if (mode === 'orbit' || mode === 'topDown') return new Set();
  const segments = allWallSegments(geom);
  if (segments.length === 0) return new Set();

  // openFront: hide the wall whose outward faces the default camera (+X/+Z quadrant).
  const camDir = new THREE.Vector2(0.9, 1.1).normalize();
  let bestId = segments[0]!.wall.id;
  let bestDot = -Infinity;
  for (const seg of segments) {
    const outward = new THREE.Vector2(seg.outward[0], seg.outward[1]);
    const dot = outward.dot(camDir);
    if (dot > bestDot) {
      bestDot = dot;
      bestId = seg.wall.id;
    }
  }
  return new Set([bestId]);
}

export function Room() {
  const geom = useStore((s) => s.roomGeometry);
  const appearance = useStore((s) => s.environment.appearance);
  const cutaway = useStore((s) => s.visual.cutaway);

  const H = geom.height;
  const segments = useMemo(() => allWallSegments(geom), [geom]);
  const hidden = useMemo(() => cutAwayWallIds(geom, cutaway), [geom, cutaway]);

  // Ceiling + roof slab are always on (except top-down cutaway for the finish plane).
  const showCeiling = cutaway !== 'topDown';

  return (
    <group>
      <FloorMesh geom={geom} preset={appearance.floorPreset} />
      <CeilingMesh
        geom={geom}
        preset={appearance.ceilingPreset}
        visible={showCeiling}
      />
      <ShadowRoof
        geom={geom}
        enabled={cutaway !== 'topDown'}
        preset={appearance.ceilingPreset}
      />

      {segments.map((seg) => {
        const renderLength = seg.length + ROOM.wallThickness;
        const holes = holesForWallSegment(geom, seg);
        return (
          <Wall
            key={seg.wall.id}
            wallId={seg.wall.id}
            length={renderLength}
            height={H}
            outwardNormal={[seg.outward[0], 0, seg.outward[1]]}
            innerFaceCenter={seg.innerFaceCenter}
            rotationY={seg.rotationY}
            holes={holes}
            cutAway={hidden.has(seg.wall.id)}
            color={appearance.wallColor}
          />
        );
      })}

      <Baseboards
        geom={geom}
        trimPreset={appearance.trimPreset}
        visible={appearance.showBaseboards}
      />
      <DoorAssemblies geom={geom} trimPreset={appearance.trimPreset} />
      <WindowLightAndGlass geom={geom} trimPreset={appearance.trimPreset} />
      <RecessedLights geom={geom} enabled={appearance.recessedLights} />
    </group>
  );
}

function WindowLightAndGlass({
  geom,
  trimPreset,
}: {
  geom: RoomGeometry;
  trimPreset: import('../lib/roomMaterials').MaterialPresetId;
}) {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const quality = useStore((s) => s.visual.quality);
  const windowShadows = resolveRenderQuality(quality).windowShadows;

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, planBounds(geom)),
    [timeOfDay, orientationDeg, geom],
  );

  const fillIntensity = useMemo(() => {
    const fill = indoorHorizonFill(timeOfDay, orientationDeg);
    const base = sun.ambient * exposure * 0.45 + sun.intensity * exposure * 0.18;
    return (base + fill * 0.12) * 1.15;
  }, [sun, timeOfDay, orientationDeg, exposure]);

  return (
    <WindowAssemblies
      geom={geom}
      trimPreset={trimPreset}
      glassTint={sun.glassTint}
      fillIntensity={fillIntensity}
      castWindowShadows={windowShadows}
    />
  );
}

// Re-export for tests / tooling
export { floorShapesFromGeometry } from './FloorCeiling';
