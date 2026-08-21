import * as THREE from 'three';

export type NormalizeImportedOptions = {
  /**
   * Soften baked AO / strong emissive so directional + IBL lights dominate.
   * Keeps a dim emissive floor so AI-generated meshes don't go black.
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
  if ('vertexColors' in to) {
    (to as THREE.MeshStandardMaterial).vertexColors = from.vertexColors;
  }
}

function basicToStandard(basic: THREE.MeshBasicMaterial): THREE.MeshStandardMaterial {
  const std = new THREE.MeshStandardMaterial();
  copyCommonMaterialProps(basic, std);
  std.color.copy(basic.color);
  std.map = basic.map;
  if (std.map && std.color.r + std.color.g + std.color.b < 0.25) {
    std.color.setRGB(1, 1, 1);
  }
  std.alphaMap = basic.alphaMap;
  std.aoMap = basic.aoMap;
  std.lightMap = basic.lightMap;
  std.lightMapIntensity = basic.lightMapIntensity;
  std.roughness = 0.72;
  std.metalness = 0.02;
  std.envMapIntensity = 1;
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
  std.envMapIntensity = 1;
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

  mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, 1);

  // glTF default metallicFactor is 1 when omitted. Photo-to-3D meshes omit it
  // and also omit normals — they render as black rough metal indoors.
  mat.metalnessMap = null;
  mat.metalness = Math.min(mat.metalness, 0.04);
  if (!mat.roughnessMap && mat.roughness < 0.45) mat.roughness = 0.62;

  if (relight) {
    const emissiveLum = mat.emissive.r + mat.emissive.g + mat.emissive.b;
    const hasEmissive =
      (mat.emissiveMap != null && mat.emissiveIntensity > 0.02) ||
      (emissiveLum > 0.04 && mat.emissiveIntensity > 0.02);
    if (hasEmissive) {
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveMap = null;
      mat.emissiveIntensity = 0;
      stats.emissiveCleared += 1;
    }
    if (mat.aoMap) {
      mat.aoMapIntensity = Math.min(mat.aoMapIntensity, 0.15);
    }
    if (mat.lightMap) {
      mat.lightMapIntensity = Math.min(mat.lightMapIntensity, 0.15);
    }
    mat.metalnessMap = null;
    mat.metalness = Math.min(mat.metalness, 0.04);
    // Keep vertex colors — Trellis often stores the whole albedo there.
    // Exporters sometimes set baseColor [0,0,0] * a texture → pitch black.
    if (mat.map && mat.color.r + mat.color.g + mat.color.b < 0.25) {
      mat.color.setRGB(1, 1, 1);
    }
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      mat.transmission = 0;
      mat.thickness = 0;
    }
    // DoubleSide shows inner hulls as black on blob meshes (sofas, plants).
    mat.side = THREE.FrontSide;
    if (mat.opacity >= 0.98) {
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
    }
  }

  mat.needsUpdate = true;
}

function flipGeometryWinding(geo: THREE.BufferGeometry) {
  const idx = geo.getIndex();
  if (idx) {
    const arr = idx.array;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
  const nrm = geo.getAttribute('normal');
  if (nrm) {
    for (let i = 0; i < nrm.count; i++) {
      nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    }
    nrm.needsUpdate = true;
  }
}

/** True when sampled normals mostly point toward the mesh centroid (inside-out). */
export function geometryNormalsPointInward(geo: THREE.BufferGeometry): boolean {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  if (!pos || !nrm || pos.count < 3) return false;
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const toP = new THREE.Vector3();
  let inward = 0;
  let outward = 0;
  const step = Math.max(1, Math.floor(pos.count / 256));
  for (let i = 0; i < pos.count; i += step) {
    p.fromBufferAttribute(pos as THREE.BufferAttribute, i);
    n.fromBufferAttribute(nrm as THREE.BufferAttribute, i);
    toP.subVectors(p, center);
    if (n.dot(toP) < 0) inward += 1;
    else outward += 1;
  }
  return inward > outward * 1.4;
}

function ensureMeshNormals(mesh: THREE.Mesh, stats: ImportedMaterialSummary, relight: boolean) {
  const geo = mesh.geometry;
  if (!geo) return;
  const normals = geo.getAttribute('normal');
  if (!normals || normals.count === 0 || relight) {
    geo.computeVertexNormals();
    if (!normals || normals.count === 0) stats.missingNormalsRepaired += 1;
  }
  if (relight && geometryNormalsPointInward(geo)) {
    flipGeometryWinding(geo);
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
    ensureMeshNormals(obj, stats, relight);
    obj.castShadow = true;
    obj.receiveShadow = true;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => (m ? normalizeOne(m) : m));
    } else if (obj.material) {
      obj.material = normalizeOne(obj.material);
    }

    const hasVertexColor = obj.geometry?.getAttribute('color') != null;
    if (hasVertexColor) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (!(m instanceof THREE.MeshStandardMaterial)) return m;
        const out = m.vertexColors ? m : m.clone();
        out.vertexColors = true;
        if (out.color.r + out.color.g + out.color.b < 0.6) out.color.setRGB(1, 1, 1);
        return out;
      });
      obj.material = Array.isArray(obj.material) ? next : next[0]!;
    }

    if (!obj.geometry?.getAttribute('uv2')) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial && m.aoMap) m.aoMap = null;
      }
    }
  });

  if (opts.log) {
    console.log('[normalizeImportedMaterials]', stats);
  }

  return stats;
}

/**
 * Photo-to-3D meshes self-shadow / lose top lighting under a grazing sun.
 * Stay on the default layer; skip receiving wall/roof shadows while the sun
 * is low. A room skylight covers the missing N·L on upward faces.
 */
export function applyImportedHorizonLook(
  root: THREE.Object3D,
  receiveShadows: boolean,
): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.layers.set(0);
    obj.receiveShadow = receiveShadows;
    obj.castShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.envMapIntensity = receiveShadows ? 1 : 1.4;
      m.emissive.setRGB(0, 0, 0);
      m.emissiveMap = null;
      m.emissiveIntensity = 0;
      m.needsUpdate = true;
    }
  });
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
