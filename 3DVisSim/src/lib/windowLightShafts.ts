import * as THREE from 'three';
import { sunLightDirection } from './environment';
import type { RoomGeometry, WallId } from './roomGeometry';
import { windowWorldPlacement } from './roomGeometry';

const SURFACE_EPS = 0.02;
const RAY_EPS = 0.5;
/** Window opening samples per axis — extra rays land on floor/wall junctions. */
const WINDOW_SUBDIV = 4;

type RoomSurface = 'floor' | 'north' | 'south' | 'east' | 'west' | 'ceiling';

interface RoomHit {
  point: THREE.Vector3;
  surface: RoomSurface;
  t: number;
}

export interface WindowBeam {
  lightDir: THREE.Vector3;
  shaftGeometry: THREE.BufferGeometry;
  splashQuad: THREE.BufferGeometry | null;
}

/** Parallel rays enter the room when they travel opposite to the wall outward normal. */
function lightEntersWindow(lightDir: THREE.Vector3, outward: THREE.Vector3): boolean {
  return lightDir.dot(outward) < 0.02;
}

function wallAxes(wall: WallId): { right: THREE.Vector3; up: THREE.Vector3 } {
  switch (wall) {
    case 'north':
    case 'south':
      return { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) };
    case 'west':
    case 'east':
      return { right: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
  }
}

function corner(
  center: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  sx: number,
  sy: number,
): THREE.Vector3 {
  return center
    .clone()
    .add(right.clone().multiplyScalar(sx))
    .add(up.clone().multiplyScalar(sy));
}

/** Where a ray leaves the room box — handles wall/floor/ceiling edges and corners. */
function rayExitRoom(
  from: THREE.Vector3,
  dir: THREE.Vector3,
  geom: RoomGeometry,
  sourceWall: WallId,
): RoomHit | null {
  const { width: W, depth: D, height: H } = geom;
  let bestT = Infinity;
  let bestSurface: RoomSurface | null = null;

  const consider = (t: number, surface: RoomSurface) => {
    if (t <= RAY_EPS || t >= bestT) return;
    bestT = t;
    bestSurface = surface;
  };

  if (dir.x > 0.0005) consider((W - SURFACE_EPS - from.x) / dir.x, 'east');
  if (dir.x < -0.0005 && sourceWall !== 'west') consider((SURFACE_EPS - from.x) / dir.x, 'west');

  if (dir.y > 0.0005) consider((H - SURFACE_EPS - from.y) / dir.y, 'ceiling');
  if (dir.y < -0.0005) consider((SURFACE_EPS - from.y) / dir.y, 'floor');

  if (dir.z > 0.0005 && sourceWall !== 'north') consider((D - SURFACE_EPS - from.z) / dir.z, 'north');
  if (dir.z < -0.0005 && sourceWall !== 'south') consider((SURFACE_EPS - from.z) / dir.z, 'south');

  if (bestSurface == null || !Number.isFinite(bestT)) return null;

  const raw = from.clone().add(dir.clone().multiplyScalar(bestT));
  return { point: snapBoundaryPoint(raw, geom), surface: bestSurface, t: bestT };
}

/** Snap to inner faces; points near edges land on the edge/corner. */
function snapBoundaryPoint(raw: THREE.Vector3, geom: RoomGeometry): THREE.Vector3 {
  const { width: W, depth: D, height: H } = geom;
  const edge = 0.35;
  const snap1 = (v: number, lo: number, hi: number) => {
    if (v - lo <= edge) return lo;
    if (hi - v <= edge) return hi;
    return Math.max(lo, Math.min(hi, v));
  };
  return new THREE.Vector3(
    snap1(raw.x, SURFACE_EPS, W - SURFACE_EPS),
    snap1(raw.y, SURFACE_EPS, H - SURFACE_EPS),
    snap1(raw.z, SURFACE_EPS, D - SURFACE_EPS),
  );
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

function sampleWindow(
  u: number,
  v: number,
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
): THREE.Vector3 {
  const bottom = corners[0].clone().lerp(corners[1], u);
  const top = corners[3].clone().lerp(corners[2], u);
  return bottom.lerp(top, v);
}

/** Outer shell only (4 sides, no end cap) — avoids overlapping additive faces. */
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

  const gridAt = (r: number, c: number) => r * cell + c;
  const pts = (far: boolean) => (far ? farPts : nearPts);
  const row = (r: number, far: boolean) =>
    Array.from({ length: cell }, (_, c) => pts(far)[gridAt(r, c)]!);
  const col = (c: number, far: boolean) =>
    Array.from({ length: cell }, (_, r) => pts(far)[gridAt(r, c)]!);

  let vi = 0;

  const addStrip = (nearStrip: THREE.Vector3[], farStrip: THREE.Vector3[]) => {
    const base = vi;
    const n = nearStrip.length;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = nearStrip[i]!;
      const b = farStrip[i]!;
      positions.push(a.x, a.y, a.z);
      beamFactors.push(0);
      lateral.push(t);
      positions.push(b.x, b.y, b.z);
      beamFactors.push(1);
      lateral.push(t);
      vi += 2;
    }
    for (let i = 0; i < n - 1; i++) {
      const i0 = base + i * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      indices.push(i0, i2, i3, i0, i3, i1);
    }
  };

  addStrip(row(0, false), row(0, true));
  addStrip([...row(cell - 1, false)].reverse(), [...row(cell - 1, true)].reverse());
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
  const farOff = 0;

  for (const p of farPts) positions.push(p.x, p.y, p.z);
  const at = (r: number, c: number) => farOff + r * cell + c;

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

  for (const win of geom.windows) {
    const p = windowWorldPlacement(geom, win);
    const outward = new THREE.Vector3(...p.outward);
    const wallCenter = new THREE.Vector3(p.cx, p.cy, p.cz);

    if (!lightEntersWindow(lightDir, outward)) continue;

    const { right, up } = wallAxes(win.wall);
    const hw = p.w * 0.5;
    const hh = p.h * 0.5;

    const near = [
      corner(wallCenter, right, up, -hw, -hh),
      corner(wallCenter, right, up, hw, -hh),
      corner(wallCenter, right, up, hw, hh),
      corner(wallCenter, right, up, -hw, hh),
    ] as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];

    const nearPts: THREE.Vector3[] = [];
    const farPts: THREE.Vector3[] = [];
    let valid = true;

    for (let r = 0; r < WINDOW_SUBDIV; r++) {
      for (let c = 0; c < WINDOW_SUBDIV; c++) {
        const u = c / (WINDOW_SUBDIV - 1);
        const v = r / (WINDOW_SUBDIV - 1);
        const nearPt = sampleWindow(u, v, near);
        const hit = rayExitRoom(nearPt, lightDir, geom, win.wall);
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

    const shaftGeometry = buildShellShaftGeometry(nearPts, farPts, WINDOW_SUBDIV);
    const splashQuad = buildFarCapGeometry(farPts, WINDOW_SUBDIV);

    beams.push({
      lightDir,
      shaftGeometry,
      splashQuad,
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
