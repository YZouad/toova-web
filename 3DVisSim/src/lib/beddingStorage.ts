import { supabase } from './supabase';
import { MODEL_FILES_BUCKET, signModelObjectPath } from './modelStorage';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.88;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

/** Downscale to max edge (JPEG) for lighter storage. */
export async function resizeImageFileToJpegBlob(file: File): Promise<Blob> {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export async function uploadBlanketTexture(
  file: File,
): Promise<{ path: string; signedUrl: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload a blanket pattern');
  const blob = await resizeImageFileToJpegBlob(file);
  const objectPath = `bedding/${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(MODEL_FILES_BUCKET).upload(objectPath, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const signed = await signModelObjectPath(objectPath);
  if (!signed) throw new Error('Could not sign texture URL');
  return { path: objectPath, signedUrl: signed };
}

export async function removeBlanketTexture(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) return;
  const { error } = await supabase.storage.from(MODEL_FILES_BUCKET).remove([trimmed]);
  if (error) throw new Error(error.message);
}
