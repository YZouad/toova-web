import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  type Crop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  displayCropToNaturalPixels,
  imageLayoutFromHtmlImage,
  naturalPixelsToDisplayCrop,
} from '../lib/cropPixels';
import type { PixelBounds } from '../lib/maskContour';

/** Pixel crop in the source image's natural resolution — what `cropSourceImage` expects. */
export type CropPixels = PixelBounds;

export interface PhotoFreeCropHandle {
  getCropPixels: () => CropPixels | null;
}

interface PhotoFreeCropProps {
  imageUrl: string;
  disabled?: boolean;
  initialCrop?: CropPixels | null;
  onCropPixels?: (crop: CropPixels | null) => void;
}

function cropPixelsFromState(
  crop: Crop | undefined,
  img: HTMLImageElement,
): CropPixels | null {
  if (!crop) return null;
  const layout = imageLayoutFromHtmlImage(img);
  if (!layout) return null;
  const pixel = convertToPixelCrop(crop, layout.elementWidth, layout.elementHeight);
  return displayCropToNaturalPixels(pixel, layout);
}

/**
 * Free-resize crop rectangle for photo prep. No locked aspect — drag corners and
 * edges to any shape.
 */
export const PhotoFreeCrop = forwardRef<PhotoFreeCropHandle, PhotoFreeCropProps>(
  function PhotoFreeCrop(
    { imageUrl, disabled = false, initialCrop = null, onCropPixels },
    ref,
  ) {
    const imgRef = useRef<HTMLImageElement>(null);
    const cropRef = useRef<Crop>();
    const onCropPixelsRef = useRef(onCropPixels);
    onCropPixelsRef.current = onCropPixels;
    const [crop, setCrop] = useState<Crop>();

    cropRef.current = crop;

    useEffect(() => {
      setCrop(undefined);
      onCropPixelsRef.current?.(null);
    }, [imageUrl]);

    const emitPixels = useCallback((next: Crop) => {
      const img = imgRef.current;
      if (!img?.naturalWidth || !img.naturalHeight) return;
      const pixels = cropPixelsFromState(next, img);
      onCropPixelsRef.current?.(pixels);
    }, []);

    const handleCropChange = useCallback(
      (next: Crop) => {
        setCrop(next);
        emitPixels(next);
      },
      [emitPixels],
    );

    useImperativeHandle(
      ref,
      () => ({
        getCropPixels: () => {
          const img = imgRef.current;
          if (!img || !cropRef.current) return null;
          return cropPixelsFromState(cropRef.current, img);
        },
      }),
      [],
    );

    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const current = cropRef.current;
          if (current) emitPixels(current);
        }, 100);
      };
      window.addEventListener('resize', onResize);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', onResize);
      };
    }, [emitPixels]);

    const initCrop = useCallback(
      (img: HTMLImageElement) => {
        const layout = imageLayoutFromHtmlImage(img);
        if (!layout) return;
        const next =
          initialCrop
            ? naturalPixelsToDisplayCrop(initialCrop, layout)
            : centerCrop(
                { unit: '%', width: 90, height: 90 },
                layout.elementWidth,
                layout.elementHeight,
              );
        setCrop(next);
        emitPixels(next);
      },
      [initialCrop, emitPixels],
    );

    return (
      <div className="photo-prep__free-crop">
        <ReactCrop crop={crop} disabled={disabled} onChange={handleCropChange}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Crop the piece you want"
            className="photo-prep__free-crop-img"
            onLoad={(e) => initCrop(e.currentTarget)}
          />
        </ReactCrop>
      </div>
    );
  },
);
