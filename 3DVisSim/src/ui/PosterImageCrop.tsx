import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { cropImageToBlob } from '../lib/cropImage';

interface PosterImageCropProps {
  imageUrl: string | null;
  aspect: number;
  disabled?: boolean;
  onCropped: (blob: Blob | null) => void;
}

export function PosterImageCrop({
  imageUrl,
  aspect,
  disabled,
  onCropped,
}: PosterImageCropProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPixels(null);
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  useEffect(() => {
    if (!imageUrl || !pixels || disabled) {
      onCropped(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    void cropImageToBlob(imageUrl, pixels)
      .then((blob) => {
        if (cancelled) return;
        onCropped(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => {
        if (cancelled) return;
        onCropped(null);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, pixels, disabled, onCropped]);

  if (!imageUrl) return null;

  return (
    <div className="import-modal-poster-crop">
      <div className="import-modal-poster-crop-frame">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          showGrid={false}
          cropShape="rect"
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
        />
      </div>

      <label className="import-modal-field">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          disabled={disabled}
        />
      </label>

      {previewUrl ? (
        <div className="import-modal-poster-crop-result">
          <span className="import-modal-poster-crop-caption">Crop preview</span>
          <img
            src={previewUrl}
            alt="Cropped poster preview"
            className="import-modal-poster-crop-preview"
          />
        </div>
      ) : null}
    </div>
  );
}
