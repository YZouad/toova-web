import type { PixelBounds } from './maskContour';

export interface NaturalPoint {
  x: number;
  y: number;
}

export interface ImageLayout {
  /** Full element box — react-image-crop coordinates. */
  elementWidth: number;
  elementHeight: number;
  /** Visible image content when object-fit: contain letterboxes. */
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  naturalWidth: number;
  naturalHeight: number;
}

/** Map element box + natural size to the visible image rect (object-fit: contain). */
export function imageLayoutFromElement(
  elementWidth: number,
  elementHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageLayout {
  if (elementWidth <= 0 || elementHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      elementWidth,
      elementHeight,
      contentWidth: elementWidth,
      contentHeight: elementHeight,
      offsetX: 0,
      offsetY: 0,
      naturalWidth,
      naturalHeight,
    };
  }

  const scale = Math.min(elementWidth / naturalWidth, elementHeight / naturalHeight);
  const contentWidth = naturalWidth * scale;
  const contentHeight = naturalHeight * scale;

  return {
    elementWidth,
    elementHeight,
    contentWidth,
    contentHeight,
    offsetX: (elementWidth - contentWidth) / 2,
    offsetY: (elementHeight - contentHeight) / 2,
    naturalWidth,
    naturalHeight,
  };
}

export function imageLayoutFromHtmlImage(img: HTMLImageElement): ImageLayout | null {
  const rect = img.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || !img.naturalWidth || !img.naturalHeight) {
    return null;
  }
  return imageLayoutFromElement(rect.width, rect.height, img.naturalWidth, img.naturalHeight);
}

function naturalSizeFromElement(
  element: HTMLCanvasElement | HTMLImageElement,
): { width: number; height: number } | null {
  if (element instanceof HTMLCanvasElement) {
    if (element.width <= 0 || element.height <= 0) return null;
    return { width: element.width, height: element.height };
  }
  if (!element.naturalWidth || !element.naturalHeight) return null;
  return { width: element.naturalWidth, height: element.naturalHeight };
}

/** Map viewport coords + element box to natural pixels (testable without DOM). */
export function clientPointToNaturalPixels(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number,
): NaturalPoint | null {
  if (rect.width <= 0 || rect.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return null;
  }

  const layout = imageLayoutFromElement(rect.width, rect.height, naturalWidth, naturalHeight);
  const displayX = clientX - rect.left;
  const displayY = clientY - rect.top;

  if (
    displayX < layout.offsetX ||
    displayY < layout.offsetY ||
    displayX > layout.offsetX + layout.contentWidth ||
    displayY > layout.offsetY + layout.contentHeight
  ) {
    return null;
  }

  const scaleX = layout.naturalWidth / Math.max(1, layout.contentWidth);
  const scaleY = layout.naturalHeight / Math.max(1, layout.contentHeight);
  const x = (displayX - layout.offsetX) * scaleX;
  const y = (displayY - layout.offsetY) * scaleY;

  if (x < 0 || y < 0 || x >= layout.naturalWidth || y >= layout.naturalHeight) return null;
  return { x, y };
}

/**
 * Map a viewport pointer position to natural image pixels, accounting for
 * object-fit: contain letterboxing on the element.
 */
export function pointerToNaturalPixels(
  clientX: number,
  clientY: number,
  element: HTMLCanvasElement | HTMLImageElement,
): NaturalPoint | null {
  const rect = element.getBoundingClientRect();
  const natural = naturalSizeFromElement(element);
  if (!natural) return null;
  return clientPointToNaturalPixels(
    clientX,
    clientY,
    rect,
    natural.width,
    natural.height,
  );
}

/** Convert a display-space point (element box) to natural image pixels. */
export function displayPointToNatural(
  point: { x: number; y: number },
  layout: ImageLayout,
): NaturalPoint {
  const scaleX = layout.naturalWidth / Math.max(1, layout.contentWidth);
  const scaleY = layout.naturalHeight / Math.max(1, layout.contentHeight);
  return {
    x: (point.x - layout.offsetX) * scaleX,
    y: (point.y - layout.offsetY) * scaleY,
  };
}

/** Convert natural image pixels to display-space coordinates. */
export function naturalPointToDisplay(
  point: NaturalPoint,
  layout: ImageLayout,
): { x: number; y: number } {
  const scaleX = layout.contentWidth / Math.max(1, layout.naturalWidth);
  const scaleY = layout.contentHeight / Math.max(1, layout.naturalHeight);
  return {
    x: layout.offsetX + point.x * scaleX,
    y: layout.offsetY + point.y * scaleY,
  };
}

export function naturalPointsToDisplay(
  points: NaturalPoint[],
  layout: ImageLayout,
): { x: number; y: number }[] {
  return points.map((point) => naturalPointToDisplay(point, layout));
}

/**
 * Convert react-image-crop pixel coords (element box) to source natural pixels.
 * Accounts for object-fit: contain letterboxing inside the img element.
 */
export function displayCropToNaturalPixels(
  pixelCrop: { x: number; y: number; width: number; height: number },
  layout: ImageLayout,
): PixelBounds {
  const scaleX = layout.naturalWidth / Math.max(1, layout.contentWidth);
  const scaleY = layout.naturalHeight / Math.max(1, layout.contentHeight);

  const x = (pixelCrop.x - layout.offsetX) * scaleX;
  const y = (pixelCrop.y - layout.offsetY) * scaleY;
  const width = pixelCrop.width * scaleX;
  const height = pixelCrop.height * scaleY;

  return clampNaturalCrop(
    {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
    layout.naturalWidth,
    layout.naturalHeight,
  );
}

/** Convert natural pixels back to react-image-crop element coordinates. */
export function naturalPixelsToDisplayCrop(
  region: PixelBounds,
  layout: ImageLayout,
): { unit: 'px'; x: number; y: number; width: number; height: number } {
  const scaleX = layout.contentWidth / Math.max(1, layout.naturalWidth);
  const scaleY = layout.contentHeight / Math.max(1, layout.naturalHeight);

  return {
    unit: 'px',
    x: layout.offsetX + region.x * scaleX,
    y: layout.offsetY + region.y * scaleY,
    width: Math.max(1, region.width * scaleX),
    height: Math.max(1, region.height * scaleY),
  };
}

function clampNaturalCrop(
  region: PixelBounds,
  naturalWidth: number,
  naturalHeight: number,
): PixelBounds {
  const x = Math.max(0, Math.min(region.x, naturalWidth - 1));
  const y = Math.max(0, Math.min(region.y, naturalHeight - 1));
  const width = Math.max(1, Math.min(region.width, naturalWidth - x));
  const height = Math.max(1, Math.min(region.height, naturalHeight - y));
  return { x, y, width, height };
}

/** @deprecated Use layout-aware overload — kept for simple proportional tests. */
export function displayCropToNaturalPixelsLegacy(
  pixelCrop: { x: number; y: number; width: number; height: number },
  displayWidth: number,
  displayHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): PixelBounds {
  return displayCropToNaturalPixels(
    pixelCrop,
    imageLayoutFromElement(displayWidth, displayHeight, naturalWidth, naturalHeight),
  );
}

/** @deprecated Use layout-aware overload. */
export function naturalPixelsToDisplayCropLegacy(
  region: PixelBounds,
  displayWidth: number,
  displayHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): { unit: 'px'; x: number; y: number; width: number; height: number } {
  return naturalPixelsToDisplayCrop(
    region,
    imageLayoutFromElement(displayWidth, displayHeight, naturalWidth, naturalHeight),
  );
}
