/**
 * Turns a source photo into the exact image Trellis receives: cropped to the
 * piece, background removed, composited on white, trimmed to the subject.
 *
 * The file this produces is the one previewed, the one downloaded, and the one
 * uploaded — built once and passed around, never re-derived. Re-processing for
 * the download would let the saved bytes drift from the submitted bytes, which
 * defeats the point of the review step.
 */

import {
  alphaBounds,
  opaqueFraction,
  outlineOverlayFromAlpha,
  padBounds,
  type PixelBounds,
} from './maskContour';
import { cutOutSubject, type CutOutOptions } from './subjectMask';

/**
 * Long-edge ceiling for anything we hand to the isolator or to Trellis. Large
 * phone photos otherwise decode into enough canvas memory to reload the tab on
 * mobile Safari, and Trellis downsamples its input anyway.
 */
export const PREPARED_MAX_EDGE = 1024;

/** Breathing room around the subject, as a share of its longer edge. */
export const PREPARED_PAD_RATIO = 0.06;

const PREPARED_BACKGROUND = '#ffffff';
const JPEG_QUALITY = 0.92;

/** Below this share of kept pixels, treat isolation as having found nothing. */
export const MIN_SUBJECT_COVERAGE = 0.005;

export interface SubjectIsolation {
  /** Subject on a transparent background. Input to `buildPreparedFile`. */
  cutout: Blob;
  /** Subject on white with its boundary stroked red — the isolation review image. */
  outlined: Blob;
  coverage: number;
}

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Decode any image blob into RGBA pixel data. */
export async function loadRgbaFromBlob(blob: Blob): Promise<RgbaImage> {
  const decoded = await decodeImage(blob);
  try {
    const { width, height } = decoded;
    const surface = createSurface(width, height);
    surface.ctx.drawImage(decoded.source, 0, 0);
    const { data } = surface.ctx.getImageData(0, 0, width, height);
    return { data: new Uint8ClampedArray(data), width, height };
  } finally {
    decoded.release();
  }
}

/** Put RGBA bytes on a canvas surface. */
function putRgba(surface: Surface, data: Uint8ClampedArray, width: number, height: number): void {
  const layer = surface.ctx.createImageData(width, height);
  layer.data.set(data);
  surface.ctx.putImageData(layer, 0, 0);
}

/** Encode RGBA pixels as a PNG cutout. */
export async function rgbaToCutoutBlob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const surface = createSurface(width, height);
  putRgba(surface, data, width, height);
  return await surfaceToBlob(surface.canvas, 'image/png');
}

/** White background + subject + red outline — the isolation review composite. */
export async function renderOutlinedPreview(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const masked = createSurface(width, height);
  putRgba(masked, data, width, height);

  const overlay = createSurface(width, height);
  const stroke = overlay.ctx.createImageData(width, height);
  stroke.data.set(outlineOverlayFromAlpha(data, width, height));
  overlay.ctx.putImageData(stroke, 0, 0);

  const composed = createSurface(width, height);
  composed.ctx.fillStyle = PREPARED_BACKGROUND;
  composed.ctx.fillRect(0, 0, width, height);
  composed.ctx.drawImage(masked.canvas, 0, 0);
  composed.ctx.drawImage(overlay.canvas, 0, 0);

  return await surfaceToBlob(composed.canvas, 'image/png');
}

/** Output size that fits `maxEdge` without changing the aspect ratio. */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Recognisable download name, so saved test images are easy to tell apart. */
export function preparedFileName(sourceName: string): string {
  const stem = sourceName.replace(/\.[^/.]+$/, '');
  const safe = stem
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `toova-prepared-${safe || 'photo'}.jpg`;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function decodeViaImageElement(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    return await decodeViaImageElement(blob);
  }
}

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function createSurface(width: number, height: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images on a canvas.');
  return { canvas, ctx };
}

function surfaceToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/jpeg' | 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      type,
      quality,
    );
  });
}

/**
 * Crop `file` to `crop` (source-pixel coordinates) and fit the result inside
 * `maxEdge`. Cropping before downscaling keeps the subject as sharp as possible;
 * pass a null crop to use the whole frame.
 */
export async function cropSourceImage(
  file: Blob,
  crop: PixelBounds | null,
  maxEdge = PREPARED_MAX_EDGE,
): Promise<Blob> {
  const decoded = await decodeImage(file);
  try {
    const region: PixelBounds = crop ?? {
      x: 0,
      y: 0,
      width: decoded.width,
      height: decoded.height,
    };
    const x = Math.max(0, Math.min(Math.round(region.x), decoded.width - 1));
    const y = Math.max(0, Math.min(Math.round(region.y), decoded.height - 1));
    const width = Math.max(1, Math.min(Math.round(region.width), decoded.width - x));
    const height = Math.max(1, Math.min(Math.round(region.height), decoded.height - y));

    const size = scaledSize(width, height, maxEdge);
    const surface = createSurface(size.width, size.height);
    surface.ctx.drawImage(
      decoded.source,
      x,
      y,
      width,
      height,
      0,
      0,
      size.width,
      size.height,
    );
    return await surfaceToBlob(surface.canvas, 'image/png');
  } finally {
    decoded.release();
  }
}

/**
 * Remove the background and render the review image: subject on white with its
 * detected boundary stroked red, so the user can judge *what* got selected
 * before judging the final crop.
 */
export async function isolateSubject(
  cropped: Blob,
  options: CutOutOptions = {},
): Promise<SubjectIsolation> {
  const cutout = await cutOutSubject(cropped, options);

  const decoded = await decodeImage(cutout);
  try {
    const { width, height } = decoded;
    const masked = createSurface(width, height);
    masked.ctx.drawImage(decoded.source, 0, 0);
    const { data } = masked.ctx.getImageData(0, 0, width, height);

    const overlay = createSurface(width, height);
    const stroke = overlay.ctx.createImageData(width, height);
    stroke.data.set(outlineOverlayFromAlpha(data, width, height));
    overlay.ctx.putImageData(stroke, 0, 0);

    const composed = createSurface(width, height);
    composed.ctx.fillStyle = PREPARED_BACKGROUND;
    composed.ctx.fillRect(0, 0, width, height);
    composed.ctx.drawImage(masked.canvas, 0, 0);
    composed.ctx.drawImage(overlay.canvas, 0, 0);

    return {
      cutout,
      outlined: await surfaceToBlob(composed.canvas, 'image/png'),
      coverage: opaqueFraction(data),
    };
  } finally {
    decoded.release();
  }
}

/**
 * Flatten `image` onto white and trim to the subject plus padding, as a JPEG.
 *
 * Works for both paths: a cutout trims to its alpha bounds, while a fully opaque
 * image (isolation skipped) has bounds covering the whole frame and so is only
 * re-encoded. JPEG matters — `ensureJpegForTrellis` re-encodes anything else on
 * upload, which would make the downloaded bytes differ from the sent bytes.
 */
export async function buildPreparedFile(
  image: Blob,
  fileName: string,
  options: { maxEdge?: number; padRatio?: number } = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? PREPARED_MAX_EDGE;
  const padRatio = options.padRatio ?? PREPARED_PAD_RATIO;

  const decoded = await decodeImage(image);
  try {
    const size = scaledSize(decoded.width, decoded.height, maxEdge);
    const staged = createSurface(size.width, size.height);
    staged.ctx.drawImage(decoded.source, 0, 0, size.width, size.height);

    const { data } = staged.ctx.getImageData(0, 0, size.width, size.height);
    const subject = alphaBounds(data, size.width, size.height) ?? {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    };
    const box = padBounds(subject, size.width, size.height, padRatio);

    const out = createSurface(box.width, box.height);
    out.ctx.fillStyle = PREPARED_BACKGROUND;
    out.ctx.fillRect(0, 0, box.width, box.height);
    out.ctx.drawImage(
      staged.canvas,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      box.width,
      box.height,
    );

    const blob = await surfaceToBlob(out.canvas, 'image/jpeg', JPEG_QUALITY);
    return new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    decoded.release();
  }
}
