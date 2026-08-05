import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  normalizeImportedMaterials,
  recomputeImportedNormals,
} from './normalizeImportedMaterials';

export type PrepareImportedGlbOptions = {
  /** Soften baked lighting in materials. Default true. */
  relight?: boolean;
  /** Always recompute vertex normals (AI meshes). Default true. */
  forceNormals?: boolean;
};

function stemFromFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'model';
  return base.replace(/\.[^/.]+$/, '') || 'model';
}

/**
 * Load a GLB, normalize materials for scene lighting, repair normals, re-export.
 * Used for Trellis `generated.glb` (and other paths that skip decimation) so
 * stored assets are already lit-compatible.
 */
export async function prepareImportedGlb(
  file: File,
  opts: PrepareImportedGlbOptions = {},
): Promise<File> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.glb')) return file;

  const relight = opts.relight !== false;
  const forceNormals = opts.forceNormals !== false;

  const url = URL.createObjectURL(file);
  let scene: THREE.Object3D;
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    scene = gltf.scene;
  } finally {
    URL.revokeObjectURL(url);
  }

  if (forceNormals) {
    recomputeImportedNormals(scene);
  }

  normalizeImportedMaterials(scene, { relight, log: true });

  const exporter = new GLTFExporter();
  const bufferUnknown = await exporter.parseAsync(scene, { binary: true });

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m?.dispose?.();
    }
  });

  if (!(bufferUnknown instanceof ArrayBuffer)) {
    throw new Error('Prepared GLB export did not produce binary data.');
  }

  const stem = stemFromFilename(file.name);
  // Keep generated.glb name so downstream skip/decimation messaging stays consistent.
  const outName = lower === 'generated.glb' ? 'generated.glb' : `${stem}-lit.glb`;

  return new File([bufferUnknown], outName, {
    type: 'model/gltf-binary',
  });
}
