import { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { PixelBounds } from '../lib/maskContour';

/** Pixel crop in the source image's natural resolution — what `cropSourceImage` expects. */
export type CropPixels = PixelBounds;

interface PhotoFreeCropProps {
  imageUrl: string;
  disabled?: boolean;
  onCropPixels: (crop: CropPixels | null) => void;
}

function toNaturalPixels(
  pixelCrop: PixelCrop,
  displayWidth: number,
  displayHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): CropPixels {
  const scaleX = naturalWidth / Math.max(1, displayWidth);
  const scaleY = naturalHeight / Math.max(1, displayHeight);
  return {
    x: Math.round(pixelCrop.x * scaleX),
    y: Math.round(pixelCrop.y * scaleY),
    width: Math.max(1, Math.round(pixelCrop.width * scaleX)),
    height: Math.max(1, Math.round(pixelCrop.height * scaleY)),
  };
}

/**
 * Free-resize crop rectangle for photo prep. No locked aspect — drag corners and
 * edges to any shape.
 */
export function PhotoFreeCrop({ imageUrl, disabled = false, onCropPixels }: PhotoFreeCropProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const onCropPixelsRef = useRef(onCropPixels);
  onCropPixelsRef.current = onCropPixels;
  const [crop, setCrop] = useState<Crop>();

  useEffect(() => {
    setCrop(undefined);
    onCropPixelsRef.current(null);
  }, [imageUrl]);

  const emitPixels = useCallback((next: Crop) => {
    const img = imgRef.current;
    if (!img?.width || !img?.height) return;
    const pixel = convertToPixelCrop(next, img.width, img.height);
    onCropPixelsRef.current(
      toNaturalPixels(pixel, img.width, img.height, img.naturalWidth, img.naturalHeight),
    );
  }, []);

  return (
    <div className="photo-prep__free-crop">
      <ReactCrop crop={crop} disabled={disabled} onChange={setCrop} onComplete={emitPixels}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Crop the piece you want"
          className="photo-prep__free-crop-img"
          onLoad={(e) => {
            const img = e.currentTarget;
            const initial = centerCrop(
              { unit: '%', width: 90, height: 90 },
              img.width,
              img.height,
            );
            setCrop(initial);
            emitPixels(initial);
          }}
        />
      </ReactCrop>
    </div>
  );
}
