import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { normalizeImportedMaterials } from './normalizeImportedMaterials';

export const THUMB_SIZE = 384;
export const PREVIEW_BG = 0xe9dfcc;

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedEnvMap: THREE.Texture | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setSize(THUMB_SIZE, THUMB_SIZE);
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedRenderer.toneMappingExposure = 1.1;
  }
  return sharedRenderer;
}

function getEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (!sharedEnvMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    sharedEnvMap = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
  }
  return sharedEnvMap;
}

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const key of Object.keys(mat)) {
        const val = (mat as THREE.Material & Record<string, unknown>)[key];
        if (val instanceof THREE.Texture) val.dispose();
      }
      mat.dispose();
    }
  });
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const key = new THREE.DirectionalLight(0xffffff, 0.88);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-2, 1, -1);
  scene.add(fill);
}

export type RenderObjectToJpegOptions = {
  /** Match designer import lighting. Default false (builtin meshes already PBR). */
  normalize?: boolean;
};

/** Center object at origin, render to JPEG using the shared offscreen renderer. */
export async function renderObjectToJpeg(
  object: THREE.Object3D,
  opts: RenderObjectToJpegOptions = {},
): Promise<Blob | null> {
  try {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PREVIEW_BG);

    const clone = object.clone(true);
    if (opts.normalize) {
      normalizeImportedMaterials(clone, { relight: true });
    }
    clone.position.sub(center);
    scene.add(clone);
    addLights(scene);

    const renderer = getRenderer();
    scene.environment = getEnvMap(renderer);
    scene.environmentIntensity = 0.7;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, maxDim * 25);
    const dist = maxDim * 1.75;
    camera.position.set(dist * 0.9, dist * 0.55, dist * 0.9);
    camera.lookAt(0, size.y * 0.12, 0);

    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) => {
      renderer.domElement.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });

    scene.environment = null;
    disposeObject3D(clone);
    return blob;
  } catch {
    return null;
  }
}
