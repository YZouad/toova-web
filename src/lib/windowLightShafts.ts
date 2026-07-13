import * as THREE from 'three';
import { sunLightDirection } from './environment';
import {
  allWallSegments,
  openingWorldPlacement,
  planBounds,
  windowOpenings,
  type RoomGeometry,
} from './roomGeometry';

const SURFACE_EPS = 0.02;
const RAY_EPS = 0.5;
const WINDOW_SUBDIV = 4;

interface RoomHit {
  point: THREE.Vector3;
  t: number;
}

export interface WindowBeam {
  lightDir: THREE.Vector3;
  shaftGeometry: THREE.BufferGeometry;
  splashQuad: THREE.BufferGeometry | null;
}

function lightEntersWindow(lightDir: THREE.Vector3, outward: THREE.Vector3): boolean {
  return lightDir.dot(outward) < 0.02;
}

function rayExitPolygonRoom(
  from: THREE.Vector3,
  dir: THREE.Vector3,
  geom: RoomGeometry,
  sourceWallId: string,
): RoomHit | null {
  const H = geom.height;
  const b = planBounds(geom);
  let bestT = Infinity;

  const consider = (t: number) => {
    if (t <= RAY_EPS || t >= bestT) return;
    bestT = t;
  };

  if (dir.y > 0.0005) consider((H - SURFACE_EPS - from.y) / dir.y);
  if (dir.y < -0.0005) consider((SURFACE_EPS - from.y) / dir.y);

  for (const seg of allWallSegments(geom)) {
    if (seg.wall.id === sourceWallId) continue;
    const ax = seg.start.x;
    const az = seg.start.z;
    const bx = seg.end.x;
    const bz = seg.end.z;
    const edx = bx - ax;
    const edz = bz - az;
    const denom = dir.x * edz - dir.z * edx;
    if (Math.abs(denom) < 1e-6) continue;
    const t = ((ax - from.x) * edz - (az - from.z) * edx) / denom;
    if (t <= RAY_EPS) continue;
    const ix = from.x + dir.x * t;
    const iz = from.z + dir.z * t;
    const segLen2 = edx * edx + edz * edz;
    const u = segLen2 < 1e-6 ? 0 : ((ix - ax) * edx + (iz - az) * edz) / segLen2;
    if (u < -0.01 || u > 1.01) continue;
    consider(t);
  }

  if (!Number.isFinite(bestT)) {
    // Fallback to bounding box
    if (dir.x > 0.0005) consider((b.maxX - SURFACE_EPS - from.x) / dir.x);
    if (dir.x < -0.0005) consider((b.minX + SURFACE_EPS - from.x) / dir.x);
    if (dir.z > 0.0005) consider((b.maxZ - SURFACE_EPS - from.z) / dir.z);
    if (dir.z < -0.0005) consider((b.minZ + SURFACE_EPS - from.z) / dir.z);
  }

  if (!Number.isFinite(bestT)) return null;
  return { point: from.clone().add(dir.clone().multiplyScalar(bestT)), t: bestT };
}

function beamExtent(corners: THREE.Vector3[]): number {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const zs = corners.map((c) => c.z);
  return Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
}

function buildShellShaftGeometry(
  nearPts: THREE.Vector3[],
  farPts: THREE.Vector3[],
  subdiv: number,
): THREE.BufferGeometry {
  const cell = subdiv;
  const positions: number[] = [];
  const beamFactors: number[] = [];
  const lateral: number[] = [];
  const indices: number[] = [];
  const pts = (far: boolean) => (far ? farPts : nearPts);
  const row = (r: number, far: boolean) =>
    Array.from({ length: cell }, (_, c) => pts(far)[r * cell + c]!);

  let vi = 0;
  const addStrip = (nearStrip: THREE.Vector3[], farStrip: THREE.Vector3[]) => {
    const base = vi;
    const n = nearStrip.length;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = nearStrip[i]!;
      const b = farStrip[i]!;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      beamFactors.push(0, 1);
      lateral.push(t, t);
      vi += 2;
    }
    for (let i = 0; i < n - 1; i++) {
      const i0 = base + i * 2;
      indices.push(i0, i0 + 2, i0 + 3, i0, i0 + 3, i0 + 1);
    }
  };

  addStrip(row(0, false), row(0, true));
  addStrip([...row(cell - 1, false)].reverse(), [...row(cell - 1, true)].reverse());
  const col = (c: number, far: boolean) =>
    Array.from({ length: cell }, (_, r) => pts(far)[r * cell + c]!);
  addStrip(col(0, false), col(0, true));
  addStrip([...col(cell - 1, false)].reverse(), [...col(cell - 1, true)].reverse());

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('beamFactor', new THREE.BufferAttribute(new Float32Array(beamFactors), 1));
  geo.setAttribute('lateral', new THREE.BufferAttribute(new Float32Array(lateral), 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createShaftMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      attribute float beamFactor;
      attribute float lateral;
      varying float vBeam;
      varying float vLat;
      void main() {
        vBeam = beamFactor;
        vLat = lateral;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vBeam;
      varying float vLat;
      void main() {
        float along = 1.0 - vBeam;
        float lengthFade = along * along * (1.0 - vBeam * 0.65);
        float edgeFade = smoothstep(0.0, 0.22, vLat) * smoothstep(1.0, 0.78, vLat);
        float alpha = uOpacity * lengthFade * edgeFade;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
}

function buildFarCapGeometry(farPts: THREE.Vector3[], subdiv: number): THREE.BufferGeometry | null {
  if (farPts.length !== subdiv * subdiv) return null;
  const positions: number[] = [];
  const indices: number[] = [];
  const cell = subdiv;
  for (const p of farPts) positions.push(p.x, p.y, p.z);
  const at = (r: number, c: number) => r * cell + c;
  for (let r = 0; r < cell - 1; r++) {
    for (let c = 0; c < cell - 1; c++) {
      const f00 = at(r, c);
      const f10 = at(r + 1, c);
      const f01 = at(r, c + 1);
      const f11 = at(r + 1, c + 1);
      indices.push(f00, f01, f11, f00, f11, f10);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function computeWindowBeams(
  geom: RoomGeometry,
  timeOfDay: number,
  orientationDeg: number,
): WindowBeam[] {
  const [dx, dy, dz] = sunLightDirection(timeOfDay, orientationDeg);
  const lightDir = new THREE.Vector3(dx, dy, dz);
  const beams: WindowBeam[] = [];

  for (const win of windowOpenings(geom)) {
    const p = openingWorldPlacement(geom, win);
    if (!p) continue;
    const outward = new THREE.Vector3(...p.outward);
    if (!lightEntersWindow(lightDir, outward)) continue;

    const seg = allWallSegments(geom).find((s) => s.wall.id === win.wallId);
    if (!seg) continue;

    const [tx, tz] = seg.tangent;
    const hw = p.w / 2;
    const hh = p.h / 2;
    const sill = win.sill ?? 36;
    const baseX = seg.start.x + tx * win.offset;
    const baseZ = seg.start.z + tz * win.offset;

    const corners = [
      new THREE.Vector3(baseX, sill, baseZ),
      new THREE.Vector3(baseX + tx * win.width, sill, baseZ + tz * win.width),
      new THREE.Vector3(baseX + tx * win.width, sill + win.height, baseZ + tz * win.width),
      new THREE.Vector3(baseX, sill + win.height, baseZ),
    ];

    const nearPts: THREE.Vector3[] = [];
    const farPts: THREE.Vector3[] = [];
    let valid = true;

    for (let r = 0; r < WINDOW_SUBDIV; r++) {
      for (let c = 0; c < WINDOW_SUBDIV; c++) {
        const u = c / (WINDOW_SUBDIV - 1);
        const v = r / (WINDOW_SUBDIV - 1);
        const bottom = corners[0]!.clone().lerp(corners[1]!, u);
        const top = corners[3]!.clone().lerp(corners[2]!, u);
        const nearPt = bottom.lerp(top, v);
        const hit = rayExitPolygonRoom(nearPt, lightDir, geom, win.wallId);
        if (!hit) {
          valid = false;
          break;
        }
        nearPts.push(nearPt);
        farPts.push(hit.point);
      }
      if (!valid) break;
    }

    if (!valid || farPts.length !== WINDOW_SUBDIV * WINDOW_SUBDIV) continue;
    if (beamExtent(farPts) < 4) continue;

    beams.push({
      lightDir,
      shaftGeometry: buildShellShaftGeometry(nearPts, farPts, WINDOW_SUBDIV),
      splashQuad: buildFarCapGeometry(farPts, WINDOW_SUBDIV),
    });
  }

  return beams;
}

export function makeRectSplashTexture(hex: string, peakOpacity: number): THREE.CanvasTexture {
  const w = 128;
  const h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.46;
    const ry = h * 0.42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, hexToRgba(hex, peakOpacity));
    g.addColorStop(0.5, hexToRgba(hex, peakOpacity * 0.35));
    g.addColorStop(1, hexToRgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
