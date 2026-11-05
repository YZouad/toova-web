import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sampleSun, indoorHorizonFill } from '../lib/environment';
import {
  allWallSegments,
  holesForWallSegment,
  planBounds,
  type RoomGeometry,
} from '../lib/roomGeometry';
import {
  activeGeometryFor,
  apartmentModeFor,
  apartmentRoomById,
  planForFace,
} from '../lib/apartmentRooms';
import { ROOM } from '../units';
import { useStore } from '../store';
import { Wall } from './Wall';
import { FloorMesh, CeilingMesh, ShadowRoof, RecessedLights } from './FloorCeiling';
import { Baseboards } from './Baseboards';
import { DoorAssemblies, WindowAssemblies } from './Openings';
import { resolveRenderQuality } from '../lib/renderQuality';
import { wallPaintColor } from '../lib/roomAppearance';
import { OrbitCutawaySync } from './useOrbitFade';
import { ApartmentTransition } from './ApartmentTransition';

/** Pick wall ids to hide for open-front / top-down cutaways. */
function cutAwayWallIds(geom: RoomGeometry, mode: string): Set<string> {
  if (mode === 'orbit' || mode === 'topDown') return new Set();
  const segments = allWallSegments(geom);
  if (segments.length === 0) return new Set();

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

function RoomShell({
  geom,
  interactive,
  appearance,
  cutaway,
  selectedWallId,
  selectWall,
  designerTool,
  showCeiling,
  showRoof,
}: {
  geom: RoomGeometry;
  interactive: boolean;
  appearance: ReturnType<typeof useStore.getState>['environment']['appearance'];
  cutaway: string;
  selectedWallId: string | null;
  selectWall: (id: string | null) => void;
  designerTool: string;
  showCeiling: boolean;
  showRoof: boolean;
}) {
  const H = geom.height;
  const segments = useMemo(() => allWallSegments(geom), [geom]);
  const hidden = useMemo(() => cutAwayWallIds(geom, cutaway), [geom, cutaway]);
  const canSelectWall = interactive && designerTool === 'select';

  return (
    <group>
      <OrbitCutawaySync geom={geom} />
      <FloorMesh
        geom={geom}
        preset={appearance.floorPreset}
        textureUrl={appearance.floorTextureUrl}
      />
      <CeilingMesh
        geom={geom}
        preset={appearance.ceilingPreset}
        visible={showCeiling}
      />
      <ShadowRoof
        geom={geom}
        enabled={showRoof}
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
            color={wallPaintColor(appearance, seg.wall.id)}
            selected={canSelectWall && selectedWallId === seg.wall.id}
            onSelect={canSelectWall ? () => selectWall(seg.wall.id) : undefined}
          />
        );
      })}

      <Baseboards
        geom={geom}
        trimPreset={appearance.trimPreset}
        visible={appearance.showBaseboards}
      />
      <DoorAssemblies geom={geom} trimPreset={appearance.trimPreset} />
      <WindowLightAndGlass geom={geom} trimPreset={appearance.trimPreset} interactive={interactive} />
      <RecessedLights geom={geom} enabled={appearance.recessedLights} />
    </group>
  );
}

export function Room({ interactive = true }: { interactive?: boolean }) {
  const fullGeom = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const appearance = useStore((s) => s.environment.appearance);
  const cutaway = useStore((s) => s.visual.cutaway);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const designerTool = useStore((s) => s.designerTool);
  const mode = apartmentModeFor(fullGeom, focusedRoomId);

  const focusGroupRef = useRef<THREE.Group>(null);
  const restGroupRef = useRef<THREE.Group>(null);

  const focusedRoom = focusedRoomId
    ? apartmentRoomById(fullGeom, focusedRoomId)
    : null;

  const focusGeom = useMemo(() => {
    if (!focusedRoom) return null;
    return planForFace(fullGeom, focusedRoom);
  }, [fullGeom, focusedRoom]);

  const restGeom = useMemo(() => {
    if (!focusedRoom || mode === 'single') return null;
    // Rest = full plan walls/floors minus the focused room's exclusive parts.
    // Simplest: render the full plan in rest and the focused face in focus —
    // shared walls appear in both (acceptable for the drop-away effect).
    return fullGeom;
  }, [fullGeom, focusedRoom, mode]);

  // Single-room / non-apartment: render as today via active geometry.
  if (mode === 'single') {
    const geom = activeGeometryFor(fullGeom, focusedRoomId);
    const showCeiling = cutaway !== 'topDown';
    return (
      <RoomShell
        geom={geom}
        interactive={interactive}
        appearance={appearance}
        cutaway={cutaway}
        selectedWallId={selectedWallId}
        selectWall={selectWall}
        designerTool={designerTool}
        showCeiling={showCeiling}
        showRoof={cutaway !== 'topDown'}
      />
    );
  }

  // Overview: full apartment, no ceiling (dollhouse).
  if (mode === 'overview') {
    return (
      <group>
        <ApartmentTransition restGroupRef={restGroupRef} focusGroupRef={focusGroupRef} />
        <group ref={focusGroupRef} />
        <group ref={restGroupRef}>
          <RoomShell
            geom={fullGeom}
            interactive={false}
            appearance={appearance}
            cutaway="orbit"
            selectedWallId={null}
            selectWall={() => {}}
            designerTool="select"
            showCeiling={false}
            showRoof={false}
          />
        </group>
      </group>
    );
  }

  // Focused: focused room stays; rest drops away.
  return (
    <group>
      <ApartmentTransition restGroupRef={restGroupRef} focusGroupRef={focusGroupRef} />
      <group ref={focusGroupRef}>
        {focusGeom ? (
          <RoomShell
            geom={focusGeom}
            interactive={interactive}
            appearance={appearance}
            cutaway={cutaway}
            selectedWallId={selectedWallId}
            selectWall={selectWall}
            designerTool={designerTool}
            showCeiling={cutaway !== 'topDown'}
            showRoof={cutaway !== 'topDown'}
          />
        ) : null}
      </group>
      <group ref={restGroupRef}>
        {restGeom ? (
          <RoomShell
            geom={restGeom}
            interactive={false}
            appearance={appearance}
            cutaway="orbit"
            selectedWallId={null}
            selectWall={() => {}}
            designerTool="select"
            showCeiling={false}
            showRoof={false}
          />
        ) : null}
      </group>
    </group>
  );
}

function WindowLightAndGlass({
  geom,
  trimPreset,
  interactive = false,
}: {
  geom: RoomGeometry;
  trimPreset: import('../lib/roomMaterials').MaterialPresetId;
  interactive?: boolean;
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
      interactive={interactive}
    />
  );
}

// Re-export for tests / tooling
export { floorShapesFromGeometry } from './FloorCeiling';
