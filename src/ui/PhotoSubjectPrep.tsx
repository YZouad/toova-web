import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPreparedFile,
  cropSourceImage,
  isolateSubject,
  MIN_SUBJECT_COVERAGE,
  preparedFileName,
  type SubjectIsolation,
} from '../lib/preparePhotoForTrellis';
import { PhotoFreeCrop, type CropPixels } from './PhotoFreeCrop';
import { PhotoMaskEditor } from './PhotoMaskEditor';
import { PhotoPreparedPreview } from './PhotoPreparedPreview';

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

type Stage = 'crop' | 'working' | 'review' | 'confirm';

/**
 * Two checkpoints before a photo can be sent for generation: the red outline
 * answers "did we pick the right object?", then the final image answers "is this
 * exactly what should be submitted?".
 */
export function PhotoSubjectPrep({
  imageFile,
  disabled = false,
  onPreparedChange,
}: PhotoSubjectPrepProps) {
  const [stage, setStage] = useState<Stage>('crop');
  const [pixels, setPixels] = useState<CropPixels | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isolation, setIsolation] = useState<SubjectIsolation | null>(null);
  const [editedCutout, setEditedCutout] = useState<Blob | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const croppedRef = useRef<Blob | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const notifyRef = useRef(onPreparedChange);
  notifyRef.current = onPreparedChange;

  const onCropPixels = useCallback((crop: CropPixels | null) => {
    setPixels(crop);
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    setStage('crop');
    setPixels(null);
    setIsolation(null);
    setEditedCutout(null);
    setPrepared(null);
    setError(null);
    setStatus(null);
    croppedRef.current = null;
    notifyRef.current(null);
  }, [imageFile]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cropRegion = () => (pixels ? { ...pixels } : null);

  const handleIsolate = async () => {
    setError(null);
    setStage('working');
    setStatus('Cropping…');
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const bailIfAborted = () => {
      if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    };

    try {
      const cropped = await cropSourceImage(imageFile, cropRegion());
      croppedRef.current = cropped;
      bailIfAborted();

      const result = await isolateSubject(cropped, {
        signal: abort.signal,
        onProgress: setStatus,
      });
      bailIfAborted();

      setIsolation(result);
      setEditedCutout(result.cutout);
      setStage('review');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStage('crop');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not isolate the subject.');
      setStage('crop');
    } finally {
      setStatus(null);
      if (abortRef.current === abort) abortRef.current = null;
    }
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

  const handleSkip = async () => {
    setError(null);
    setStatus('Cropping…');
    try {
      const cropped = croppedRef.current ?? (await cropSourceImage(imageFile, cropRegion()));
      croppedRef.current = cropped;
      setIsolation(null);
      setEditedCutout(null);
      await finish(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare that photo.');
      setStatus(null);
    }
  };

  const leaveConfirm = () => {
    setPrepared(null);
    notifyRef.current(null);
    setStage(isolation ? 'review' : 'crop');
  };

  const busy = disabled || stage === 'working' || status !== null;
  const activeCutout = editedCutout ?? isolation?.cutout ?? null;

  if (stage === 'confirm' && prepared) {
    return <PhotoPreparedPreview file={prepared} disabled={disabled} onBack={leaveConfirm} />;
  }

  if (stage === 'review' && isolation) {
    return (
      <div className="photo-prep">
        <div className="photo-prep__head">
          <span className="photo-prep__eyebrow">Step 1 of 2 · Did we pick the right thing?</span>
          <p className="photo-prep__hint">
            Paint to erase leftover background. Switch to Restore to bring back parts. The red
            outline shows what will be kept.
          </p>
        </div>

        <PhotoMaskEditor
          cutout={isolation.cutout}
          disabled={busy}
          onCutoutChange={setEditedCutout}
        />

        {isolation.coverage < MIN_SUBJECT_COVERAGE ? (
          <p className="photo-prep__warn">
            We could barely find a subject here. Try cropping closer to the piece, or skip
            isolation and send the photo as it is.
          </p>
        ) : null}

        {error ? <p className="photo-prep__error">{error}</p> : null}

        <div className="photo-prep__actions">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--primary"
            disabled={busy || !activeCutout}
            onClick={() => {
              if (activeCutout) void finish(activeCutout);
            }}
          >
            {status ?? 'Use this'}
          </button>
          <button
            type="button"
            className="photo-prep__btn"
            disabled={busy}
            onClick={() => {
              setIsolation(null);
              setEditedCutout(null);
              setStage('crop');
            }}
          >
            Recrop
          </button>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={busy}
            onClick={() => void handleSkip()}
          >
            Skip isolation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="photo-prep">
      <div className="photo-prep__head">
        <span className="photo-prep__eyebrow">Step 1 of 2 · Frame the piece</span>
        <p className="photo-prep__hint">
          Drag the corners and edges to frame the piece. Any shape works — we trim to the object
          itself afterwards, so a little extra room is fine.
        </p>
        <div className="photo-prep__tips">
          <span className="photo-prep__eyebrow">Tips and tricks</span>
          <ul className="photo-prep__tips-list">
            <li>Prefer a simple background. Extra objects in the frame make isolation harder.</li>
            <li>Avoid reflections — they read as extra objects.</li>
            <li>Photograph the real piece, not a picture of it on a TV or printed page.</li>
          </ul>
        </div>
      </div>

      {sourceUrl ? (
        <PhotoFreeCrop imageUrl={sourceUrl} disabled={busy} onCropPixels={onCropPixels} />
      ) : (
        <div className="photo-prep__frame photo-prep__frame--empty">Loading the photo…</div>
      )}

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
      ) : (
        <div className="photo-prep__actions">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--primary"
            disabled={busy}
            onClick={() => void handleIsolate()}
          >
            Remove the background
          </button>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={busy}
            onClick={() => void handleSkip()}
          >
            Skip isolation
          </button>
        </div>
      )}

      {error ? <p className="photo-prep__error">{error}</p> : null}

      <p className="photo-prep__note">
        The first isolation downloads a model, so it takes longer than the ones after it.
      </p>
    </div>
  );
}
