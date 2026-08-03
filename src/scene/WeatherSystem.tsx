import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { applyWeather, sampleSun } from '../lib/environment';
import { planBounds, planCentroid } from '../lib/roomGeometry';
import { useStore } from '../store';

const PRECIP_COUNT = 400;
const FOOTPRINT_PAD = 8;
const OUTER_MARGIN = 64;

type PlanBounds = { width: number; depth: number; minX: number; minZ: number };

function isInsideFootprint(x: number, z: number, bounds: PlanBounds, pad = FOOTPRINT_PAD) {
  return (
    x >= bounds.minX - pad &&
    x <= bounds.minX + bounds.width + pad &&
    z >= bounds.minZ - pad &&
    z <= bounds.minZ + bounds.depth + pad
  );
}

/** Spawn precipitation outside the room outline so it reads as exterior weather. */
function randomOutsideFootprint(bounds: PlanBounds, roomHeight: number) {
  const cx = bounds.minX + bounds.width / 2;
  const cz = bounds.minZ + bounds.depth / 2;
  const spreadW = bounds.width + OUTER_MARGIN * 2;
  const spreadD = bounds.depth + OUTER_MARGIN * 2;

  for (let attempt = 0; attempt < 32; attempt++) {
    const x = bounds.minX - OUTER_MARGIN + Math.random() * spreadW;
    const z = bounds.minZ - OUTER_MARGIN + Math.random() * spreadD;
    if (!isInsideFootprint(x, z, bounds)) {
      return {
        x,
        y: roomHeight + 48 + Math.random() * 140,
        z,
      };
    }
  }

  const side = Math.floor(Math.random() * 4);
  if (side === 0) {
    return { x: cx + (Math.random() - 0.5) * bounds.width, y: roomHeight + 90, z: bounds.minZ - OUTER_MARGIN * 0.7 };
  }
  if (side === 1) {
    return { x: cx + (Math.random() - 0.5) * bounds.width, y: roomHeight + 90, z: bounds.minZ + bounds.depth + OUTER_MARGIN * 0.7 };
  }
  if (side === 2) {
    return { x: bounds.minX - OUTER_MARGIN * 0.7, y: roomHeight + 90, z: cz + (Math.random() - 0.5) * bounds.depth };
  }
  return { x: bounds.minX + bounds.width + OUTER_MARGIN * 0.7, y: roomHeight + 90, z: cz + (Math.random() - 0.5) * bounds.depth };
}

function disableRaycast(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (
      obj.type === 'Mesh' ||
      obj.type === 'Points' ||
      obj.type === 'InstancedMesh' ||
      obj.type === 'Line' ||
      obj.type === 'LineSegments'
    ) {
      obj.raycast = () => null;
    }
  });
}

function Precipitation({
  kind,
  bounds,
  roomHeight,
}: {
  kind: 'rain' | 'snow';
  bounds: PlanBounds;
  roomHeight: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const windRef = useRef(0);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(PRECIP_COUNT * 3);
    const vel = new Float32Array(PRECIP_COUNT);
    for (let i = 0; i < PRECIP_COUNT; i++) {
      const p = randomOutsideFootprint(bounds, roomHeight);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      vel[i] = kind === 'rain' ? 2.8 + Math.random() * 2.2 : 0.35 + Math.random() * 0.55;
    }
    return { positions: pos, velocities: vel };
  }, [kind, bounds, roomHeight]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: kind === 'rain' ? '#a8c8e8' : '#f0f4ff',
        size: kind === 'rain' ? 1.6 : 2.6,
        transparent: true,
        opacity: kind === 'rain' ? 0.38 : 0.7,
        depthWrite: true,
        depthTest: true,
        sizeAttenuation: true,
      }),
    [kind],
  );

  useEffect(() => () => material.dispose(), [material]);

  const respawn = (arr: Float32Array, idx: number) => {
    const p = randomOutsideFootprint(bounds, roomHeight);
    arr[idx] = p.x;
    arr[idx + 1] = p.y;
    arr[idx + 2] = p.z;
  };

  useFrame((state, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;
    windRef.current = Math.sin(t * 0.4) * 6;

    for (let i = 0; i < PRECIP_COUNT; i++) {
      const idx = i * 3;
      if (kind === 'rain') {
        arr[idx + 1] -= velocities[i] * delta * 55;
        arr[idx] -= (8 + windRef.current) * delta;
      } else {
        arr[idx + 1] -= velocities[i] * delta * 18;
        arr[idx] += Math.sin(t * 1.2 + i * 0.15) * delta * 4;
        arr[idx + 2] += Math.cos(t * 0.9 + i * 0.11) * delta * 2.5;
      }

      if (arr[idx + 1] < 0 || isInsideFootprint(arr[idx], arr[idx + 2], bounds)) {
        respawn(arr, idx);
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false} renderOrder={-10}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
}

export function WeatherSystem() {
  const weather = useStore((s) => s.environment.weather);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const geom = useStore((s) => s.roomGeometry);

  const bounds = useMemo(() => planBounds(geom), [geom]);
  const [cx, cz] = useMemo(() => planCentroid(geom), [geom]);
  const span = Math.max(bounds.width, bounds.depth);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, bounds),
    [timeOfDay, orientationDeg, bounds],
  );

  const mod = useMemo(
    () => applyWeather(sun, weather, bounds),
    [sun, weather, bounds],
  );

  const cloudCount = Math.max(1, Math.round(mod.cloudCover * 6));
  const cloudOpacity = 0.22 + mod.cloudCover * 0.48;
  const groupRef = useRef<THREE.Group>(null);
  const driftRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (groupRef.current) disableRaycast(groupRef.current);
  }, [mod.cloudCover, mod.precip, mod.stars, cloudCount]);

  useFrame((_, delta) => {
    const drift = driftRef.current;
    if (!drift) return;
    drift.position.x += delta * (1.5 + mod.cloudCover);
    if (drift.position.x > span * 0.6) drift.position.x = -span * 0.6;
  });

  return (
    <group ref={groupRef}>
      {mod.stars ? (
        <Stars
          radius={span + 280}
          depth={90}
          count={2800}
          factor={3}
          fade
          speed={0.25}
        />
      ) : null}

      {mod.cloudCover > 0.02 ? (
        <group ref={driftRef} position={[cx, span * 0.75 + 100, cz]}>
          <Clouds limit={Math.max(24, cloudCount * 10)}>
            {Array.from({ length: cloudCount }, (_, i) => (
              <Cloud
                key={`${weather}-${i}`}
                seed={i * 17 + weather.length}
                bounds={[span * 0.32, 10, span * 0.22]}
                segments={10}
                concentrate="outside"
                opacity={cloudOpacity}
                speed={0.12 + mod.cloudCover * 0.18}
                volume={7 + mod.cloudCover * 7}
                color="#eef1f4"
                position={[
                  (i - cloudCount / 2) * span * 0.38,
                  (i % 3) * 6 - 6,
                  ((i * 41) % Math.max(cloudCount, 1) - cloudCount / 2) * span * 0.14,
                ]}
              />
            ))}
          </Clouds>
        </group>
      ) : null}

      {mod.precip ? (
        <Precipitation kind={mod.precip} bounds={bounds} roomHeight={geom.height} />
      ) : null}
    </group>
  );
}
