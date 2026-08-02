import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { interiorHazeParams } from '../lib/environment';
import { planBounds, planCentroid } from '../lib/roomGeometry';
import { useStore } from '../store';

function createHazeMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, -1, 0) },
      uColor: { value: new THREE.Color(color) },
      uDensity: { value: 0.08 },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uColor;
      uniform float uDensity;
      uniform vec3 uCameraPos;
      varying vec3 vWorldPos;

      void main() {
        vec3 viewDir = normalize(vWorldPos - uCameraPos);
        float sunScatter = pow(max(dot(viewDir, uSunDir), 0.0), 6.5);
        float dist = length(vWorldPos - uCameraPos);
        float depthFade = exp(-dist * 0.006);
        float alpha = uDensity * (0.08 + sunScatter * 0.92) * depthFade;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
}

/** Sun-aligned interior air scatter — fills the room with soft volumetric haze. */
export function RoomVolumetricHaze() {
  const godRays = useStore((s) => s.environment.godRays);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);

  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const bounds = useMemo(() => planBounds(geom), [geom]);
  const [cx, cz] = useMemo(() => planCentroid(geom), [geom]);
  const height = geom.height;

  const haze = useMemo(
    () => interiorHazeParams(timeOfDay, orientationDeg, weather, exposure, bounds),
    [timeOfDay, orientationDeg, weather, exposure, bounds],
  );

  const material = useMemo(
    () => (haze ? createHazeMaterial(haze.color) : null),
    [haze?.color],
  );

  useEffect(() => () => material?.dispose(), [material]);

  useFrame(() => {
    if (!material || !haze || !godRays) return;
    material.uniforms.uSunDir.value.set(...haze.sunDir);
    material.uniforms.uDensity.value = haze.scatterDensity;
    material.uniforms.uCameraPos.value.copy(camera.position);
  });

  if (!godRays || !haze || !material) return null;

  return (
    <mesh
      ref={meshRef}
      position={[cx, height / 2, cz]}
      scale={[bounds.width * 0.97, height * 0.97, bounds.depth * 0.97]}
      renderOrder={0}
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
