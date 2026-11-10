import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { twoBedroomApartmentPlan } from '../lib/apartmentTemplates';
import {
  allWallSegments,
  doorOpenings,
  holesForWallSegment,
  openingWorldPlacement,
  rectanglePlan,
} from '../lib/floorPlanGeometry';
import { DEFAULT_APPEARANCE } from '../lib/roomAppearance';
import { ROOM } from '../units';
import { buildDollhouseCapGeometry } from './DollhouseWallCaps';
import { doorPartBoxes } from './Openings';
import {
  localSpanForTrim,
  spansMinusDoors,
  wallEndTrims,
} from './wallJoins';

const T = ROOM.wallThickness;

function expectedCapArea(geom: Parameters<typeof buildDollhouseCapGeometry>[0]): number {
  const segments = allWallSegments(geom);
  const trims = wallEndTrims(segments, T);
  let area = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const span = localSpanForTrim(seg, trims[i]!);
    const doors = holesForWallSegment(geom, seg).filter((h) => h.kind === 'door');
    for (const [x0, x1] of spansMinusDoors(span.x0, span.x1, doors)) {
      area += (x1 - x0) * T;
    }
  }
  for (const door of doorOpenings(geom)) {
    const p = openingWorldPlacement(geom, door);
    if (!p) continue;
    const hinge = door.hinge === 'left' ? 'left' : 'right';
    const layout = doorPartBoxes(p.w, p.h, T, hinge, true);
    for (const kind of ['leftJamb', 'rightJamb', 'leaf'] as const) {
      const box = layout.boxes.find((b) => b.kind === kind);
      if (box) area += box.size[0] * box.size[2];
    }
  }
  return area;
}

function triangleNormalsY(geo: THREE.BufferGeometry): number[] {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!index) return [];
  const out: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    out.push(n.y);
  }
  return out;
}

function meshArea(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!index) return 0;
  let area = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    area += 0.5 * ab.cross(ac).length();
  }
  return area;
}

describe('buildDollhouseCapGeometry', () => {
  it('winds every triangle so the face normal points up', () => {
    for (const plan of [rectanglePlan(120, 96, 96, false), twoBedroomApartmentPlan()]) {
      const geo = buildDollhouseCapGeometry(plan, DEFAULT_APPEARANCE);
      const ys = triangleNormalsY(geo);
      expect(ys.length).toBeGreaterThan(0);
      for (const y of ys) expect(y).toBeGreaterThan(0);
      geo.dispose();
    }
  });

  it('covers wall footprints plus closed-door jamb and leaf tops', () => {
    for (const plan of [rectanglePlan(120, 96, 96, false), twoBedroomApartmentPlan()]) {
      const geo = buildDollhouseCapGeometry(plan, DEFAULT_APPEARANCE);
      expect(meshArea(geo)).toBeCloseTo(expectedCapArea(plan), 0);
      geo.dispose();
    }
  });

  it('adds door caps on the 2-bedroom plan', () => {
    const plan = twoBedroomApartmentPlan();
    expect(doorOpenings(plan).length).toBeGreaterThan(0);
    const withDoors = expectedCapArea(plan);
    const wallOnly = (() => {
      const segments = allWallSegments(plan);
      const trims = wallEndTrims(segments, T);
      let area = 0;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        const span = localSpanForTrim(seg, trims[i]!);
        const doors = holesForWallSegment(plan, seg).filter((h) => h.kind === 'door');
        for (const [x0, x1] of spansMinusDoors(span.x0, span.x1, doors)) {
          area += (x1 - x0) * T;
        }
      }
      return area;
    })();
    expect(withDoors).toBeGreaterThan(wallOnly);
    const geo = buildDollhouseCapGeometry(plan, DEFAULT_APPEARANCE);
    expect(meshArea(geo)).toBeCloseTo(withDoors, 0);
    geo.dispose();
  });
});
