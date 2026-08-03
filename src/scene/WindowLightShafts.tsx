import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  beamGeometryKey,
  horizonFactor,
  isDaytime,
  sampleSun,
  sunAngles,
  weatherGodRayStrength,
} from '../lib/environment';
import { planBounds } from '../lib/roomGeometry';
import {
  computeWindowBeams,
  createShaftMaterial,
  type WindowBeam,
} from '../lib/windowLightShafts';
import { useStore } from '../store';
import { resolveRenderQuality } from '../lib/renderQuality';

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

/** True only while the sun is meaningfully above the horizon — no moonlight shafts. */
function shaftsAllowed(timeOfDay: number, sunIntensity: number): boolean {
  if (!isDaytime(timeOfDay)) return false;
  const { elevationDeg } = sunAngles(timeOfDay, 0);
  // Drop shafts near the horizon so they don't crawl the floor after sunset.
  if (elevationDeg < 2) return false;
  return sunIntensity >= 0.12;
}

/** Sun-aligned volumetric shafts through each window. */
export function WindowLightShafts() {
  const godRays = useStore((s) => s.environment.godRays);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const q = resolveRenderQuality(quality);
  const envOk = q.envDetail !== 'minimal';

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

  const allowShafts = envOk && shaftsAllowed(timeOfDay, sun.intensity);

  const beams = useMemo(() => {
    if (!allowShafts) return [] as WindowBeam[];
    return computeWindowBeams(geom, geomKey.time, geomKey.orient);
  }, [geom, geomKey.time, geomKey.orient, allowShafts]);

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
    if (!envOk || !allowShafts) {
      shaftMaterial.uniforms.uOpacity.value = 0;
      return;
    }
    const horizon = horizonFactor(timeOfDay, orientationDeg);
    const { elevationDeg } = sunAngles(timeOfDay, orientationDeg);
    // Fade out in the last few degrees before sunset so beams don't linger.
    const elevFade = THREE.MathUtils.clamp((elevationDeg - 2) / 10, 0, 1);
    const shaftOpacity =
      Math.min(0.55, sun.intensity * exposure * 0.42) *
      (1 - horizon * 0.25) *
      weatherShaft *
      elevFade;
    shaftMaterial.uniforms.uOpacity.value = shaftOpacity;
  });

  if (!envOk || !godRays || !allowShafts || weatherShaft < 0.02 || beams.length === 0) {
    return null;
  }

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
