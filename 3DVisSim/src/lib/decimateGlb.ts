import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

export type DecimateGlbResult = {
  file: File;
  /** Total triangles across all meshes (including skinned meshes). */
  originalTriangles: number;
  /** Triangle count after decimation on static meshes (same as original if unchanged). */
  finalTriangles: number;
  /** True when file was not .glb — returned unchanged without counting triangles. */
  skipped?: boolean;
};

function triangleCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  return Math.floor(position.count / 3);
}

function sceneTriangleTotal(root: THREE.Object3D): number {
  let sum = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      sum += triangleCount(obj.geometry);
    }
  });
  return sum;
}

function collectStaticMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) return;
    if (obj instanceof THREE.Mesh && obj.geometry) meshes.push(obj);
  });
  return meshes;
}

function stemFromFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'model';
  return base.replace(/\.[^/.]+$/, '') || 'model';
}

/**
 * Loads a GLB, reduces triangle count on non-skinned meshes to ≤ maxTriangles, re-exports GLB.
 * `.gltf` files are returned unchanged (`skipped: true`) — external buffers are not handled here.
 */
export async function decimateGlb(
  file: File,
  maxTriangles = 50_000,
): Promise<DecimateGlbResult> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.glb')) {
    return {
      file,
      originalTriangles: 0,
      finalTriangles: 0,
      skipped: true,
    };
  }

  const url = URL.createObjectURL(file);
  let scene: THREE.Object3D;
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    scene = gltf.scene;
  } finally {
    URL.revokeObjectURL(url);
  }

  const originalTriangles = sceneTriangleTotal(scene);
  if (originalTriangles <= maxTriangles) {
    return {
      file,
      originalTriangles,
      finalTriangles: originalTriangles,
    };
  }

  const staticMeshes = collectStaticMeshes(scene);
  if (staticMeshes.length === 0) {
    throw new Error(
      'Cannot simplify this model below the polygon limit (only skinned meshes found — client-side decimation is not supported).',
    );
  }

  const simplify = new SimplifyModifier();
  const maxIterations = 48;

  for (let iter = 0; iter < maxIterations; iter++) {
    const total = sceneTriangleTotal(scene);
    if (total <= maxTriangles) break;

    const excess = total - maxTriangles;
    const collapseBudget = Math.max(
      16,
      Math.min(Math.ceil(excess * 0.42), Math.ceil(total * 0.35)),
    );

    for (const mesh of staticMeshes) {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const Ti = triangleCount(geo);
      if (Ti < 4) continue;

      let collapses = Math.floor((collapseBudget * Ti) / total);
      collapses = Math.min(collapses, Math.max(1, Math.floor(Ti * 0.65)));
      collapses = Math.max(collapses, excess > maxTriangles * 0.05 ? 1 : 0);
      if (collapses <= 0) continue;

      try {
        const simplified = simplify.modify(geo, collapses) as THREE.BufferGeometry;
        geo.dispose();
        mesh.geometry = simplified;
        mesh.geometry.computeVertexNormals();
      } catch {
        /* Non-standard geometry — skip this mesh */
      }
    }
  }

  const finalTriangles = sceneTriangleTotal(scene);
  if (finalTriangles > maxTriangles) {
    throw new Error(
      `Could not reduce mesh to ${maxTriangles.toLocaleString()} triangles or fewer. Try a simpler model.`,
    );
  }
  const exporter = new GLTFExporter();
  const bufferUnknown = await exporter.parseAsync(scene, { binary: true });
  if (!(bufferUnknown instanceof ArrayBuffer)) {
    throw new Error('GLTF export did not produce binary GLB data.');
  }

  const stem = stemFromFilename(file.name);
  const outFile = new File([bufferUnknown], `${stem}-50k.glb`, {
    type: 'model/gltf-binary',
  });

  return {
    file: outFile,
    originalTriangles,
    finalTriangles,
  };
}
