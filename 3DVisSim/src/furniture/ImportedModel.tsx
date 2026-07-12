import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Item, useStore } from '../store';
import { SelectionOutline } from './SelectionOutline';

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

/**
 * User-uploaded GLTF/GLB: mesh stays at its natural bounds; a scale factor maps
 * `item.size` (inches for placement/collision) onto those bounds via `importedNaturalSize`.
 */
export function ImportedModel({ item, selected, invalid }: Props) {
  if (!item.importedUrl) return null;
  return (
    <Suspense fallback={<ImportedLoadingBox item={item} selected={selected} invalid={invalid} />}>
      <Inner item={item} selected={selected} invalid={invalid} url={item.importedUrl} />
    </Suspense>
  );
}

function ImportedLoadingBox({ item, selected, invalid }: Props) {
  const displaySize = item.catalogSizeIn ?? item.size;
  return (
    <>
      <mesh position={[0, displaySize[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={displaySize} />
        <meshStandardMaterial
          color="#7E8A60"
          roughness={0.85}
          transparent
          opacity={0.38}
        />
      </mesh>
      {selected && (
        <SelectionOutline size={displaySize} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </>
  );
}

function Inner({ item, selected, invalid, url }: Props & { url: string }) {
  const { scene } = useGLTF(url) as { scene: THREE.Object3D };
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const registerNatural = useStore((s) => s.registerImportedNaturalSize);

  const { centeredScene, meshNaturalSize } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const s = new THREE.Vector3();
    box.getSize(s);
    const c = new THREE.Vector3();
    box.getCenter(c);
    cloned.position.set(-c.x, -box.min.y, -c.z);
    cloned.traverse((o: THREE.Object3D & { isMesh?: boolean }) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return {
      centeredScene: cloned,
      meshNaturalSize: [s.x, s.y, s.z] as [number, number, number],
    };
  }, [cloned]);

  useEffect(() => {
    registerNatural(item.id, meshNaturalSize);
  }, [item.id, meshNaturalSize, registerNatural]);

  const natural = item.importedNaturalSize ?? meshNaturalSize;
  const eps = 1e-3;
  // item.size is kept proportional to natural so sx/sy/sz stay equal (uniform scale).
  const sx = natural[0] > eps ? item.size[0] / natural[0] : 1;
  const sy = natural[1] > eps ? item.size[1] / natural[1] : 1;
  const sz = natural[2] > eps ? item.size[2] / natural[2] : 1;

  return (
    <>
      <group scale={[sx, sy, sz]}>
        <primitive object={centeredScene} />
      </group>
      {selected && (
        <SelectionOutline size={item.size} color={invalid ? '#ff5555' : '#4f8cff'} />
      )}
    </>
  );
}
