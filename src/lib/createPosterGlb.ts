import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export type PosterPhysicsInches = {
  widthIn: number;
  heightIn: number;
  depthIn: number;
};

async function textureFromBlob(blob: Blob): Promise<THREE.Texture> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load poster image'));
      el.src = url;
    });

    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Vertical flip sampling so posters load right-side-up in Three.js GLTFLoader (embedded GLB textures). */
function flipGeometryUvY(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv');
  if (!uv || !(uv instanceof THREE.BufferAttribute)) return;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setY(i, 1 - uv.getY(i));
  }
  uv.needsUpdate = true;
}

/** Single vertical plane (XY); bottom sits on floor after ImportedModel centering. */
export async function createPosterGlb(
  croppedImage: Blob,
  physics: PosterPhysicsInches,
): Promise<File> {
  const { widthIn, heightIn } = physics;
  if (!(widthIn > 0 && heightIn > 0)) {
    throw new Error('Poster width and height must be positive.');
  }

  const map = await textureFromBlob(croppedImage);
  const material = new THREE.MeshStandardMaterial({ map });

  const geometry = new THREE.PlaneGeometry(widthIn, heightIn);
  flipGeometryUvY(geometry);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const root = new THREE.Group();
  root.add(mesh);

  const exporter = new GLTFExporter();
  const bufferUnknown = await exporter.parseAsync(root, { binary: true });
  geometry.dispose();
  material.dispose();
  map.dispose();

  if (!(bufferUnknown instanceof ArrayBuffer)) {
    throw new Error('Poster export did not produce binary GLB data.');
  }

  return new File([bufferUnknown], 'poster.glb', {
    type: 'model/gltf-binary',
  });
}
