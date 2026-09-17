import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyImportedDualToneTint,
  importedDualToneFurniture,
  meshIsImportedTop,
} from './importedDualTone';
import type { Item } from '../store';

function deskItem(label: string): Pick<Item, 'kind' | 'label' | 'catalogKind'> {
  return { kind: 'imported', label, catalogKind: undefined };
}

describe('importedDualTone', () => {
  it('detects Max-P and other imported desks', () => {
    expect(importedDualToneFurniture(deskItem('Max-P desk'))).toBe(true);
    expect(importedDualToneFurniture(deskItem('Single Desk'))).toBe(true);
    expect(importedDualToneFurniture(deskItem('Study desk'))).toBe(true);
    expect(importedDualToneFurniture({ kind: 'imported', label: 'Lamp', catalogKind: 'desk' })).toBe(
      true,
    );
    expect(importedDualToneFurniture(deskItem('Rug'))).toBe(false);
  });

  it('classifies thin upper meshes as the desktop', () => {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 1.5, 20));
    top.position.y = 28;
    top.name = 'desktop';
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2));
    leg.position.y = 13;
    leg.name = 'leg';
    group.add(top, leg);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    expect(meshIsImportedTop(top, box)).toBe(true);
    expect(meshIsImportedTop(leg, box)).toBe(false);
  });

  it('does not treat upper drawer fronts as the desktop', () => {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 1.5, 20));
    top.position.y = 28;
    top.name = 'desktop';
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 12));
    drawer.position.y = 22;
    drawer.name = 'drawer_front';
    group.add(top, drawer);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    expect(meshIsImportedTop(top, box)).toBe(true);
    expect(meshIsImportedTop(drawer, box)).toBe(false);
  });

  it('replaces textured vertex-color drawer fronts with a solid base tint', () => {
    const group = new THREE.Group();
    const drawer = new THREE.Mesh(
      new THREE.BoxGeometry(14, 1.2, 12),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: new THREE.Texture(),
        vertexColors: true,
      }),
    );
    drawer.position.y = 22;
    drawer.name = 'drawer_front';
    group.add(drawer);
    group.updateMatrixWorld(true);

    applyImportedDualToneTint(group, { baseHex: '#6b7f6a' });

    const mat = drawer.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('6b7f6a');
    expect(mat.map).toBeNull();
    expect(mat.vertexColors).toBe(false);
  });

  it('tints separate desktop slab and edge meshes with the top color', () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(36, 28, 21),
      new THREE.MeshStandardMaterial({ color: '#888888' }),
    );
    body.position.y = 14;
    body.name = 'body';
    const desktop = new THREE.Mesh(
      new THREE.BoxGeometry(36, 1.2, 21),
      new THREE.MeshStandardMaterial({ color: '#aa00ff' }),
    );
    desktop.position.y = 29;
    desktop.name = 'laminate_top';
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(36, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: '#aa00ff' }),
    );
    edge.position.set(0, 29.2, 10.5);
    edge.name = 'edge_trim';
    group.add(body, desktop, edge);
    group.updateMatrixWorld(true);

    applyImportedDualToneTint(group, { baseHex: '#a98662', topHex: '#3a3a3a' });

    expect((body.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('a98662');
    expect((desktop.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('3a3a3a');
    expect((edge.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('3a3a3a');
  });

  it('height-splits a monolithic single-desk shell into base and desktop colors', () => {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(36, 30, 21),
      new THREE.MeshStandardMaterial({ color: '#ffffff', map: new THREE.Texture() }),
    );
    shell.position.y = 15;
    shell.name = 'Single_Desk';
    group.add(shell);
    group.updateMatrixWorld(true);

    applyImportedDualToneTint(group, { baseHex: '#a98662', topHex: '#3a3a3a' });

    const mat = shell.material as THREE.MeshStandardMaterial;
    expect(mat.onBeforeCompile).toBeTypeOf('function');
    expect(mat.map).toBeNull();
  });
});
