import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { normalizeImportedMaterials } from './normalizeImportedMaterials';

describe('normalizeImportedMaterials', () => {
  it('preserves DoubleSide from glTF doubleSided materials', () => {
    const geo = new THREE.PlaneGeometry(10, 10);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const root = new THREE.Group();
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: true });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.side).toBe(THREE.DoubleSide);
  });

  it('does not overwrite authored vertex normals during relight', () => {
    const geo = new THREE.BoxGeometry(4, 0.5, 4);
    const before = geo.getAttribute('normal')!.clone();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: true });

    const after = geo.getAttribute('normal')!;
    expect(after.count).toBe(before.count);
    expect(after.getX(0)).toBe(before.getX(0));
    expect(after.getY(0)).toBe(before.getY(0));
    expect(after.getZ(0)).toBe(before.getZ(0));
  });
});
