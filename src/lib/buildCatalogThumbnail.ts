import { generateGlbThumbnail } from './generateGlbThumbnail';
import { uploadModelThumbnail } from './modelStorage';
import { imageToJpegThumbnail } from './thumbnailImage';

/**
 * Best-effort thumbnail upload for a new catalog item. Returns storage path or null.
 *
 * Prefer a GLB snapshot so gallery cards show the 3D object. Only use a flat
 * image when explicitly preferred (posters), where the artwork is the preview.
 */
export async function buildAndUploadCatalogThumbnail(
  userId: string,
  opts: {
    glbFile: File;
    /** Flat image used instead of (or before) a GLB render — posters only. */
    preferFlatImage?: Blob | File | null;
  },
): Promise<string | null> {
  try {
    let jpeg: Blob | null = null;
    if (opts.preferFlatImage) {
      jpeg = await imageToJpegThumbnail(opts.preferFlatImage);
    }
    if (!jpeg) {
      jpeg = await generateGlbThumbnail(opts.glbFile);
    }
    if (!jpeg) return null;
    return await uploadModelThumbnail(jpeg, userId);
  } catch {
    return null;
  }
}
