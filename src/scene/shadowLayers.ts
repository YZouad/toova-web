import * as THREE from 'three';

/**
 * Intended for lights' shadow cameras. Do not put casters on this layer
 * alone: WebGLShadowMap tests object.layers against the *main* camera, so
 * a layer-1-only mesh is skipped in the shadow map.
 */
export const SHADOW_ONLY_LAYER = 1;

/** Invisible to the camera; writes depth in the sun's shadow pass. */
export function createShadowOnlyMaterials(): {
  depthMaterial: THREE.MeshDepthMaterial;
  colorMaterial: THREE.MeshBasicMaterial;
} {
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  const colorMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: false,
  });
  colorMaterial.shadowSide = THREE.DoubleSide;
  return { depthMaterial, colorMaterial };
}
