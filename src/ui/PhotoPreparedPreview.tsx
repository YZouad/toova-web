import { useEffect, useState } from 'react';

export interface PhotoPreparedPreviewProps {
  /** The finished image. Previewed, downloaded, and uploaded as one object. */
  file: File;
  disabled?: boolean;
  /** Return to the crop and isolation step, keeping the source photo. */
  onBack: () => void;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Second checkpoint: the exact image that will be submitted. The preview and the
 * download share one object URL over the same File, so what someone saves to
 * disk is byte for byte what gets sent.
 */
export function PhotoPreparedPreview({
  file,
  disabled = false,
  onBack,
}: PhotoPreparedPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  const meta = [dimensions, formatBytes(file.size), 'JPEG'].filter(Boolean).join(' · ');

  return (
    <div className="photo-prep">
      <div className="photo-prep__head">
        <span className="photo-prep__eyebrow">Step 2 of 2 · Your 3D image is ready</span>
        <p className="photo-prep__hint">
          Review the image before sending it to 3D generation. This exact file is what the
          generator receives — nothing is re-processed afterwards.
        </p>
      </div>

      <div className="photo-prep__frame photo-prep__frame--final">
        {url ? <img src={url} alt="Prepared image that will be sent for 3D generation" /> : null}
      </div>

      <div className="photo-prep__final-meta">
        <span className="photo-prep__final-name">{file.name}</span>
        {meta ? <span className="photo-prep__final-dims">{meta}</span> : null}
      </div>

      <div className="photo-prep__actions">
        {url ? (
          <a className="photo-prep__btn" href={url} download={file.name}>
            Download image
          </a>
        ) : null}
        <button
          type="button"
          className="photo-prep__btn photo-prep__btn--quiet"
          disabled={disabled}
          onClick={onBack}
        >
          Make changes
        </button>
      </div>
    </div>
  );
}
