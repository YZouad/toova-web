import * as THREE from 'three';

export type NormalizeImportedOptions = {
  /**
   * Soften baked AO / emissive so directional + IBL lights dominate.
   * Default true — AI generators (e.g. Trellis) often bake lighting into maps.
   */
  relight?: boolean;
  /** Log a one-line material summary to the console. Default false. */
  log?: boolean;
};

export type ImportedMaterialSummary = {
  meshCount: number;
  materialCount: number;
  types: Record<string, number>;
  unlitConverted: number;
  missingNormalsRepaired: number;
  emissiveCleared: number;
};

function ensureSrgbMap(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
}

function ensureLinearMap(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
}

function copyCommonMaterialProps(from: THREE.Material, to: THREE.Material) {
  to.name = from.name;
  to.opacity = from.opacity;
  to.transparent = from.transparent;
  to.side = from.side;
  to.alphaTest = from.alphaTest;
  to.depthWrite = from.depthWrite;
  to.depthTest = from.depthTest;
  to.visible = from.visible;
  to.userData = { ...from.userData, toovaNormalized: true };
}

function basicToStandard(basic: THREE.MeshBasicMaterial): THREE.MeshStandardMaterial {
  const std = new THREE.MeshStandardMaterial();
  copyCommonMaterialProps(basic, std);
  std.color.copy(basic.color);
  std.map = basic.map;
  std.alphaMap = basic.alphaMap;
  std.aoMap = basic.aoMap;
  std.lightMap = basic.lightMap;
  std.lightMapIntensity = basic.lightMapIntensity;
  std.roughness = 0.72;
  std.metalness = 0.02;
  std.envMapIntensity = 1.25;
  ensureSrgbMap(std.map);
  ensureLinearMap(std.aoMap);
  return std;
}

function lambertOrPhongToStandard(
  src: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial,
): THREE.MeshStandardMaterial {
  const std = new THREE.MeshStandardMaterial();
  copyCommonMaterialProps(src, std);
  std.color.copy(src.color);
  std.map = src.map;
  std.alphaMap = src.alphaMap;
  std.aoMap = src.aoMap;
  std.normalMap = src.normalMap;
  std.emissive.copy(src.emissive);
  std.emissiveMap = src.emissiveMap;
  std.emissiveIntensity = src.emissiveIntensity;
  std.lightMap = src.lightMap;
  std.lightMapIntensity = src.lightMapIntensity;
  std.roughness = src instanceof THREE.MeshPhongMaterial ? 1 - Math.min(1, src.shininess / 100) : 0.72;
  std.metalness = 0.02;
  std.envMapIntensity = 1.25;
  ensureSrgbMap(std.map);
  ensureSrgbMap(std.emissiveMap);
  ensureLinearMap(std.normalMap);
  ensureLinearMap(std.aoMap);
  return std;
}

function tunePbrMaterial(mat: THREE.MeshStandardMaterial, relight: boolean, stats: ImportedMaterialSummary) {
  ensureSrgbMap(mat.map);
  ensureSrgbMap(mat.emissiveMap);
  ensureLinearMap(mat.normalMap);
  ensureLinearMap(mat.roughnessMap);
  ensureLinearMap(mat.metalnessMap);
  ensureLinearMap(mat.aoMap);
  ensureLinearMap(mat.bumpMap);
  ensureLinearMap(mat.displacementMap);

  if (!mat.roughnessMap && mat.roughness < 0.2 && mat.metalness < 0.15) {
    mat.roughness = 0.68;
  }

  mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, 1.15);

  if (relight) {
    const emissiveLum = mat.emissive.r + mat.emissive.g + mat.emissive.b;
    const hasEmissive =
      (mat.emissiveMap != null && mat.emissiveIntensity > 0.02) ||
      (emissiveLum > 0.04 && mat.emissiveIntensity > 0.02);
    if (hasEmissive) {
      // Generators often put the full shaded look in emissive — disable so lights work.
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveMap = null;
      mat.emissiveIntensity = 0;
      stats.emissiveCleared += 1;
    }
    if (mat.aoMap) {
      mat.aoMapIntensity = Math.min(mat.aoMapIntensity, 0.35);
    }
    if (mat.lightMap) {
      mat.lightMapIntensity = Math.min(mat.lightMapIntensity, 0.25);
    }
    mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.35);
  }

  mat.needsUpdate = true;
}

function ensureMeshNormals(mesh: THREE.Mesh, stats: ImportedMaterialSummary) {
  const geo = mesh.geometry;
  if (!geo) return;
  const normals = geo.getAttribute('normal');
  if (!normals || normals.count === 0) {
    geo.computeVertexNormals();
    stats.missingNormalsRepaired += 1;
  }
}

function bumpTypeCount(stats: ImportedMaterialSummary, typeName: string) {
  stats.types[typeName] = (stats.types[typeName] ?? 0) + 1;
}

/**
 * Make imported GLTF materials respond to scene lights / IBL.
 * Clones materials so the GLTF loader cache is never mutated.
 */
export function normalizeImportedMaterials(
  root: THREE.Object3D,
  opts: NormalizeImportedOptions = {},
): ImportedMaterialSummary {
  const relight = opts.relight !== false;
  const stats: ImportedMaterialSummary = {
    meshCount: 0,
    materialCount: 0,
    types: {},
    unlitConverted: 0,
    missingNormalsRepaired: 0,
    emissiveCleared: 0,
  };

  const remapped = new Map<THREE.Material, THREE.Material>();

  const normalizeOne = (mat: THREE.Material): THREE.Material => {
    const cached = remapped.get(mat);
    if (cached) return cached;

    bumpTypeCount(stats, mat.type);
    stats.materialCount += 1;

    let out: THREE.Material;
    if (mat instanceof THREE.MeshBasicMaterial) {
      out = basicToStandard(mat);
      tunePbrMaterial(out as THREE.MeshStandardMaterial, relight, stats);
      stats.unlitConverted += 1;
    } else if (mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshPhongMaterial) {
      out = lambertOrPhongToStandard(mat);
      tunePbrMaterial(out as THREE.MeshStandardMaterial, relight, stats);
      stats.unlitConverted += 1;
    } else if (mat instanceof THREE.MeshStandardMaterial) {
      const std = mat.clone() as THREE.MeshStandardMaterial;
      tunePbrMaterial(std, relight, stats);
      out = std;
    } else {
      out = mat.clone();
      out.userData = { ...out.userData, toovaNormalized: true };
    }

    remapped.set(mat, out);
    return out;
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    stats.meshCount += 1;
    ensureMeshNormals(obj, stats);
    obj.castShadow = true;
    obj.receiveShadow = true;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => (m ? normalizeOne(m) : m));
    } else if (obj.material) {
      obj.material = normalizeOne(obj.material);
    }
  });

  if (opts.log) {
    console.log('[normalizeImportedMaterials]', stats);
  }

  return stats;
}

/**
 * Force-recompute vertex normals on every mesh (used when skipping decimation
 * for AI-generated GLBs that may ship without usable normals).
 */
export function recomputeImportedNormals(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    obj.geometry.computeVertexNormals();
    count += 1;
  });
  return count;
}
