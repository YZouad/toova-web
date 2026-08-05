import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  normalizeImportedMaterials,
  recomputeImportedNormals,
} from './normalizeImportedMaterials';

describe('normalizeImportedMaterials', () => {
  it('converts MeshBasicMaterial to MeshStandardMaterial', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    );
    root.add(mesh);

    const stats = normalizeImportedMaterials(root, { relight: true });

    expect(stats.unlitConverted).toBe(1);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const mat = mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(mat.envMapIntensity).toBeGreaterThanOrEqual(1);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('clears baked emissive when relight is on', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    root.add(mesh);

    const stats = normalizeImportedMaterials(root, { relight: true });

    expect(stats.emissiveCleared).toBe(1);
    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.emissiveIntensity).toBe(0);
    expect(out.emissive.getHex()).toBe(0);
    // Original cached material must stay untouched
    expect(mat.emissiveIntensity).toBe(1);
  });

  it('leaves emissive alone when relight is off', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.8,
      }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: false });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.emissiveIntensity).toBe(0.8);
  });

  it('repairs missing normals', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    expect(geo.getAttribute('normal')).toBeUndefined();

    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));

    const stats = normalizeImportedMaterials(root);
    expect(stats.missingNormalsRepaired).toBe(1);
    expect(geo.getAttribute('normal')).toBeTruthy();
  });

  it('recomputeImportedNormals forces normals on all meshes', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    expect(recomputeImportedNormals(root)).toBe(1);
  });
});
