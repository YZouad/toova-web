import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getProceduralMaterialMaps } from '../lib/proceduralTextures';
import type { MaterialPresetId } from '../lib/roomMaterials';

/**
 * Build a MeshStandardMaterial from a procedural preset.
 * Callers should dispose materials they own when unmounting if created per-mesh.
 */
export function useRoomSurfaceMaterial(
  presetId: MaterialPresetId,
  opts?: { side?: THREE.Side; transparent?: boolean },
): THREE.MeshStandardMaterial {
  return useMemo(() => {
    const maps = getProceduralMaterialMaps(presetId);
    const mat = new THREE.MeshStandardMaterial({
      color: maps.color,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: maps.roughness,
      metalness: maps.metalness,
      side: opts?.side ?? THREE.FrontSide,
      transparent: opts?.transparent ?? false,
    });
    // World-scale repeat is applied via geometry UVs in inches / repeatInches.
    // Textures use RepeatWrapping; UV coords already encode world inches.
    const scale = 1 / maps.repeatInches;
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) {
      t.repeat.set(scale, scale);
      t.needsUpdate = true;
    }
    return mat;
  }, [presetId, opts?.side, opts?.transparent]);
}

function applyTextureRepeat(textures: THREE.Texture[], repeatInches: number): void {
  const scale = 1 / repeatInches;
  for (const t of textures) {
    t.repeat.set(scale, scale);
    t.needsUpdate = true;
  }
}

/** Floor material — procedural preset, or a user-uploaded photo when provided. */
export function useFloorSurfaceMaterial(
  presetId: MaterialPresetId,
  textureUrl?: string,
): THREE.MeshStandardMaterial {
  const maps = useMemo(() => getProceduralMaterialMaps(presetId), [presetId]);
  const [photoMap, setPhotoMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!textureUrl) {
      setPhotoMap(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      textureUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        applyTextureRepeat([tex], maps.repeatInches);
        tex.needsUpdate = true;
        setPhotoMap(tex);
      },
      undefined,
      () => {
        if (!cancelled) setPhotoMap(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [textureUrl, maps.repeatInches]);

  useEffect(
    () => () => {
      photoMap?.dispose();
    },
    [photoMap],
  );

  return useMemo(() => {
    if (photoMap) {
      return new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: photoMap,
        roughness: maps.roughness,
        metalness: maps.metalness,
        side: THREE.DoubleSide,
      });
    }
    const mat = new THREE.MeshStandardMaterial({
      color: maps.color,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: maps.roughness,
      metalness: maps.metalness,
      side: THREE.DoubleSide,
    });
    applyTextureRepeat([maps.map, maps.normalMap, maps.roughnessMap], maps.repeatInches);
    return mat;
  }, [maps, photoMap]);
}

export function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    // Do not dispose shared procedural textures — they are cached globally.
    m.dispose();
  }
}
