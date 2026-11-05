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
import { OrbitCutawayEnabledContext, OrbitCutawaySync } from './useOrbitFade';
import { ApartmentTransition, useApartmentTransitionPhase } from './ApartmentTransition';

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
  enableOrbitCutaway = true,
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
  /** Orbit wall-hiding. Off in apartment dollhouse / resting shells. */
  enableOrbitCutaway?: boolean;
}) {
  const H = geom.height;
  const segments = useMemo(() => allWallSegments(geom), [geom]);
  const hidden = useMemo(
    () => (enableOrbitCutaway ? cutAwayWallIds(geom, cutaway) : new Set<string>()),
    [enableOrbitCutaway, geom, cutaway],
  );
  const canSelectWall = interactive && designerTool === 'select';

  return (
    <OrbitCutawayEnabledContext.Provider value={enableOrbitCutaway}>
      <group>
        {enableOrbitCutaway ? <OrbitCutawaySync geom={geom} /> : null}
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
    </OrbitCutawayEnabledContext.Provider>
  );
}

export function Room({
  interactive = true,
  /** Hovered room id — pre-mounts that face shell so a click does not compile shaders. */
  warmRoomId = null,
}: {
  interactive?: boolean;
  warmRoomId?: string | null;
}) {
  const fullGeom = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const appearance = useStore((s) => s.environment.appearance);
  const cutaway = useStore((s) => s.visual.cutaway);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const designerTool = useStore((s) => s.designerTool);
  const mode = apartmentModeFor(fullGeom, focusedRoomId);

  const phase = useApartmentTransitionPhase();

  const focusGroupRef = useRef<THREE.Group>(null);
  const restGroupRef = useRef<THREE.Group>(null);

  // Keep focus shells mounted once warmed (hover or prior focus) so a later
  // click does not compile shaders. Avoid mounting every room up front — that
  // triples wall count in overview and tanks FPS.
  const warmedRef = useRef<Set<string>>(new Set());
  const planRef = useRef(fullGeom);
  if (planRef.current !== fullGeom) {
    planRef.current = fullGeom;
    warmedRef.current = new Set();
  }
  if (mode === 'single') {
    warmedRef.current.clear();
  } else {
    if (focusedRoomId) warmedRef.current.add(focusedRoomId);
    if (warmRoomId) warmedRef.current.add(warmRoomId);
  }
  const warmedIds = useMemo(
    () => Array.from(warmedRef.current),
    // Membership changes when hover/focus adds an id or the plan resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, fullGeom, focusedRoomId, warmRoomId],
  );

  const focusGeoms = useMemo(() => {
    const out: { id: string; geom: RoomGeometry }[] = [];
    for (const id of warmedIds) {
      const room = apartmentRoomById(fullGeom, id);
      if (!room) continue;
      out.push({ id, geom: planForFace(fullGeom, room) });
    }
    return out;
  }, [fullGeom, warmedIds]);

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

  // Overview and focused share one tree so clicking a room never remounts the
  // apartment: the full plan lives in `rest` (drops away), the focused face in
  // `focus` (walls grow from the dollhouse cut to full height).
  const settledFocused = mode === 'focused' && phase === 'focused';
  const activeFocusId = focusedRoomId;
  return (
    <group>
      <ApartmentTransition restGroupRef={restGroupRef} focusGroupRef={focusGroupRef} />
      <group ref={focusGroupRef}>
        {focusGeoms.map(({ id, geom }) => {
          const active = id === activeFocusId;
          const cutawaysOn = active && mode === 'focused';
          return (
            <group key={id} visible={active}>
              <RoomShell
                geom={geom}
                interactive={interactive && cutawaysOn}
                appearance={appearance}
                cutaway={cutawaysOn ? cutaway : 'orbit'}
                selectedWallId={active ? selectedWallId : null}
                selectWall={selectWall}
                designerTool={designerTool}
                showCeiling={cutawaysOn && settledFocused && cutaway !== 'topDown'}
                showRoof={cutawaysOn && settledFocused && cutaway !== 'topDown'}
                enableOrbitCutaway={cutawaysOn}
              />
            </group>
          );
        })}
      </group>
      <group ref={restGroupRef}>
        <RoomShell
          geom={fullGeom}
          interactive={false}
          appearance={appearance}
          cutaway="orbit"
          selectedWallId={null}
          selectWall={noopSelectWall}
          designerTool="select"
          showCeiling={false}
          showRoof={false}
          enableOrbitCutaway={false}
        />
      </group>
    </group>
  );
}

const noopSelectWall = () => {};

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
