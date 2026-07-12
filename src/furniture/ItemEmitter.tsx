import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { EmitterConfig } from '../store';

interface Props {
  emitter: EmitterConfig;
  itemHeight: number;
}

export function ItemEmitter({ emitter, itemHeight }: Props) {
  const spotRef = useRef<THREE.SpotLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);
  const y = itemHeight;

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
          intensity={emitter.intensity}
          distance={emitter.range}
          angle={(angleDeg * Math.PI) / 180}
          penumbra={0.35}
          decay={2}
          castShadow={false}
        />
        <object3D ref={targetRef} position={[0, Math.max(0, y - 24), 0]} />
      </>
    );
  }

  return (
    <pointLight
      position={[0, y, 0]}
      color={emitter.color}
      intensity={emitter.intensity}
      distance={emitter.range}
      decay={2}
      castShadow={false}
    />
  );
}
