import * as THREE from 'three';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { renderObjectToJpeg } from './thumbnailRenderer';

type BuiltinKind = Exclude<FurnitureKind, 'imported'>;

function box(
  w: number,
  h: number,
  d: number,
  color: string,
  opts?: { metalness?: number; roughness?: number },
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.roughness ?? 0.7,
      metalness: opts?.metalness ?? 0,
    }),
  );
  return mesh;
}

function buildBedGroup(): THREE.Group {
  const def = FURNITURE.bed;
  const [w, bodyH, d] = def.size;
  const legH = def.clearance ?? 8;
  const totalH = bodyH + legH;
  const frameH = Math.min(6, Math.max(1.5, bodyH * 0.4));
  const mattressH = Math.max(1, bodyH - frameH);
  const legR = 1.5;
  const legInset = 2;
  const group = new THREE.Group();

  const legPositions: [number, number][] = [
    [-w / 2 + legInset, -d / 2 + legInset],
    [w / 2 - legInset, -d / 2 + legInset],
    [-w / 2 + legInset, d / 2 - legInset],
    [w / 2 - legInset, d / 2 - legInset],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(legR, legR, legH, 12),
      new THREE.MeshStandardMaterial({ color: '#3a2e22', roughness: 0.6 }),
    );
    leg.position.set(lx, legH / 2, lz);
    group.add(leg);
  }

  const frame = box(w, frameH, d, '#6b4f33');
  frame.position.y = legH + frameH / 2;
  group.add(frame);

  const mattress = box(w - 2, mattressH, d - 2, '#f1ece1', { roughness: 0.9 });
  mattress.position.y = legH + frameH + mattressH / 2;
  group.add(mattress);

  const pillow = box(w - 4, 2, 12, '#dadfe6', { roughness: 0.95 });
  pillow.position.set(0, legH + frameH + mattressH + 1, -d / 2 + 7);
  group.add(pillow);

  group.userData.totalH = totalH;
  return group;
}

function buildDresserGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.dresser.size;
  const group = new THREE.Group();
  const body = box(w, h, d, '#a98662');
  body.position.y = h / 2;
  group.add(body);

  const drawerH = Math.max(0.6, (h - 3) / 3);
  for (let i = 0; i < 3; i++) {
    const cy = 1.5 + drawerH / 2 + i * drawerH;
    const face = box(w - 2, drawerH - 0.5, 0.5, '#a98662');
    face.position.set(0, cy, d / 2 + 0.05);
    group.add(face);
    const handle = box(6, 0.6, 0.6, '#3a2e22', { metalness: 0.2, roughness: 0.5 });
    handle.position.set(0, cy, d / 2 + 0.4);
    group.add(handle);
  }
  return group;
}

function buildWardrobeGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.wardrobe.size;
  const crownH = 2;
  const group = new THREE.Group();
  const body = box(w, h, d, '#8a6f52', { roughness: 0.68 });
  body.position.y = h / 2;
  group.add(body);

  const crown = box(w + 1.5, crownH, d + 1, '#5c4a38', { roughness: 0.55 });
  crown.position.y = h + crownH / 2;
  group.add(crown);

  const doorW = (w - 2) / 2;
  const dz = d / 2 + 0.04;
  for (const side of [-1, 1] as const) {
    const door = box(doorW - 0.5, h - 3, 0.35, '#8a6f52', { roughness: 0.72 });
    door.position.set((side * doorW) / 2, h / 2, dz);
    group.add(door);
    const handle = box(1.2, 10, 0.5, '#2a221a', { metalness: 0.15, roughness: 0.45 });
    handle.position.set((side * doorW) / 2 + side * 2.5, h * 0.45, dz + 0.2);
    group.add(handle);
  }

  const divider = box(1.2, h - 3, 0.4, '#5c4a38', { roughness: 0.6 });
  divider.position.set(0, h / 2, dz);
  group.add(divider);
  return group;
}

function buildDeskGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.desk.size;
  const topT = 1.5;
  const legSize = 1.75;
  const legH = h - topT;
  const inset = 2;
  const group = new THREE.Group();

  const legPositions: [number, number][] = [
    [-w / 2 + inset + legSize / 2, -d / 2 + inset + legSize / 2],
    [w / 2 - inset - legSize / 2, -d / 2 + inset + legSize / 2],
    [-w / 2 + inset + legSize / 2, d / 2 - inset - legSize / 2],
    [w / 2 - inset - legSize / 2, d / 2 - inset - legSize / 2],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = box(legSize, legH, legSize, '#2e261e', { roughness: 0.6 });
    leg.position.set(lx, legH / 2, lz);
    group.add(leg);
  }

  const top = box(w, topT, d, '#8a6440', { roughness: 0.6 });
  top.position.y = legH + topT / 2;
  group.add(top);
  return group;
}

function buildChairGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.chair.size;
  const seatH = Math.max(2, Math.min(18, h * 0.5));
  const seatT = Math.min(1.5, Math.max(0.5, h * 0.12));
  const legSize = 1.2;
  const backH = Math.max(1, h - seatH);
  const group = new THREE.Group();

  for (const [lx, lz] of [
    [-w / 2 + 1, -d / 2 + 1],
    [w / 2 - 1, -d / 2 + 1],
    [-w / 2 + 1, d / 2 - 1],
    [w / 2 - 1, d / 2 - 1],
  ] as [number, number][]) {
    const leg = box(legSize, seatH, legSize, '#1a1a1a', { roughness: 0.5 });
    leg.position.set(lx, seatH / 2, lz);
    group.add(leg);
  }

  const seat = box(w, seatT, d, '#4a5a6c', { roughness: 0.8 });
  seat.position.y = seatH + seatT / 2;
  group.add(seat);

  const back = box(w, backH, 1, '#4a5a6c', { roughness: 0.8 });
  back.position.set(0, seatH + backH / 2, d / 2 - 1);
  group.add(back);
  return group;
}

function buildNightstandGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.nightstand.size;
  const group = new THREE.Group();
  const body = box(w, h, d, '#a98662');
  body.position.y = h / 2;
  group.add(body);

  const drawer = box(w - 2, h * 0.25, 0.5, '#a98662');
  drawer.position.set(0, h * 0.7, d / 2 + 0.05);
  group.add(drawer);

  const handle = box(5, 0.6, 0.6, '#3a2e22', { metalness: 0.2, roughness: 0.5 });
  handle.position.set(0, h * 0.7, d / 2 + 0.4);
  group.add(handle);
  return group;
}

function buildLampGroup(): THREE.Group {
  const [w, h, d] = FURNITURE.lamp.size;
  const group = new THREE.Group();
  const baseR = Math.min(w, d) * 0.4;
  const baseH = h * 0.08;
  const stemH = h * 0.55;
  const shadeH = h * 0.32;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.85, baseR, baseH, 16),
    new THREE.MeshStandardMaterial({ color: '#3a2e22', roughness: 0.55, metalness: 0.15 }),
  );
  base.position.y = baseH / 2;
  group.add(base);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.12, baseR * 0.12, stemH, 12),
    new THREE.MeshStandardMaterial({ color: '#6b6357', roughness: 0.45, metalness: 0.2 }),
  );
  stem.position.y = baseH + stemH / 2;
  group.add(stem);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.45, baseR, shadeH, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#f2e6d4',
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.y = baseH + stemH + shadeH / 2;
  group.add(shade);
  return group;
}

const BUILDERS: Record<BuiltinKind, () => THREE.Group> = {
  bed: buildBedGroup,
  dresser: buildDresserGroup,
  wardrobe: buildWardrobeGroup,
  desk: buildDeskGroup,
  chair: buildChairGroup,
  nightstand: buildNightstandGroup,
  lamp: buildLampGroup,
};

/** Render a builtin furniture kind to a JPEG palette thumbnail. */
export async function generateBuiltinThumbnail(
  kind: BuiltinKind,
): Promise<Blob | null> {
  const build = BUILDERS[kind];
  if (!build) return null;
  const group = build();
  try {
    return await renderObjectToJpeg(group);
  } finally {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        (obj.material as THREE.Material)?.dispose();
      }
    });
  }
}

export const BUILTIN_KINDS = Object.keys(FURNITURE) as BuiltinKind[];
