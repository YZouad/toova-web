import { useMemo } from 'react';
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

export function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    // Do not dispose shared procedural textures — they are cached globally.
    m.dispose();
  }
}
