import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Item, useStore } from '../store';
import { normalizeImportedMaterials, applyImportedHorizonLook } from '../lib/normalizeImportedMaterials';
import { importedMeshesReceiveShadows } from '../lib/environment';
import { shouldStandImportedUpright, standUpRotationAxis } from '../lib/importedUpright';
import { SelectionOutline } from './SelectionOutline';

/** Bump to remount loaded GLBs after material-pass changes (useGLTF cache is sticky). */
const IMPORT_MATERIAL_PASS = 19;

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
      <Inner
        key={`${item.importedUrl}::${IMPORT_MATERIAL_PASS}`}
        item={item}
        selected={selected}
        invalid={invalid}
        url={item.importedUrl}
      />
    </Suspense>
  );
}

function applyMeshTint(root: THREE.Object3D, hex: string) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const src = obj.material;
    const list = Array.isArray(src) ? src : [src];
    const next = list.map((mat) => {
      const cloned = mat.clone();
      if ('color' in cloned && cloned.color instanceof THREE.Color) {
        cloned.color.set(hex);
      }
      return cloned;
    });
    obj.material = Array.isArray(src) ? next : next[0]!;
  });
}

function ImportedLoadingBox({ item, selected, invalid }: Props) {
  const displaySize = item.catalogSizeIn ?? item.size;
  return (
    <>
      <mesh position={[0, displaySize[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={displaySize} />
        <meshStandardMaterial
          color={item.tintColor ?? '#7E8A60'}
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
  const relightImports = useStore((s) => s.visual.relightImports);
  const registerNatural = useStore((s) => s.registerImportedNaturalSize);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const receiveShadows = importedMeshesReceiveShadows(timeOfDay, orientationDeg);

  const { centeredScene, meshNaturalSize } = useMemo(() => {
    const cloned = scene.clone(true);
    normalizeImportedMaterials(cloned, {
      relight: relightImports,
      log: import.meta.env.DEV,
    });
    if (item.tintColor) applyMeshTint(cloned, item.tintColor);

    const box = new THREE.Box3().setFromObject(cloned);
    const s = new THREE.Vector3();
    box.getSize(s);
    const standAxis =
      shouldStandImportedUpright(item.label)
        ? standUpRotationAxis([s.x, s.y, s.z])
        : null;
    if (standAxis === 'x') cloned.rotation.x = Math.PI / 2;
    if (standAxis === 'z') cloned.rotation.z = Math.PI / 2;
    if (standAxis) cloned.updateMatrixWorld(true);
    const oriented = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    oriented.getSize(size);
    const c = new THREE.Vector3();
    oriented.getCenter(c);
    cloned.position.set(-c.x, -oriented.min.y, -c.z);

    return {
      centeredScene: cloned,
      meshNaturalSize: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [scene, relightImports, item.tintColor, item.label]);

  useEffect(() => {
    registerNatural(item.id, meshNaturalSize);
  }, [item.id, meshNaturalSize, registerNatural]);

  useEffect(() => {
    applyImportedHorizonLook(centeredScene, receiveShadows);
  }, [centeredScene, receiveShadows]);

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
