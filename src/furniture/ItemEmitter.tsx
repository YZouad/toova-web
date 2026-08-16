import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { EmitterConfig } from '../store';
import { useStore } from '../store';

/**
 * UI brightness is authored ~0.1–8 for readability. Recessed cans run ~40+ in this
 * scene’s physical lighting, so we scale emitters into that band.
 */
export const EMITTER_LIGHT_POWER = 32;

interface Props {
  emitter: EmitterConfig;
  /** Local Y of the light (inches). */
  lightY: number;
}

export function ItemEmitter({ emitter, lightY }: Props) {
  const spotRef = useRef<THREE.SpotLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);
  const exposure = useStore((s) => s.environment.exposure);
  const y = lightY;
  const intensity = Math.max(0, emitter.intensity) * EMITTER_LIGHT_POWER * Math.max(0.15, exposure);
  const distance = Math.max(1, emitter.range);

  useLayoutEffect(() => {
    const light = spotRef.current;
    const target = targetRef.current;
    if (light && target) light.target = target;
  }, [emitter.type]);

  if (emitter.type === 'spot') {
    const angleDeg = emitter.angleDeg ?? 45;
    return (
      <>
        <spotLight
          ref={spotRef}
          position={[0, y, 0]}
          color={emitter.color}
          intensity={intensity}
          distance={distance}
          angle={(angleDeg * Math.PI) / 180}
          penumbra={0.4}
          decay={1.35}
          castShadow={false}
        />
        <object3D ref={targetRef} position={[0, Math.max(-distance * 0.35, y - 36), 0]} />
      </>
    );
  }

  return (
    <pointLight
      position={[0, y, 0]}
      color={emitter.color}
      intensity={intensity}
      distance={distance}
      decay={1.35}
      castShadow={false}
    />
  );
}
