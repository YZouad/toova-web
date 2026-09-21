import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickMeasureSurface } from './measurePick';

function makeScene() {
  const scene = new THREE.Scene();

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(100, 1, 100),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  floor.position.y = -0.5;
  scene.add(floor);

  const haze = new THREE.Mesh(
    new THREE.BoxGeometry(90, 90, 90),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  haze.position.set(0, 45, 0);
  haze.userData = { measurePick: false };
  scene.add(haze);

  const gizmo = new THREE.Mesh(
    new THREE.SphereGeometry(2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  );
  gizmo.position.set(0, 10, 0);
  gizmo.userData = { measureGizmo: true };
  scene.add(gizmo);

  scene.updateMatrixWorld(true);
  return { scene, floor };
}

describe('pickMeasureSurface', () => {
  it('hits the floor and skips measurePick:false helpers', () => {
    const { scene } = makeScene();
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 80, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = pickMeasureSurface(raycaster, scene);
    expect(hit).not.toBeNull();
    expect(hit!.point[1]).toBeLessThan(1);
  });

  it('skips measure gizmos and continues to the floor', () => {
    const { scene } = makeScene();
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 20, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = pickMeasureSurface(raycaster, scene);
    expect(hit).not.toBeNull();
    expect(hit!.point[1]).toBeLessThan(1);
  });
});
