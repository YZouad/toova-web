import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { InchSize } from './importedItemSize';

/** Axis-aligned bounds [width, height, depth] of a GLB/GLTF file in its native units. */
export async function readGlbAxisBounds(file: File): Promise<InchSize | null> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) return null;

  const url = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const s = new THREE.Vector3();
    box.getSize(s);
    if (![s.x, s.y, s.z].every((v) => Number.isFinite(v) && v > 0)) return null;
    return [s.x, s.y, s.z];
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatInchDim(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return String(rounded);
}
