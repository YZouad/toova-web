import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { floorFaceLoops, planBounds, planCentroid, type RoomGeometry } from '../lib/roomGeometry';
import { applyFloorShapeUVs, applyWallSlabUVs } from '../lib/shapeUVs';
import { useRoomSurfaceMaterial, disposeMaterial } from './useRoomMaterial';
import type { MaterialPresetId } from '../lib/roomMaterials';
import { useStore } from '../store';
import { useOrbitFade } from './useOrbitFade';
import { daylightFillScale } from '../lib/environment';
import { createShadowOnlyMaterials } from './shadowLayers';

const ROOF_THICKNESS = 4;

/** World Y of the roof slab's interior face (bottom of the extruded roof). */
function roofUndersideY(geom: RoomGeometry): number {
  return geom.height - ROOF_THICKNESS;
}

export function floorShapesFromGeometry(geom: RoomGeometry): THREE.Shape[] {
  const loops = floorFaceLoops(geom);
  if (loops.length === 0) {
    const b = planBounds(geom);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(b.width, 0);
    s.lineTo(b.width, b.depth);
    s.lineTo(0, b.depth);
    s.closePath();
    return [s];
  }
  return loops.map((verts) => {
    const s = new THREE.Shape();
    s.moveTo(verts[0]!.x, verts[0]!.z);
    for (let i = 1; i < verts.length; i++) {
      s.lineTo(verts[i]!.x, verts[i]!.z);
    }
    s.closePath();
    return s;
  });
}

function FloorMeshInner({
  geom,
  preset,
}: {
  geom: RoomGeometry;
  preset: MaterialPresetId;
}) {
  const mat = useRoomSurfaceMaterial(preset, { side: THREE.DoubleSide });
  const shapes = useMemo(() => floorShapesFromGeometry(geom), [geom]);
  const geos = useMemo(() => {
    return shapes.map((shape) => {
      const g = new THREE.ShapeGeometry(shape);
      applyFloorShapeUVs(g, 1);
      g.computeVertexNormals();
      return g;
    });
  }, [shapes]);

  useEffect(() => () => {
    disposeMaterial(mat);
    for (const g of geos) g.dispose();
  }, [mat, geos]);

  return (
    <group>
      {geos.map((geo, i) => (
        <mesh
          key={i}
          geometry={geo}
          position={[0, 0, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
          material={mat}
        />
      ))}
    </group>
  );
}

export function FloorMesh({
  geom,
  preset,
}: {
  geom: RoomGeometry;
  preset: MaterialPresetId;
}) {
  return <FloorMeshInner geom={geom} preset={preset} />;
}

/** Visible ceiling finish — thin underside. Casting is done by ShadowRoof. */
export function CeilingMesh({
  geom,
  preset,
  visible,
}: {
  geom: RoomGeometry;
  preset: MaterialPresetId;
  visible: boolean;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const groupRef = useRef<THREE.Group>(null);
  const mat = useRoomSurfaceMaterial(preset, {
    side: THREE.DoubleSide,
    transparent: true,
  });
  const y = roofUndersideY(geom) + 0.05;
  const [cx, cz] = planCentroid(geom);

  const shapes = useMemo(() => floorShapesFromGeometry(geom), [geom]);
  const geos = useMemo(() => {
    return shapes.map((shape) => {
      const g = new THREE.ShapeGeometry(shape);
      applyFloorShapeUVs(g, 1);
      g.computeVertexNormals();
      return g;
    });
  }, [shapes]);

  useEffect(() => {
    matRef.current = mat;
  }, [mat]);

  useEffect(() => () => {
    disposeMaterial(mat);
    for (const g of geos) g.dispose();
  }, [mat, geos]);

  useOrbitFade([matRef], [0, 1, 0], [cx, y, cz], { groupRef, hidden: !visible });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {geos.map((geo, i) => (
        <mesh
          key={i}
          geometry={geo}
          position={[0, y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow={false}
          // Roof slab sits just above — receiving its shadow paints a sun-tracking
          // blotch on the ceiling plane (worst on higher shadow-map tiers).
          receiveShadow={false}
          material={mat}
        />
      ))}
    </group>
  );
}

/**
 * Solid roof slab — same construction as walls: ExtrudeGeometry + standard
 * material, casts and receives shadows. Always on (except top-down cutaway).
 */
export function ShadowRoof({
  geom,
  enabled,
  preset,
}: {
  geom: RoomGeometry;
  enabled: boolean;
  preset: MaterialPresetId;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const groupRef = useRef<THREE.Group>(null);
  const [cx, cz] = planCentroid(geom);
  const y = geom.height;

  const material = useRoomSurfaceMaterial(preset, {
    side: THREE.DoubleSide,
    transparent: true,
  });

  const shapes = useMemo(() => floorShapesFromGeometry(geom), [geom]);
  const geos = useMemo(() => {
    return shapes.map((shape) => {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: ROOF_THICKNESS,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1,
      });
      applyWallSlabUVs(g, 1);
      g.computeVertexNormals();
      return g;
    });
  }, [shapes]);

  const { depthMaterial, colorMaterial: shadowMaterial } = useMemo(
    () => createShadowOnlyMaterials(),
    [],
  );

  useEffect(() => {
    matRef.current = material;
    material.shadowSide = THREE.DoubleSide;
  }, [material]);

  useEffect(() => () => {
    disposeMaterial(material);
    depthMaterial.dispose();
    shadowMaterial.dispose();
    for (const g of geos) g.dispose();
  }, [material, geos, depthMaterial, shadowMaterial]);

  useOrbitFade([matRef], [0, 1, 0], [cx, y - ROOF_THICKNESS / 2, cz], {
    groupRef,
    hidden: !enabled,
  });

  if (!enabled) return null;

  const roofTransform = {
    position: [0, y, 0] as [number, number, number],
    rotation: [Math.PI / 2, 0, 0] as [number, number, number],
  };

  return (
    <group>
      {geos.map((geo, i) => (
        <mesh
          key={`shadow-${i}`}
          geometry={geo}
          position={roofTransform.position}
          rotation={roofTransform.rotation}
          castShadow
          receiveShadow={false}
          frustumCulled={false}
          material={shadowMaterial}
          customDepthMaterial={depthMaterial}
          userData={{ hangingPick: false }}
          raycast={() => {
            /* shadow-only — camera-facing roof still blocks the sun */
          }}
        />
      ))}
      <group ref={groupRef}>
        {geos.map((geo, i) => (
          <mesh
            key={i}
            geometry={geo}
            // Same basis as the floor: shape XY → world XZ via rotateX(+π/2).
            // Extrude +Z then becomes world −Y, so the slab drops from the wall tops.
            position={roofTransform.position}
            rotation={roofTransform.rotation}
            castShadow={false}
            receiveShadow
            material={material}
          />
        ))}
      </group>
    </group>
  );
}

/** Optional recessed can lights — flush to ceiling, soft room-wide ambient fill. */
export function RecessedLights({
  geom,
  enabled,
}: {
  geom: RoomGeometry;
  enabled: boolean;
}) {
  const exposure = useStore((s) => s.environment.exposure);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const [cx, cz] = planCentroid(geom);
  const b = planBounds(geom);
  if (!enabled) return null;

  const fixtures: [number, number][] = [
    [cx - b.width * 0.22, cz - b.depth * 0.18],
    [cx + b.width * 0.22, cz + b.depth * 0.18],
  ];

  // Sit flush on the underside of the roof slab (not inside its thickness).
  const fixtureY = roofUndersideY(geom) - 0.15;
  const dayMul = daylightFillScale(timeOfDay, orientationDeg);
  const ambientBoost = 0.55 * exposure * dayMul;
  const fillIntensity = 42 * exposure * dayMul;
  const span = Math.max(b.width, b.depth);

  return (
    <group>
      <ambientLight intensity={ambientBoost} color="#fff2dc" />
      <hemisphereLight args={['#fff8ea', '#c8bcae', ambientBoost * 0.7]} />
      {fixtures.map(([x, z], i) => (
        <CanLight
          key={i}
          x={x}
          y={fixtureY}
          z={z}
          fillIntensity={fillIntensity}
          range={span * 1.15}
        />
      ))}
    </group>
  );
}

function CanLight({
  x,
  y,
  z,
  fillIntensity,
  range,
}: {
  x: number;
  y: number;
  z: number;
  fillIntensity: number;
  range: number;
}) {
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[2.0, 2.9, 24]} />
        <meshStandardMaterial color="#e8e6e0" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[1.95, 24]} />
        <meshStandardMaterial
          color="#fff8e8"
          emissive="#ffe9b8"
          emissiveIntensity={4.5}
          roughness={0.5}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, -2.5, 0]}
        intensity={fillIntensity}
        distance={range}
        decay={1.35}
        color="#fff1d6"
        castShadow={false}
      />
    </group>
  );
}
