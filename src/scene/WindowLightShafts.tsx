import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { sampleSun } from '../lib/environment';
import { computeWindowBeams, createShaftMaterial, makeRectSplashTexture } from '../lib/windowLightShafts';
import { useStore } from '../store';

/** Sun-aligned volumetric shafts through each window + surface splash. */
export function WindowLightShafts() {
  const godRays = useStore((s) => s.environment.godRays);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, geom),
    [timeOfDay, orientationDeg, geom],
  );

  const beams = useMemo(
    () => computeWindowBeams(geom, timeOfDay, orientationDeg),
    [geom, timeOfDay, orientationDeg],
  );

  const shaftMaterial = useMemo(() => {
    const opacity = Math.min(0.42, sun.intensity * exposure * 0.28);
    return createShaftMaterial(sun.color, opacity);
  }, [sun.color, sun.intensity, exposure]);

  const splashTex = useMemo(() => {
    const peak = Math.min(0.45, sun.intensity * exposure * 0.22);
    return makeRectSplashTexture(sun.color, peak);
  }, [sun.color, sun.intensity, exposure]);

  useEffect(() => () => shaftMaterial.dispose(), [shaftMaterial]);
  useEffect(() => () => splashTex.dispose(), [splashTex]);

  useEffect(
    () => () => {
      for (const b of beams) {
        b.shaftGeometry.dispose();
        b.splashQuad?.dispose();
      }
    },
    [beams],
  );

  if (!godRays || sun.intensity < 0.12 || beams.length === 0) return null;

  return (
    <group>
      {beams.map((beam, i) => (
        <group key={`beam-${i}`}>
          <mesh geometry={beam.shaftGeometry} material={shaftMaterial} renderOrder={1} />

          {beam.splashQuad ? (
            <mesh geometry={beam.splashQuad} renderOrder={2}>
              <meshBasicMaterial
                map={splashTex}
                transparent
                opacity={0.55}
                depthWrite={false}
                toneMapped={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}
