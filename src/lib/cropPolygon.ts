import type { NaturalPoint } from './cropPixels';
import type { PixelBounds } from './maskContour';
import {
  loadRgbaFromBlob,
  PREPARED_MAX_EDGE,
  rgbaToCutoutBlob,
  scaledSize,
} from './preparePhotoForTrellis';

export type PolygonOutside = 'transparent' | 'white';

export interface PolygonCropOptions {
  outside: PolygonOutside;
  maxEdge?: number;
}

/** Ray-casting point-in-polygon test. */
export function isPointInPolygon(x: number, y: number, points: NaturalPoint[]): boolean {
  if (points.length < 3) return false;

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounding box for a polygon, clamped to image bounds. */
export function polygonBounds(
  points: NaturalPoint[],
  imageWidth: number,
  imageHeight: number,
): PixelBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(imageWidth, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(imageHeight, Math.ceil(Math.max(...ys)));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Translate polygon points into bbox-local coordinates. */
export function polygonToLocal(points: NaturalPoint[], bounds: PixelBounds): NaturalPoint[] {
  return points.map((point) => ({ x: point.x - bounds.x, y: point.y - bounds.y }));
}

/** Mask RGBA pixels to a polygon bounding box in-place on a copied buffer. */
export function maskRgbaToPolygon(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  points: NaturalPoint[],
  outside: PolygonOutside,
): { data: Uint8ClampedArray; bounds: PixelBounds } {
  const bounds = polygonBounds(points, width, height);
  const localPoints = polygonToLocal(points, bounds);
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);

  for (let row = 0; row < bounds.height; row += 1) {
    for (let col = 0; col < bounds.width; col += 1) {
      const imageX = bounds.x + col;
      const imageY = bounds.y + row;
      const outPx = (row * bounds.width + col) * 4;
      const inPx = (imageY * width + imageX) * 4;

      if (isPointInPolygon(col, row, localPoints)) {
        output[outPx] = data[inPx];
        output[outPx + 1] = data[inPx + 1];
        output[outPx + 2] = data[inPx + 2];
        output[outPx + 3] = data[inPx + 3];
      } else if (outside === 'transparent') {
        output[outPx + 3] = 0;
      } else {
        output[outPx] = 255;
        output[outPx + 1] = 255;
        output[outPx + 2] = 255;
        output[outPx + 3] = 255;
      }
    }
  }

  return { data: output, bounds };
}

/**
 * Crop to the polygon bounding box and mask pixels outside the shape.
 * Transparent outside for cutouts; white outside for source photos.
 */
export async function applyPolygonCrop(
  file: Blob,
  points: NaturalPoint[],
  options: PolygonCropOptions,
): Promise<Blob> {
  if (points.length < 3) {
    throw new Error('Polygon crop needs at least three points.');
  }

  const maxEdge = options.maxEdge ?? PREPARED_MAX_EDGE;
  const { data, width, height } = await loadRgbaFromBlob(file);
  const { data: masked, bounds } = maskRgbaToPolygon(
    data,
    width,
    height,
    points,
    options.outside,
  );

  const cropped = await rgbaToCutoutBlob(masked, bounds.width, bounds.height);
  if (bounds.width <= maxEdge && bounds.height <= maxEdge) {
    return cropped;
  }

  const size = scaledSize(bounds.width, bounds.height, maxEdge);
  const scaled = await loadRgbaFromBlob(cropped);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images on a canvas.');

  const layer = ctx.createImageData(scaled.width, scaled.height);
  layer.data.set(scaled.data);
  const source = document.createElement('canvas');
  source.width = scaled.width;
  source.height = scaled.height;
  source.getContext('2d')?.putImageData(layer, 0, 0);
  ctx.drawImage(source, 0, 0, size.width, size.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png',
    );
  });
}
