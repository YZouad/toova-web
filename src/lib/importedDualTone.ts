import * as THREE from 'three';
import type { Item } from '../store';

const TOP_NAME_RE =
  /\b(top|desktop|tabletop|table_top|worktop|surface|counter|laminate|benchtop|edge|trim|band|cap)\b/i;
const BASE_NAME_RE =
  /\b(base|body|frame|leg|legs|drawer|drawers|side|sides|cabinet|shelf|apron|panel|front|face|facade|pull|knob|handle)\b/i;
const DESK_HARDWARE_RE = /\b(drawer|drawers|pull|knob|handle)\b/i;

/** Imported dorm desks/dressers with a separate laminate top mesh. */
export function importedDualToneFurniture(
  item: Pick<Item, 'kind' | 'label' | 'catalogKind'>,
): boolean {
  if (item.kind !== 'imported') return false;
  const hay = `${item.label ?? ''} ${item.catalogKind ?? ''}`.toLowerCase();
  return /\bdesk\b/.test(hay) || /\bdresser\b/.test(hay);
}

export function importedDualToneKind(
  item: Pick<Item, 'label' | 'catalogKind'>,
): 'desk' | 'dresser' {
  const hay = `${item.label ?? ''} ${item.catalogKind ?? ''}`.toLowerCase();
  return /\bdresser\b/.test(hay) ? 'dresser' : 'desk';
}

function meshLabel(mesh: THREE.Mesh): string {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const matNames = mats.map((m) => m?.name ?? '').join(' ');
  // GLB exporters use underscores — treat them as word breaks for name heuristics.
  return `${mesh.name} ${matNames}`.replace(/_/g, ' ');
}

function meshBounds(mesh: THREE.Mesh, modelBox: THREE.Box3) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const modelH = modelBox.max.y - modelBox.min.y;
  const relTop = modelH > 0 ? (box.max.y - modelBox.min.y) / modelH : 0;
  const relBottom = modelH > 0 ? (box.min.y - modelBox.min.y) / modelH : 0;
  return { box, size, modelH, relTop, relBottom };
}

function meshLooksThinHorizontal(mesh: THREE.Mesh, modelBox: THREE.Box3): boolean {
  const { size, modelH, relTop } = meshBounds(mesh, modelBox);
  if (modelH <= 0) return false;
  const thin = size.y <= Math.max(0.6, Math.min(size.x, size.z) * 0.55);
  return thin && relTop >= 0.75;
}

/** Mesh sits in the upper desk zone (laminate slab, edge band, trim cap). */
function meshInDesktopZone(mesh: THREE.Mesh, modelBox: THREE.Box3): boolean {
  const label = meshLabel(mesh);
  if (DESK_HARDWARE_RE.test(label)) return false;
  const { box, size, modelH, relBottom } = meshBounds(mesh, modelBox);
  if (modelH <= 0) return false;
  const nearModelTop = box.max.y >= modelBox.max.y - modelH * 0.05;
  const mostlyUpper = relBottom >= 0.68;
  const notFullHeight = size.y <= modelH * 0.4;
  return nearModelTop && mostlyUpper && notFullHeight;
}

/**
 * Every mesh that should receive the desktop / laminate color as a solid tint.
 * Includes separate top slabs, edge bands, and trim caps on catalog desks.
 */
export function resolveAllDesktopMeshes(
  meshes: THREE.Mesh[],
  modelBox: THREE.Box3,
): Set<THREE.Mesh> {
  const tops = new Set<THREE.Mesh>();

  for (const mesh of meshes) {
    const label = meshLabel(mesh);
    if (DESK_HARDWARE_RE.test(label)) continue;
    if (TOP_NAME_RE.test(label) && !BASE_NAME_RE.test(label)) tops.add(mesh);
  }

  for (const mesh of meshes) {
    if (DESK_HARDWARE_RE.test(meshLabel(mesh))) continue;
    if (meshLooksThinHorizontal(mesh, modelBox)) tops.add(mesh);
  }

  for (const mesh of meshes) {
    if (meshInDesktopZone(mesh, modelBox)) tops.add(mesh);
  }

  return tops;
}

/** Resolve which meshes are the desktop / laminate top (at most one heuristic slab). */
export function resolveImportedTopMeshes(
  meshes: THREE.Mesh[],
  modelBox: THREE.Box3,
): Set<THREE.Mesh> {
  return resolveAllDesktopMeshes(meshes, modelBox);
}

/** Classify a mesh as the desktop / laminate top vs the base frame. */
export function meshIsImportedTop(mesh: THREE.Mesh, modelBox: THREE.Box3): boolean {
  const meshes: THREE.Mesh[] = [];
  mesh.parent?.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  if (meshes.length === 0) meshes.push(mesh);
  return resolveAllDesktopMeshes(meshes, modelBox).has(mesh);
}

const DESK_SHELL_RE = /\b(desk|dresser|cabinet|body|shell|mesh|object)\b/i;
const DESK_PART_RE = /\b(drawer|drawers|leg|legs|pull|knob|handle|shelf|apron|panel|front)\b/i;

/** One mesh spans the pedestal + desktop (common on catalog single desks). */
function meshNeedsHeightSplit(mesh: THREE.Mesh, modelBox: THREE.Box3): boolean {
  const label = meshLabel(mesh);
  if (DESK_PART_RE.test(label)) return false;
  const { size, modelH } = meshBounds(mesh, modelBox);
  if (modelH <= 0) return false;
  if (meshLooksThinHorizontal(mesh, modelBox)) return false;
  if (size.y < modelH * 0.4) return false;
  return DESK_SHELL_RE.test(label) || size.y >= modelH * 0.45;
}

function primaryDeskShellMesh(
  meshes: THREE.Mesh[],
  desktopMeshes: Set<THREE.Mesh>,
): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestVol = 0;
  for (const mesh of meshes) {
    if (desktopMeshes.has(mesh)) continue;
    if (DESK_PART_RE.test(meshLabel(mesh))) continue;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const vol = size.x * size.y * size.z;
    if (vol > bestVol) {
      bestVol = vol;
      best = mesh;
    }
  }
  return best;
}

/** Local-space Y above which vertices use the desktop color (top ~15% of mesh height). */
function meshLocalDesktopCutoff(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return 0;
  const h = bb.max.y - bb.min.y;
  return bb.min.y + h * 0.85;
}

function tintMeshHeightSplit(
  mesh: THREE.Mesh,
  baseHex: string,
  topHex: string,
  cutoffLocalY: number,
): void {
  const src = mesh.material;
  const list = Array.isArray(src) ? src : [src];
  const baseColor = new THREE.Color(baseHex);
  const topColor = new THREE.Color(topHex);
  const next = list.map((mat) => {
    if (!mat) return mat;
    const cloned = mat.clone();
    if (!(cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial)) {
      if ('color' in cloned && cloned.color instanceof THREE.Color) cloned.color.set(baseHex);
      return cloned;
    }
    cloned.map = null;
    cloned.emissiveMap = null;
    cloned.aoMap = null;
    cloned.lightMap = null;
    cloned.vertexColors = false;
    cloned.color.set('#ffffff');
    cloned.emissive.set(0, 0, 0);
    cloned.emissiveIntensity = 0;
    const cacheKey = `height-split-v3:${baseHex}:${topHex}:${cutoffLocalY.toFixed(3)}`;
    cloned.customProgramCacheKey = () => cacheKey;
    cloned.onBeforeCompile = (shader) => {
      shader.uniforms.uBaseColor = { value: baseColor };
      shader.uniforms.uTopColor = { value: topColor };
      shader.uniforms.uCutoffLocalY = { value: cutoffLocalY };
      shader.vertexShader = `varying float vSplitLocalY;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSplitLocalY = transformed.y;`,
      );
      shader.fragmentShader =
        `varying float vSplitLocalY;
uniform vec3 uBaseColor;
uniform vec3 uTopColor;
uniform float uCutoffLocalY;
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = vSplitLocalY >= uCutoffLocalY ? uTopColor : uBaseColor;`,
      );
    };
    cloned.needsUpdate = true;
    return cloned;
  });
  mesh.material = Array.isArray(src) ? next : next[0]!;
}

function tintMeshMaterial(mesh: THREE.Mesh, hex: string): void {
  const src = mesh.material;
  const list = Array.isArray(src) ? src : [src];
  const next = list.map((mat) => {
    if (!mat) return mat;
    const cloned = mat.clone();
    if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
      cloned.map = null;
      cloned.emissiveMap = null;
      cloned.aoMap = null;
      cloned.lightMap = null;
      cloned.vertexColors = false;
      cloned.color.set(hex);
      cloned.emissive.set(0, 0, 0);
      cloned.emissiveIntensity = 0;
      cloned.needsUpdate = true;
    } else if ('color' in cloned && cloned.color instanceof THREE.Color) {
      cloned.color.set(hex);
    }
    return cloned;
  });
  mesh.material = Array.isArray(src) ? next : next[0]!;
}

/**
 * Tint base and top meshes independently on imported GLBs (e.g. Max-P desk).
 * Omitted colors leave that region at the model's authored materials.
 */
export function applyImportedDualToneTint(
  root: THREE.Object3D,
  opts: { baseHex?: string; topHex?: string },
): void {
  if (!opts.baseHex && !opts.topHex) return;
  root.updateMatrixWorld(true);
  const modelBox = new THREE.Box3().setFromObject(root);
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  const desktopMeshes = resolveAllDesktopMeshes(meshes, modelBox);
  const heightSplitMeshes = new Set<THREE.Mesh>();

  if (opts.baseHex && opts.topHex) {
    if (desktopMeshes.size === 0) {
      for (const mesh of meshes) {
        if (meshNeedsHeightSplit(mesh, modelBox)) heightSplitMeshes.add(mesh);
      }
      if (heightSplitMeshes.size === 0) {
        const primary = primaryDeskShellMesh(meshes, desktopMeshes);
        if (primary) heightSplitMeshes.add(primary);
      }
    }
  }

  for (const mesh of meshes) {
    if (desktopMeshes.has(mesh)) {
      if (opts.topHex) tintMeshMaterial(mesh, opts.topHex);
      continue;
    }
    if (heightSplitMeshes.has(mesh)) {
      tintMeshHeightSplit(mesh, opts.baseHex!, opts.topHex!, meshLocalDesktopCutoff(mesh));
      continue;
    }
    if (opts.baseHex) tintMeshMaterial(mesh, opts.baseHex);
  }
}
