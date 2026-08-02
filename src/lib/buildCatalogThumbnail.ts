import { generateGlbThumbnail } from './generateGlbThumbnail';
import { uploadModelThumbnail } from './modelStorage';
import { imageToJpegThumbnail } from './thumbnailImage';

/** Best-effort thumbnail upload for a new catalog item. Returns storage path or null. */
export async function buildAndUploadCatalogThumbnail(
  userId: string,
  opts: {
    glbFile: File;
    imageFile?: File | null;
    posterBlob?: Blob | null;
  },
): Promise<string | null> {
  try {
    let jpeg: Blob | null = null;
    if (opts.imageFile) {
      jpeg = await imageToJpegThumbnail(opts.imageFile);
    } else if (opts.posterBlob) {
      jpeg = await imageToJpegThumbnail(opts.posterBlob);
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
