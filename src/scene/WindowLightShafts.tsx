import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { beamGeometryKey, horizonFactor, sampleSun, weatherGodRayStrength } from '../lib/environment';
import { planBounds } from '../lib/roomGeometry';
import {
  computeWindowBeams,
  createShaftMaterial,
  type WindowBeam,
} from '../lib/windowLightShafts';
import { useStore } from '../store';

function BeamMesh({
  beam,
  shaftMaterial,
  groupRef,
}: {
  beam: WindowBeam;
  shaftMaterial: THREE.ShaderMaterial;
  groupRef: (el: THREE.Group | null) => void;
}) {
  return (
    <group ref={groupRef}>
      <mesh geometry={beam.shaftGeometry} material={shaftMaterial} renderOrder={1} />
    </group>
  );
}

/** Sun-aligned volumetric shafts through each window. */
export function WindowLightShafts() {
  const godRays = useStore((s) => s.environment.godRays);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);

  const weatherShaft = weatherGodRayStrength(weather);

  const bounds = useMemo(() => planBounds(geom), [geom]);
  const geomKey = useMemo(
    () => beamGeometryKey(timeOfDay, orientationDeg),
    [timeOfDay, orientationDeg],
  );

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, bounds),
    [timeOfDay, orientationDeg, bounds],
  );

  const beams = useMemo(
    () => computeWindowBeams(geom, geomKey.time, geomKey.orient),
    [geom, geomKey.time, geomKey.orient],
  );

  const shaftMaterial = useMemo(() => createShaftMaterial(sun.color, 0.3), [sun.color]);

  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => () => shaftMaterial.dispose(), [shaftMaterial]);

  useEffect(
    () => () => {
      for (const b of beams) {
        b.shaftGeometry.dispose();
      }
    },
    [beams],
  );

  useFrame(() => {
    const horizon = horizonFactor(timeOfDay, orientationDeg);
    const shaftOpacity =
      Math.min(0.42, sun.intensity * exposure * 0.3) * (1 - horizon * 0.4) * weatherShaft;
    shaftMaterial.uniforms.uOpacity.value = shaftOpacity;
  });

  if (!godRays || weatherShaft < 0.02 || sun.intensity < 0.12 || beams.length === 0) return null;

  return (
    <group>
      {beams.map((beam, i) => (
        <BeamMesh
          key={`beam-${i}-${geomKey.time}-${geomKey.orient}`}
          beam={beam}
          shaftMaterial={shaftMaterial}
          groupRef={(el) => {
            groupRefs.current[i] = el;
          }}
        />
      ))}
    </group>
  );
}
