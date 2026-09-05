import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPreparedFile,
  cropRgbaBlob,
  cropSourceImage,
  isolateSubject,
  MIN_SUBJECT_COVERAGE,
  preparedFileName,
  type SubjectIsolation,
} from '../lib/preparePhotoForTrellis';
import { PhotoFreeCrop, type CropPixels, type PhotoFreeCropHandle } from './PhotoFreeCrop';
import { PhotoMaskEditor, type PhotoMaskEditorHandle } from './PhotoMaskEditor';
import { PhotoPreparedPreview } from './PhotoPreparedPreview';
import { PhotoSourcePainter, type PhotoSourcePainterHandle } from './PhotoSourcePainter';

export interface PhotoSubjectPrepProps {
  imageFile: File;
  disabled?: boolean;
  /**
   * Fires with the finished image once the user confirms the isolation, and with
   * null when they go back to make changes. This component never starts
   * generation — the caller owns the send action.
   */
  onPreparedChange: (file: File | null) => void;
}

type Stage = 'workspace' | 'working' | 'confirm';
type ActiveTool = 'crop' | 'prePaint' | 'postBrush' | null;
type CropTarget = 'source' | 'cutout';

/**
 * Flexible photo prep workspace: crop, paint, isolate, and brush in any order
 * before confirming the exact JPEG sent to Trellis.
 */
export function PhotoSubjectPrep({
  imageFile,
  disabled = false,
  onPreparedChange,
}: PhotoSubjectPrepProps) {
  const [stage, setStage] = useState<Stage>('workspace');
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [cropTarget, setCropTarget] = useState<CropTarget>('source');
  const [sourceCropApplied, setSourceCropApplied] = useState(false);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cropRegion, setCropRegion] = useState<CropPixels | null>(null);
  const [cutoutCropRegion, setCutoutCropRegion] = useState<CropPixels | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [sourceEditedBlob, setSourceEditedBlob] = useState<Blob | null>(null);
  const [isolation, setIsolation] = useState<SubjectIsolation | null>(null);
  const [editedCutout, setEditedCutout] = useState<Blob | null>(null);
  const [cutoutCroppedBlob, setCutoutCroppedBlob] = useState<Blob | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropOverlayUrl, setCropOverlayUrl] = useState<string | null>(null);
  const [paintSessionSource, setPaintSessionSource] = useState<Blob | null>(null);
  const [brushSessionCutout, setBrushSessionCutout] = useState<Blob | null>(null);

  const cropRef = useRef<PhotoFreeCropHandle>(null);
  const maskEditorRef = useRef<PhotoMaskEditorHandle>(null);
  const sourcePainterRef = useRef<PhotoSourcePainterHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const notifyRef = useRef(onPreparedChange);
  notifyRef.current = onPreparedChange;

  const resetWorkspace = useCallback(() => {
    setStage('workspace');
    setActiveTool(null);
    setCropTarget('source');
    setSourceCropApplied(false);
    setCropRegion(null);
    setCutoutCropRegion(null);
    setCroppedBlob(null);
    setSourceEditedBlob(null);
    setIsolation(null);
    setEditedCutout(null);
    setCutoutCroppedBlob(null);
    setPaintSessionSource(null);
    setBrushSessionCutout(null);
    setPrepared(null);
    setError(null);
    setStatus(null);
    notifyRef.current(null);
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    resetWorkspace();
  }, [imageFile, resetWorkspace]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const activeCutout = editedCutout ?? isolation?.cutout ?? null;

  const previewBlob =
    cutoutCroppedBlob ??
    activeCutout ??
    sourceEditedBlob ??
    croppedBlob ??
    null;

  useEffect(() => {
    if (previewBlob) {
      const url = URL.createObjectURL(previewBlob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [previewBlob]);

  useEffect(() => {
    if (activeTool === 'crop') {
      const url = URL.createObjectURL(
        cropTarget === 'cutout' && activeCutout ? activeCutout : imageFile,
      );
      setCropOverlayUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCropOverlayUrl(null);
  }, [activeTool, cropTarget, activeCutout, imageFile]);

  const handleCropPixels = useCallback(
    (pixels: CropPixels | null) => {
      if (cropTarget === 'source') {
        setCropRegion(pixels);
        if (sourceCropApplied) setSourceCropApplied(false);
      } else {
        setCutoutCropRegion(pixels);
      }
    },
    [cropTarget, sourceCropApplied],
  );

  const handleApplyCrop = async () => {
    setError(null);
    const pixels =
      cropRef.current?.getCropPixels() ??
      (cropTarget === 'source' ? cropRegion : cutoutCropRegion);
    if (!pixels) return;

    setStatus('Applying crop…');
    try {
      if (cropTarget === 'source') {
        const cropped = await cropSourceImage(imageFile, pixels);
        setCropRegion(pixels);
        setCroppedBlob(cropped);
        setSourceEditedBlob(null);
        setIsolation(null);
        setEditedCutout(null);
        setCutoutCroppedBlob(null);
        setSourceCropApplied(true);
        setActiveTool(null);
      } else if (activeCutout) {
        const cropped = await cropRgbaBlob(activeCutout, pixels);
        setCutoutCropRegion(pixels);
        setCutoutCroppedBlob(cropped);
        setActiveTool(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply that crop.');
    } finally {
      setStatus(null);
    }
  };

  const handleEditCrop = () => {
    setCropTarget('source');
    setActiveTool('crop');
    setSourceCropApplied(false);
  };

  const handleOpenCrop = (target: CropTarget) => {
    setCropTarget(target);
    setActiveTool('crop');
    if (target === 'source') {
      setSourceCropApplied(false);
    }
  };

  const invalidateAfterPrePaint = () => {
    setIsolation(null);
    setEditedCutout(null);
    setCutoutCroppedBlob(null);
  };

  const handleSourcePaintChange = (blob: Blob) => {
    setSourceEditedBlob(blob);
    invalidateAfterPrePaint();
  };

  const handleCutoutChange = (blob: Blob) => {
    setEditedCutout(blob);
    setCutoutCroppedBlob(null);
  };

  const resolveIsolateInput = async (): Promise<Blob> => {
    if (sourceEditedBlob) return sourceEditedBlob;
    if (croppedBlob) return croppedBlob;
    if (cropRegion) return cropSourceImage(imageFile, cropRegion);
    return cropSourceImage(imageFile, null);
  };

  const handleIsolate = async () => {
    setError(null);
    setStage('working');
    setStatus('Preparing…');
    setActiveTool(null);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const bailIfAborted = () => {
      if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    };

    try {
      const input = await resolveIsolateInput();
      bailIfAborted();

      const result = await isolateSubject(input, {
        signal: abort.signal,
        onProgress: setStatus,
      });
      bailIfAborted();

      setIsolation(result);
      setEditedCutout(result.cutout);
      setCutoutCroppedBlob(null);
      setStage('workspace');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStage('workspace');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not isolate the subject.');
      setStage('workspace');
    } finally {
      setStatus(null);
      if (abortRef.current === abort) abortRef.current = null;
    }
  };

  const resolveFinalImage = async (): Promise<Blob> => {
    if (cutoutCroppedBlob) return cutoutCroppedBlob;
    if (editedCutout) return editedCutout;
    if (isolation?.cutout) return isolation.cutout;
    if (sourceEditedBlob) return sourceEditedBlob;
    if (croppedBlob) return croppedBlob;
    return cropSourceImage(imageFile, cropRegion);
  };

  const finish = async (image: Blob) => {
    setError(null);
    setStatus('Building the final image…');
    try {
      const file = await buildPreparedFile(image, preparedFileName(imageFile.name));
      setPrepared(file);
      setStage('confirm');
      notifyRef.current(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the final image.');
    } finally {
      setStatus(null);
    }
  };

  const handleUseThis = async () => {
    try {
      const image = await resolveFinalImage();
      await finish(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare that photo.');
    }
  };

  const handleSkipIsolation = async () => {
    setError(null);
    setStatus('Preparing…');
    setActiveTool(null);
    try {
      const image = await resolveFinalImage();
      if (isolation || editedCutout) {
        await finish(image);
        return;
      }
      setIsolation(null);
      setEditedCutout(null);
      await finish(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare that photo.');
      setStatus(null);
    }
  };

  const leaveConfirm = () => {
    setPrepared(null);
    notifyRef.current(null);
    setStage('workspace');
  };

  const openPrePaint = () => {
    setPaintSessionSource(sourceEditedBlob ?? croppedBlob ?? imageFile);
    setActiveTool('prePaint');
  };

  const openPostBrush = () => {
    if (!isolation) return;
    setBrushSessionCutout(editedCutout ?? isolation.cutout);
    setActiveTool('postBrush');
  };

  const finishEditing = async () => {
    if (activeTool === 'postBrush') {
      await maskEditorRef.current?.exportNow();
    } else if (activeTool === 'prePaint') {
      await sourcePainterRef.current?.exportNow();
    }
    setActiveTool(null);
    setPaintSessionSource(null);
    setBrushSessionCutout(null);
  };

  const onCropKeyDown = (event: React.KeyboardEvent) => {
    if (activeTool !== 'crop' || busy) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleApplyCrop();
    }
  };

  const busy = disabled || stage === 'working' || status !== null;

  if (stage === 'confirm' && prepared) {
    return <PhotoPreparedPreview file={prepared} disabled={disabled} onBack={leaveConfirm} />;
  }

  return (
    <div className="photo-prep" onKeyDown={onCropKeyDown}>
      <div className="photo-prep__head">
        <span className="photo-prep__eyebrow">Frame · Clean · Isolate · Finish</span>
        <p className="photo-prep__hint">
          Use any tool in any order. Crop to frame the piece, paint over distractions, remove the
          background, then brush to refine the cutout.
        </p>
        {activeTool === null ? (
          <div className="photo-prep__tips">
            <span className="photo-prep__eyebrow">Tips and tricks</span>
            <ul className="photo-prep__tips-list">
              <li>Prefer a simple background. Extra objects in the frame make isolation harder.</li>
              <li>Avoid reflections — they read as extra objects.</li>
              <li>Photograph the real piece, not a picture of it on a TV or printed page.</li>
            </ul>
          </div>
        ) : null}
      </div>

      {activeTool === 'crop' && cropOverlayUrl ? (
        <PhotoFreeCrop
          ref={cropRef}
          imageUrl={cropOverlayUrl}
          disabled={busy}
          initialCrop={cropTarget === 'source' ? cropRegion : cutoutCropRegion}
          onCropPixels={handleCropPixels}
        />
      ) : activeTool === 'prePaint' && paintSessionSource ? (
        <PhotoSourcePainter
          ref={sourcePainterRef}
          source={paintSessionSource}
          disabled={busy}
          onSourceChange={handleSourcePaintChange}
        />
      ) : activeTool === 'postBrush' && brushSessionCutout ? (
        <PhotoMaskEditor
          ref={maskEditorRef}
          cutout={brushSessionCutout}
          disabled={busy}
          onCutoutChange={handleCutoutChange}
        />
      ) : previewUrl ? (
        <div className="photo-prep__frame">
          <img src={previewUrl} alt="Current photo prep preview" />
        </div>
      ) : sourceUrl ? (
        <div className="photo-prep__frame">
          <img src={sourceUrl} alt="Uploaded photo" />
        </div>
      ) : (
        <div className="photo-prep__frame photo-prep__frame--empty">Loading the photo…</div>
      )}

      {activeTool === 'crop' ? (
        <div className="photo-prep__actions">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--primary"
            disabled={busy}
            onClick={() => void handleApplyCrop()}
          >
            {status ?? 'Apply crop'}
          </button>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={busy}
            onClick={() => setActiveTool(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {stage === 'working' ? (
        <div className="photo-prep__working">
          <span className="photo-prep__spin" aria-hidden />
          <span className="photo-prep__working-label">{status ?? 'Working…'}</span>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel
          </button>
        </div>
      ) : activeTool === null ? (
        <div className="photo-prep__toolbar">
          <div className="photo-prep__actions">
            {sourceCropApplied ? (
              <button
                type="button"
                className="photo-prep__btn"
                disabled={busy}
                onClick={handleEditCrop}
              >
                Edit crop
              </button>
            ) : (
              <button
                type="button"
                className="photo-prep__btn"
                disabled={busy}
                onClick={() => handleOpenCrop('source')}
              >
                Crop
              </button>
            )}
            <button
              type="button"
              className="photo-prep__btn"
              disabled={busy}
              onClick={openPrePaint}
            >
              Paint
            </button>
            <button
              type="button"
              className="photo-prep__btn photo-prep__btn--primary"
              disabled={busy}
              onClick={() => void handleIsolate()}
            >
              Remove background
            </button>
            <button
              type="button"
              className="photo-prep__btn"
              disabled={busy || !isolation}
              onClick={openPostBrush}
            >
              Brush
            </button>
            {isolation ? (
              <button
                type="button"
                className="photo-prep__btn"
                disabled={busy}
                onClick={() => handleOpenCrop('cutout')}
              >
                Crop cutout
              </button>
            ) : null}
            <button
              type="button"
              className="photo-prep__btn photo-prep__btn--primary"
              disabled={busy}
              onClick={() => void handleUseThis()}
            >
              {status ?? 'Use this'}
            </button>
            {!isolation ? (
              <button
                type="button"
                className="photo-prep__btn photo-prep__btn--quiet"
                disabled={busy}
                onClick={() => void handleSkipIsolation()}
              >
                Skip isolation
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="photo-prep__actions">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={busy}
            onClick={() => void finishEditing()}
          >
            Done editing
          </button>
        </div>
      )}

      {isolation && isolation.coverage < MIN_SUBJECT_COVERAGE ? (
        <p className="photo-prep__warn">
          We could barely find a subject here. Try cropping closer, painting over distractions, or
          skip isolation and send the photo as it is.
        </p>
      ) : null}

      {error ? <p className="photo-prep__error">{error}</p> : null}

      {!isolation ? (
        <p className="photo-prep__note">
          The first isolation downloads a model, so it takes longer than the ones after it.
        </p>
      ) : null}
    </div>
  );
}
