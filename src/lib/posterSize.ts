import type { InchSize } from './importedItemSize';
import type { Item } from '../store';

const DEFAULT_POSTER_DEPTH_IN = 0.5;

/** Normalize catalog inch dimensions for a poster plane. */
export function posterCatalogSize(
  widthIn: number,
  heightIn: number,
  depthIn = DEFAULT_POSTER_DEPTH_IN,
): InchSize {
  return [widthIn, heightIn, depthIn > 0 ? depthIn : DEFAULT_POSTER_DEPTH_IN];
}

/**
 * Posters are built as inch-scaled planes — mesh bounds are the source of truth
 * for display size so the texture is never stretched off-aspect.
 */
export function posterSizeFromNatural(
  natural: InchSize,
  depthIn = DEFAULT_POSTER_DEPTH_IN,
): InchSize {
  return [
    natural[0],
    natural[1],
    natural[2] > 0.01 ? natural[2] : depthIn,
  ];
}

/** Keep the poster's vertical center when its height changes (wall hang). */
export function posterPositionPreservingCenterY(
  position: [number, number, number],
  oldHeight: number,
  newHeight: number,
): [number, number, number] {
  const centerY = position[1] + oldHeight / 2;
  return [position[0], centerY - newHeight / 2, position[2]];
}

/** Compute width (inches) for a target height that matches image pixel aspect. */
export function posterWidthInForHeight(
  imageWidthPx: number,
  imageHeightPx: number,
  heightIn: number,
): number | null {
  if (!(imageWidthPx > 0 && imageHeightPx > 0 && heightIn > 0)) return null;
  const widthIn = (imageWidthPx / imageHeightPx) * heightIn;
  return Math.round(widthIn * 100) / 100;
}

export function posterSizeForItemAfterNatural(item: Item, natural: InchSize): InchSize {
  const depth = item.catalogSizeIn?.[2] ?? item.size[2] ?? DEFAULT_POSTER_DEPTH_IN;
  return posterSizeFromNatural(natural, depth);
}

/** Browser helper — read cropped poster pixel size before building the GLB. */
export function readImageSizeFromBlob(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read poster image size'));
    };
    img.src = url;
  });
}
