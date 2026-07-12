import { useEffect, useState } from 'react';
import { createPosterGlb } from '../lib/createPosterGlb';
import { decimateGlb } from '../lib/decimateGlb';
import { MODEL_FILES_BUCKET } from '../lib/modelStorage';
import { supabase } from '../lib/supabase';
import { TRELLIS_GENERATE_URL, trellisUsesRemoteUrl } from '../lib/trellisApi';
import { PosterImageCrop } from './PosterImageCrop';

type ModalTab = 'upload' | 'generate' | 'poster';

interface ImportModelModalProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}

export function ImportModelModal({
  userId,
  open,
  onClose,
  onAdded,
}: ImportModelModalProps) {
  const [tab, setTab] = useState<ModalTab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('24');
  const [depthIn, setDepthIn] = useState('24');
  const [clearanceIn, setClearanceIn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [decimatedFile, setDecimatedFile] = useState<File | null>(null);
  const [decimating, setDecimating] = useState(false);
  const [decimationError, setDecimationError] = useState<string | null>(null);
  const [decimationInfo, setDecimationInfo] = useState<{
    originalTriangles: number;
    finalTriangles: number;
    skipped?: boolean;
  } | null>(null);

  const [posterImageFile, setPosterImageFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterCroppedBlob, setPosterCroppedBlob] = useState<Blob | null>(null);
  const [creatingPoster, setCreatingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);

  const busy = submitting || generating || decimating || creatingPoster;

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!posterImageFile) {
      setPosterPreviewUrl(null);
      setPosterCroppedBlob(null);
      return;
    }
    const url = URL.createObjectURL(posterImageFile);
    setPosterPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterImageFile]);

  useEffect(() => {
    if (!generating) return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [generating]);

  useEffect(() => {
    if (!file) {
      setDecimatedFile(null);
      setDecimating(false);
      setDecimationError(null);
      setDecimationInfo(null);
      return;
    }

    let cancelled = false;
    setDecimatedFile(null);
    setDecimationInfo(null);
    setDecimationError(null);
    setDecimating(true);

    void decimateGlb(file).then((result) => {
      if (cancelled) return;
      setDecimatedFile(result.file);
      setDecimationInfo({
        originalTriangles: result.originalTriangles,
        finalTriangles: result.finalTriangles,
        skipped: result.skipped,
      });
      setDecimating(false);
    }).catch((err) => {
      if (cancelled) return;
      setDecimatedFile(null);
      setDecimationInfo(null);
      setDecimationError(err instanceof Error ? err.message : 'Mesh optimization failed.');
      setDecimating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const resetForm = () => {
    setTab('upload');
    setFile(null);
    setImageFile(null);
    setTitle('');
    setDescription('');
    setTagsRaw('');
    setWidthIn('24');
    setHeightIn('24');
    setDepthIn('24');
    setClearanceIn('');
    setFormError(null);
    setGenerateError(null);
    setElapsedSec(0);
    setGenerating(false);
    setDecimatedFile(null);
    setDecimating(false);
    setDecimationError(null);
    setDecimationInfo(null);
    setPosterImageFile(null);
    setPosterCroppedBlob(null);
    setPosterPreviewUrl(null);
    setPosterError(null);
    setCreatingPoster(false);
  };

  const handleDownloadDecimated = () => {
    if (!decimatedFile) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(decimatedFile);
    a.href = url;
    a.download = decimatedFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const handleGenerate = async () => {
    setGenerateError(null);

    if (!imageFile) {
      setGenerateError('Choose an image first.');
      return;
    }

    setElapsedSec(0);
    setGenerating(true);
    try {
      const fd = new FormData();
      fd.append('file', imageFile);

      const res = await fetch(TRELLIS_GENERATE_URL, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Generation failed (${res.status})`);
      }

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new Error(
          'The server returned HTML instead of a 3D model. Check that VITE_TRELLIS_GENERATE_URL points at your HTTPS Trellis API (or HTTPS BFF), not GitHub Pages.',
        );
      }

      const blob = await res.blob();
      const glbFile = new File([blob], 'generated.glb', {
        type: blob.type || 'model/gltf-binary',
      });
      setFile(glbFile);
      setTab('upload');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreatePoster = async () => {
    setPosterError(null);

    const w = Number(widthIn);
    const h = Number(heightIn);
    const d = Number(depthIn);
    if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
      setPosterError('Width, height, and depth must be positive numbers (inches).');
      return;
    }
    if (!posterCroppedBlob) {
      setPosterError('Choose an image and align the crop.');
      return;
    }

    setCreatingPoster(true);
    try {
      const glb = await createPosterGlb(posterCroppedBlob, {
        widthIn: w,
        heightIn: h,
        depthIn: d,
      });
      setFile(glb);
      setTab('upload');
      setPosterError(null);
    } catch (err) {
      setPosterError(err instanceof Error ? err.message : 'Could not build poster.');
    } finally {
      setCreatingPoster(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!file) {
      setFormError(
        'Choose a .glb/.gltf file, generate a model from an image, or create a poster.',
      );
      return;
    }
    if (decimating) {
      setFormError('Wait for mesh optimization to finish.');
      return;
    }
    const uploadFile = decimatedFile;
    if (!uploadFile) {
      setFormError(decimationError ?? 'Mesh optimization failed — fix the model file or try again.');
      return;
    }
    const label = title.trim();
    if (!label) {
      setFormError('Title is required.');
      return;
    }

    const w = Number(widthIn);
    const h = Number(heightIn);
    const d = Number(depthIn);
    if (![w, h, d].every((x) => Number.isFinite(x) && x > 0)) {
      setFormError('Width, height, and depth must be positive numbers (inches).');
      return;
    }

    let clearance: number | null = null;
    if (clearanceIn.trim() !== '') {
      const c = Number(clearanceIn);
      if (!Number.isFinite(c) || c < 0) {
        setFormError('Clearance must be a non-negative number or empty.');
        return;
      }
      clearance = c;
    }

    let tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (file.name.toLowerCase() === 'poster.glb' && !tags.some((t) => t.toLowerCase() === 'poster')) {
      tags = [...tags, 'poster'];
    }

    const ext = uploadFile.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
    const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const kind = `custom-${crypto.randomUUID()}`;
    const contentType =
      ext === 'glb' ? 'model/gltf-binary' : 'model/gltf+json';

    setSubmitting(true);
    try {
      const { error: upErr } = await supabase.storage
        .from(MODEL_FILES_BUCKET)
        .upload(objectPath, uploadFile, {
          contentType: uploadFile.type || contentType,
          upsert: false,
        });

      if (upErr) throw new Error(upErr.message);

      const { error: insErr } = await supabase.from('furniture_catalog').insert({
        kind,
        label,
        description: description.trim() || null,
        width_in: w,
        height_in: h,
        depth_in: d,
        clearance_in: clearance,
        is_builtin: false,
        model_url: objectPath,
        tags,
        user_id: userId,
      });

      if (insErr) throw new Error(insErr.message);

      await onAdded();
      resetForm();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const posterAspectRatio = (() => {
    const pw = Number(widthIn);
    const ph = Number(heightIn);
    if (
      Number.isFinite(pw) &&
      Number.isFinite(ph) &&
      pw > 0 &&
      ph > 0
    ) {
      return pw / ph;
    }
    return 18 / 24;
  })();

  if (!open) return null;

  return (
    <div className="import-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id="import-modal-title" className="import-modal-title">
          Add model to library
        </h3>
        <p className="import-modal-hint">
          Upload a GLB/GLTF, generate a mesh from an image with TRELLIS, or create a flat poster from a
          photo (crop → textured plane), then add catalog details on the Upload tab.
        </p>

        <div className="import-modal-tabs" role="tablist" aria-label="Import source">
          <button
            type="button"
            role="tab"
            className="import-modal-tab"
            aria-selected={tab === 'upload'}
            disabled={busy}
            onClick={() => {
              setTab('upload');
              setGenerateError(null);
              setPosterError(null);
            }}
          >
            Upload file
          </button>
          <button
            type="button"
            role="tab"
            className="import-modal-tab"
            aria-selected={tab === 'generate'}
            disabled={busy}
            onClick={() => {
              setTab('generate');
              setFormError(null);
              setPosterError(null);
            }}
          >
            Generate from image
          </button>
          <button
            type="button"
            role="tab"
            className="import-modal-tab"
            aria-selected={tab === 'poster'}
            disabled={busy}
            onClick={() => {
              setTab('poster');
              setFormError(null);
              setGenerateError(null);
              setPosterError(null);
              setPosterImageFile(null);
              setPosterCroppedBlob(null);
              if (widthIn === '24' && heightIn === '24' && depthIn === '24') {
                setWidthIn('18');
                setHeightIn('24');
                setDepthIn('0.25');
              }
            }}
          >
            Poster
          </button>
        </div>

        {tab === 'generate' ? (
          <div className="import-modal-generate">
            <label className="import-modal-field">
              <span>Source image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(ev) => setImageFile(ev.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </label>

            {imagePreviewUrl ? (
              <img
                className="import-modal-generate-preview"
                src={imagePreviewUrl}
                alt="Preview of selected image"
              />
            ) : null}

            {generating ? (
              <p className="import-modal-generate-status" aria-live="polite">
                Generating 3D model… {elapsedSec}s elapsed (this may take several minutes)
              </p>
            ) : (
              <p className="import-modal-generate-status">
                {trellisUsesRemoteUrl ? (
                  <>
                    Uses your configured TRELLIS endpoint (HTTPS). If this fails, confirm CORS on the API
                    and that the URL is not blocked (mixed content).
                  </>
                ) : (
                  <>
                    Local: proxied to TRELLIS via Vite or{' '}
                    <code className="import-modal-code">3DVisSim/server</code> at{' '}
                    <code className="import-modal-code">/api/trellis/generate</code> (configure{' '}
                    <code className="import-modal-code">TRELLIS_UPSTREAM_ORIGIN</code> in{' '}
                    <code className="import-modal-code">.env.local</code>). Use{' '}
                    <code className="import-modal-code">npm run dev</code>,{' '}
                    <code className="import-modal-code">npm run preview</code>, or run the Express server.
                  </>
                )}
              </p>
            )}

            {generateError ? (
              <div className="import-modal-error" role="alert">
                {generateError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              <button
                type="button"
                className="import-modal-btn secondary"
                onClick={handleClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn primary"
                onClick={() => void handleGenerate()}
                disabled={busy}
              >
                {generating ? 'Generating…' : 'Generate 3D model'}
              </button>
            </div>
          </div>
        ) : tab === 'poster' ? (
          <div className="import-modal-generate">
            <p className="import-modal-generate-status">
              Set poster size first (aspect ratio locks the crop), pick a photo, pan and zoom inside the frame,
              then create a textured flat GLB. You can tweak catalog dimensions again on Upload before saving.
            </p>

            <div className="import-modal-dims">
              <label className="import-modal-field">
                <span>Width (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="import-modal-field">
                <span>Height (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="import-modal-field">
                <span>Depth (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={depthIn}
                  onChange={(e) => setDepthIn(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>

            <label className="import-modal-field">
              <span>Poster image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(ev) => setPosterImageFile(ev.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </label>

            <PosterImageCrop
              imageUrl={posterPreviewUrl}
              aspect={posterAspectRatio}
              disabled={busy}
              onCropped={setPosterCroppedBlob}
            />

            {posterError ? (
              <div className="import-modal-error" role="alert">
                {posterError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              <button
                type="button"
                className="import-modal-btn secondary"
                onClick={handleClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="import-modal-btn primary"
                onClick={() => void handleCreatePoster()}
                disabled={busy || !posterCroppedBlob}
              >
                {creatingPoster ? 'Creating…' : 'Create poster'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <label className="import-modal-field">
              <span>Model file (.glb / .gltf)</span>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                disabled={submitting || decimating}
              />
            </label>

            {decimating ? (
              <p className="import-modal-generate-status" aria-live="polite">
                Optimizing mesh… (may take a minute on large models)
              </p>
            ) : null}

            {decimationInfo?.skipped ? (
              <p className="import-modal-decimate-skip">
                Polygon reduction applies to <strong>.glb</strong> only; .gltf files are uploaded as-is.
              </p>
            ) : null}

            {decimationInfo && !decimationInfo.skipped && decimationInfo.originalTriangles > 0 ? (
              <div className="import-modal-decimate-info">
                {decimationInfo.originalTriangles.toLocaleString()} →{' '}
                {decimationInfo.finalTriangles.toLocaleString()} triangles (≤50K target)
              </div>
            ) : null}

            {decimationError ? (
              <div className="import-modal-error" role="alert">
                {decimationError}
              </div>
            ) : null}

            {decimatedFile && !decimating && (file?.name?.toLowerCase() ?? '').endsWith('.glb') ? (
              <button
                type="button"
                className="import-modal-decimate-btn"
                onClick={handleDownloadDecimated}
                disabled={submitting}
              >
                Download 50K polygon version
              </button>
            ) : null}

            {file?.name === 'generated.glb' ? (
              <p className="import-modal-generate-hint">
                Using AI-generated model. Adjust dimensions below, then add to library.
              </p>
            ) : null}

            {file?.name?.toLowerCase() === 'poster.glb' ? (
              <p className="import-modal-generate-hint">
                Using flat poster from your cropped image. Adjust dimensions below if needed, then add to library.
              </p>
            ) : null}

            <label className="import-modal-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  file?.name?.toLowerCase() === 'poster.glb'
                    ? 'e.g. Poster'
                    : 'e.g. Reading Armchair'
                }
                disabled={submitting || decimating}
                autoComplete="off"
              />
            </label>

            <label className="import-modal-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                rows={3}
                disabled={submitting || decimating}
              />
            </label>

            <label className="import-modal-field">
              <span>Tags (comma-separated)</span>
              <input
                type="text"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="storage, bedroom, modern"
                disabled={submitting || decimating}
                autoComplete="off"
              />
            </label>

            <div className="import-modal-dims">
              <label className="import-modal-field">
                <span>Width (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Height (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Depth (in)</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={depthIn}
                  onChange={(e) => setDepthIn(e.target.value)}
                  disabled={submitting || decimating}
                />
              </label>
              <label className="import-modal-field">
                <span>Clearance (in, optional)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={clearanceIn}
                  onChange={(e) => setClearanceIn(e.target.value)}
                  placeholder="—"
                  disabled={submitting || decimating}
                />
              </label>
            </div>

            {formError ? (
              <div className="import-modal-error" role="alert">
                {formError}
              </div>
            ) : null}

            <div className="import-modal-actions">
              <button
                type="button"
                className="import-modal-btn secondary"
                onClick={handleClose}
                disabled={submitting || decimating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="import-modal-btn primary"
                disabled={submitting || decimating || !decimatedFile}
              >
                {submitting ? 'Saving…' : 'Add to library'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
