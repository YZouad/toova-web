import type { PixelBounds } from './maskContour';

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
