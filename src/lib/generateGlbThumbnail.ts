import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeObject3D, renderObjectToJpeg } from './thumbnailRenderer';

export type GenerateGlbThumbnailOptions = {
  /** Stand monitors/TVs/lamps/clocks upright when rendering. */
  label?: string;
};

/** Render a GLB/GLTF file or URL to a JPEG blob using one shared offscreen renderer. */
export async function generateGlbThumbnail(
  source: File | Blob | string,
  opts: GenerateGlbThumbnailOptions = {},
): Promise<Blob | null> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const shouldRevoke = typeof source !== 'string';

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const blob = await renderObjectToJpeg(gltf.scene, {
      normalize: true,
      label: opts.label,
    });
    disposeObject3D(gltf.scene);
    return blob;
  } catch {
    return null;
  } finally {
    if (shouldRevoke) URL.revokeObjectURL(url);
  }
}
