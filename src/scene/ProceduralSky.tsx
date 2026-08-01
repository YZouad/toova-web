import { useLayoutEffect, useMemo, useRef } from 'react';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { proceduralSkyParams } from '../lib/environment';
import { planBounds, planCentroid } from '../lib/roomGeometry';
import { useStore } from '../store';

export function ProceduralSky() {
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const groupRef = useRef<THREE.Group>(null);

  const bounds = useMemo(() => planBounds(geom), [geom]);
  const [cx, cz] = useMemo(() => planCentroid(geom), [geom]);
  const span = Math.max(bounds.width, bounds.depth);

  const params = useMemo(
    () => proceduralSkyParams(timeOfDay, orientationDeg, weather, bounds),
    [timeOfDay, orientationDeg, weather, bounds],
  );

  const sunPosition = useMemo(
    () => new THREE.Vector3(...params.sunPosition),
    [params.sunPosition],
  );

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.traverse((obj) => {
      if (obj.type === 'Mesh') obj.raycast = () => null;
    });
  }, [params]);

  if (skyMode !== 'gradient') return null;

  return (
    <group ref={groupRef} position={[cx, 0, cz]}>
      <Sky
        distance={span * 4 + 650}
        sunPosition={sunPosition}
        turbidity={params.turbidity}
        rayleigh={params.rayleigh}
        mieCoefficient={params.mieCoefficient}
        mieDirectionalG={params.mieDirectionalG}
      />
    </group>
  );
}
