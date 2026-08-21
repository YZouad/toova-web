import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  normalizeImportedMaterials,
  recomputeImportedNormals,
  geometryNormalsPointInward,
  applyImportedHorizonLook,
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

  it('attenuates baked emissive when relight is on', () => {
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
    expect(out.emissive.getHex()).toBe(0x000000);
    // Original cached material must stay untouched
    expect(mat.emissiveIntensity).toBe(1);
  });

  it('leaves a dim fill on converted unlit materials', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffcc88 }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: true });

    const out = mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(out).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(out.envMapIntensity).toBeGreaterThanOrEqual(1);
    expect(out.side).toBe(THREE.FrontSide);
    expect(out.metalness).toBeLessThanOrEqual(0.04);
  });

  it('keeps vertex colors on generated meshes', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    geo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
    );
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true }),
      ),
    );

    normalizeImportedMaterials(root, { relight: true });

    const out = root.children[0] as THREE.Mesh;
    const mat = out.material as unknown as THREE.MeshStandardMaterial;
    expect(mat.vertexColors).toBe(true);
    expect(mat.color.getHex()).toBe(0xffffff);
  });

  it('lifts a near-black base color when a map is present', () => {
    const map = new THREE.Texture();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, map }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: true });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.color.getHex()).toBe(0xffffff);
  });

  it('strips a generator metalness map so the mesh is not treated as metal', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x668844,
        metalness: 1,
        metalnessMap: new THREE.Texture(),
        roughness: 1,
      }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: false });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.metalnessMap).toBeNull();
    expect(out.metalness).toBeLessThanOrEqual(0.04);
  });

  it('treats omitted glTF metalness (default 1) as dielectric', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 1 }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: false });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.metalness).toBeLessThanOrEqual(0.04);
  });

  it('clamps generator metalness so indoor ambient can light the mesh', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1,
        roughness: 0.1,
      }),
    );
    root.add(mesh);

    normalizeImportedMaterials(root, { relight: true });

    const out = mesh.material as THREE.MeshStandardMaterial;
    expect(out.metalness).toBeLessThanOrEqual(0.04);
    expect(out.roughness).toBeGreaterThanOrEqual(0.62);
    expect(out.metalnessMap).toBeNull();
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

  it('detects inward-facing normals', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    expect(geometryNormalsPointInward(geo)).toBe(false);
    const nrm = geo.getAttribute('normal')!;
    for (let i = 0; i < nrm.count; i++) {
      nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    }
    expect(geometryNormalsPointInward(geo)).toBe(true);
  });

  it('puts grazing-sun imports on the fill layer and midday on the default layer', () => {
    const map = new THREE.Texture();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map, emissiveIntensity: 0.4 }),
    );
    root.add(mesh);

    applyImportedHorizonLook(root, false);
    const lit = mesh.material as THREE.MeshStandardMaterial;
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(lit.envMapIntensity).toBeGreaterThan(1);
    expect(lit.emissiveIntensity).toBe(0);

    applyImportedHorizonLook(root, true);
    expect(mesh.receiveShadow).toBe(true);
    expect(lit.envMapIntensity).toBe(1);
  });
});
